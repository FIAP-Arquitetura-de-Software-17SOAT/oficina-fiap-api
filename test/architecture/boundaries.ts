import { Dirent, readFileSync, readdirSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const projectRoot = resolve(__dirname, '../..');
const modulesRoot = resolve(projectRoot, 'src/modules');
const sharedRoot = resolve(projectRoot, 'src/shared');
const sharedDomainRoot = resolve(sharedRoot, 'domain');
const sharedApplicationRoot = resolve(sharedRoot, 'application');
/** `shared/identity` tem as mesmas camadas de um módulo e obedece à mesma regra. */
const identityRoot = resolve(sharedRoot, 'identity');

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

type Layer = 'domain' | 'application' | 'outer';

function layerOf(file: string, moduleRoot: string): Layer | undefined {
  if (within(file, resolve(moduleRoot, 'domain'))) return 'domain';
  if (within(file, resolve(moduleRoot, 'application'))) return 'application';
  if (
    within(file, resolve(moduleRoot, 'infrastructure')) ||
    within(file, resolve(moduleRoot, 'presentation'))
  )
    return 'outer';
  return undefined;
}

/** Todos os módulos em `src/modules`; a partir da PR10 todos são migrados. */
export function allModules(): string[] {
  return readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Diretórios que um arquivo de `domain/` ou `application/` pode importar.
 * A regra é a mesma para todo módulo:
 *   domain      -> próprio domain, shared/domain, shared/identity/domain
 *   application -> os de cima + próprio application + shared/application
 *                  + shared/identity/application (só portas)
 */
function allowedRoots(moduleRoot: string, layer: Layer): string[] {
  const roots = [
    resolve(moduleRoot, 'domain'),
    sharedDomainRoot,
    resolve(identityRoot, 'domain'),
  ];
  if (layer === 'application') {
    roots.push(
      resolve(moduleRoot, 'application'),
      sharedApplicationRoot,
      resolve(identityRoot, 'application'),
    );
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
 * `infrastructure/` e `presentation/` podem importar qualquer coisa do próprio
 * módulo, de `shared`, de bibliotecas e do Prisma gerado. De **outro** módulo,
 * só `domain/` e `application/`: adapter conversa com caso de uso e erro de
 * aplicação, nunca com o repositório Prisma ou o controller do vizinho.
 */
function outerViolationsFor(
  moduleRoot: string,
  file: string,
  source: string,
): string[] {
  const violations: string[] = [];
  for (const specifier of dependencies(file, source)) {
    if (specifier !== null && isBuiltin(specifier)) continue;
    const dependency =
      specifier === null ? undefined : resolveDependency(specifier, file);
    if (!dependency) {
      violations.push(
        `${relative(projectRoot, file)} -> ${specifier ?? 'non-literal import'}`,
      );
      continue;
    }
    if (
      dependency.external ||
      dependency.target.endsWith('.spec.ts') ||
      !within(dependency.target, modulesRoot) ||
      within(dependency.target, moduleRoot)
    )
      continue;
    const otherModule = dependency.target
      .slice(modulesRoot.length + 1)
      .split(sep)[0];
    const publicRoots = ['domain', 'application'].map((layer) =>
      resolve(modulesRoot, otherModule, layer),
    );
    if (!publicRoots.some((root) => within(dependency.target, root)))
      violations.push(`${relative(projectRoot, file)} -> ${specifier}`);
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
      `${relative(projectRoot, file)} is not under a layer of ${moduleName}`,
    );
  }
  if (layer === 'outer') return outerViolationsFor(moduleRoot, file, source);
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

/** Verifica as quatro camadas de um módulo. */
export function checkModule(moduleName: string): string[] {
  const moduleRoot = resolve(modulesRoot, moduleName);
  return ['domain', 'application', 'infrastructure', 'presentation']
    .flatMap((layer) => sourceFiles(resolve(moduleRoot, layer)))
    .flatMap((file) =>
      inspectDependencies(moduleName, file, readFileSync(file, 'utf8')),
    );
}

/**
 * `shared/domain`, `shared/application` e o núcleo de `shared/identity` são
 * verificados também: sem isso eles virariam porta dos fundos para um
 * framework entrar no núcleo.
 */
export function checkShared(): string[] {
  const identityDomain = resolve(identityRoot, 'domain');
  const identityApplication = resolve(identityRoot, 'application');
  const check = (root: string, allowed: string[]) =>
    sourceFiles(root).flatMap((file) =>
      violationsFor(file, readFileSync(file, 'utf8'), allowed),
    );
  return [
    ...check(sharedDomainRoot, [sharedDomainRoot]),
    ...check(sharedApplicationRoot, [sharedDomainRoot, sharedApplicationRoot]),
    ...check(identityDomain, [sharedDomainRoot, identityDomain]),
    ...check(identityApplication, [
      sharedDomainRoot,
      sharedApplicationRoot,
      identityDomain,
      identityApplication,
    ]),
  ];
}
