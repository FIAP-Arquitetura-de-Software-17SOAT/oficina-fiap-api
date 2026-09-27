import { Dirent, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const projectRoot = resolve(__dirname, '../..');
const modulesRoot = resolve(projectRoot, 'src/modules');
const sharedDomainRoot = resolve(projectRoot, 'src/shared/domain');
const sharedApplicationRoot = resolve(projectRoot, 'src/shared/application');

const configPath = resolve(projectRoot, 'tsconfig.json');
const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
const options = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  projectRoot,
).options;

function within(file: string, directory: string): boolean {
  return file === directory || file.startsWith(directory + sep);
}

/** Todos os especificadores importados por um arquivo, inclusive dinâmicos. */
export function dependencies(
  file: string,
  source: string,
): Array<string | null> {
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

export function resolveDependency(
  specifier: string,
  from: string,
): { target: string; external: boolean } | undefined {
  const resolved = ts.resolveModuleName(
    specifier,
    from,
    options,
    ts.sys,
  ).resolvedModule;
  if (!resolved) return undefined;
  return {
    target: resolve(resolved.resolvedFileName),
    external: resolved.isExternalLibraryImport ?? false,
  };
}

type Layer = 'domain' | 'application';

function layerOf(file: string, moduleRoot: string): Layer | undefined {
  if (within(file, resolve(moduleRoot, 'domain'))) return 'domain';
  if (within(file, resolve(moduleRoot, 'application'))) return 'application';
  return undefined;
}

/**
 * Diretórios que um arquivo de `domain/` ou `application/` pode importar.
 * A regra é a mesma para todo módulo migrado:
 *   domain      -> próprio domain, shared/domain
 *   application -> os de cima + próprio application + shared/application
 */
function allowedRoots(moduleRoot: string, layer: Layer): string[] {
  const roots = [resolve(moduleRoot, 'domain'), sharedDomainRoot];
  if (layer === 'application') {
    roots.push(resolve(moduleRoot, 'application'), sharedApplicationRoot);
  }
  return roots;
}

function violationsFor(
  file: string,
  source: string,
  allowed: string[],
): string[] {
  const violations: string[] = [];
  for (const specifier of dependencies(file, source)) {
    if (specifier === 'crypto' || specifier === 'node:crypto') continue;
    const dependency =
      specifier === null ? undefined : resolveDependency(specifier, file);
    const ok =
      dependency &&
      !dependency.external &&
      !dependency.target.endsWith('.spec.ts') &&
      allowed.some((root) => within(dependency.target, root));
    if (!ok)
      violations.push(
        `${relative(projectRoot, file)} -> ${specifier ?? 'non-literal import'}`,
      );
  }
  return violations;
}

/**
 * Inspeciona um arquivo de `src/modules/<module>/{domain,application}` a
 * partir do seu código-fonte (o arquivo não precisa existir; serve para
 * testar o próprio verificador).
 */
export function inspectDependencies(
  moduleName: string,
  file: string,
  source: string,
): string[] {
  const moduleRoot = resolve(modulesRoot, moduleName);
  const layer = layerOf(file, moduleRoot);
  if (!layer) {
    throw new Error(
      `${relative(projectRoot, file)} is not under ${moduleName}/domain or ${moduleName}/application`,
    );
  }
  return violationsFor(file, source, allowedRoots(moduleRoot, layer));
}

function sourceFiles(directory: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : file.endsWith('.ts') && !file.endsWith('.spec.ts')
        ? [file]
        : [];
  });
}

/** Verifica `domain/` e `application/` de um módulo migrado. */
export function checkModule(moduleName: string): string[] {
  const moduleRoot = resolve(modulesRoot, moduleName);
  return ['domain', 'application']
    .flatMap((layer) => sourceFiles(resolve(moduleRoot, layer)))
    .flatMap((file) =>
      inspectDependencies(moduleName, file, readFileSync(file, 'utf8')),
    );
}

/**
 * `shared/domain` e `shared/application` são verificados também: sem isso
 * eles virariam porta dos fundos para um framework entrar no núcleo.
 */
export function checkShared(): string[] {
  return [
    ...sourceFiles(sharedDomainRoot).flatMap((file) =>
      violationsFor(file, readFileSync(file, 'utf8'), [sharedDomainRoot]),
    ),
    ...sourceFiles(sharedApplicationRoot).flatMap((file) =>
      violationsFor(file, readFileSync(file, 'utf8'), [
        sharedDomainRoot,
        sharedApplicationRoot,
      ]),
    ),
  ];
}
