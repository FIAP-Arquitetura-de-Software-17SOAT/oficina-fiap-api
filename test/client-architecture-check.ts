import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const projectRoot = resolve(__dirname, '..');
const clientRoot = resolve(projectRoot, 'src/modules/client');
const domainRoot = resolve(clientRoot, 'domain');
const applicationRoot = resolve(clientRoot, 'application');
const sharedDomainRoot = resolve(projectRoot, 'src/shared/domain');
const configPath = resolve(projectRoot, 'tsconfig.json');
const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
const options = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  projectRoot,
).options;

function within(file: string, directory: string): boolean {
  return file.startsWith(directory + sep);
}

function dependencies(file: string, source: string): Array<string | null> {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: Array<string | null> = [];
  const add = (node: ts.Node) =>
    imports.push(ts.isStringLiteralLike(node) ? node.text : null);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression
      )
        add(node.moduleReference.expression);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      if (node.arguments[0]) add(node.arguments[0]);
      else imports.push(null);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
}

/** Resolves imports using the project's compiler configuration, including aliases. */
export function inspectClientDependencies(
  file: string,
  source: string,
): string[] {
  const violations: string[] = [];
  const isDomain = within(file, domainRoot) || within(file, sharedDomainRoot);
  for (const specifier of dependencies(file, source)) {
    if (specifier === 'crypto' || specifier === 'node:crypto') continue;
    const dependency =
      specifier === null
        ? undefined
        : ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
    const target = dependency && resolve(dependency.resolvedFileName);
    const allowed =
      target &&
      !dependency.isExternalLibraryImport &&
      !target.endsWith('.spec.ts') &&
      (within(target, domainRoot) ||
        within(target, sharedDomainRoot) ||
        (!isDomain && within(target, applicationRoot)));
    if (!allowed)
      violations.push(
        `${relative(projectRoot, file)} -> ${specifier ?? 'non-literal import'}`,
      );
  }
  return violations;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : file.endsWith('.ts') && !file.endsWith('.spec.ts')
        ? [file]
        : [];
  });
}

export function checkClientArchitecture(): string[] {
  // Shared domain is checked too: otherwise it could act as a back door to a framework.
  return [domainRoot, applicationRoot, sharedDomainRoot]
    .flatMap(sourceFiles)
    .flatMap((file) =>
      inspectClientDependencies(file, readFileSync(file, 'utf8')),
    );
}
