import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { dependencies, projectRoot, resolveDependency } from './boundaries';

const modulesRoot = resolve(projectRoot, 'src/modules');

function moduleNameOf(file: string): string | undefined {
  if (!file.startsWith(modulesRoot + sep)) return undefined;
  return relative(modulesRoot, file).split(sep)[0];
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory()
      ? walk(file)
      : file.endsWith('.ts') && !file.endsWith('.spec.ts')
        ? [file]
        : [];
  });
}

/**
 * Grafo entre módulos de `src/modules`, com uma aresta A -> B para cada
 * `import` de um `*.module.ts` de B feito pelo `*.module.ts` de A.
 */
export function moduleGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of walk(modulesRoot).filter((f) =>
    f.endsWith('.module.ts'),
  )) {
    const from = moduleNameOf(file);
    if (!from) continue;
    const edges = graph.get(from) ?? new Set<string>();
    graph.set(from, edges);
    for (const specifier of dependencies(file, readFileSync(file, 'utf8'))) {
      if (specifier === null) continue;
      const dependency = resolveDependency(specifier, file);
      if (!dependency || dependency.external) continue;
      if (!dependency.target.endsWith('.module.ts')) continue;
      const to = moduleNameOf(dependency.target);
      if (to && to !== from) edges.add(to);
    }
  }
  return graph;
}

/**
 * Componentes fortemente conexos com mais de um módulo, ou seja, os ciclos.
 * Cada componente vem ordenado e a lista também, para comparação estável.
 */
export function moduleCycles(graph = moduleGraph()): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (node: string): void => {
    indices.set(node, index);
    lowlink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indices.has(next)) {
        connect(next);
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(next)!));
      } else if (onStack.has(next)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, indices.get(next)!));
      }
    }
    if (lowlink.get(node) === indices.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };

  for (const node of [...graph.keys()].sort()) {
    if (!indices.has(node)) connect(node);
  }
  return components.sort((a, b) => a.join().localeCompare(b.join()));
}

/** Arquivos de produção em `src/modules` que usam `forwardRef`. */
export function forwardRefUsages(): string[] {
  return walk(modulesRoot)
    .filter((file) => {
      const ast = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      let found = false;
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === 'forwardRef') found = true;
        if (!found) ts.forEachChild(node, visit);
      };
      visit(ast);
      return found;
    })
    .map((file) => relative(projectRoot, file))
    .sort();
}
