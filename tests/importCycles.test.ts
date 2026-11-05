import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ningun ciclo de imports en src/ (docs/ESTILO.md, regla 14). Un ciclo hace que el orden de carga
 * decida que vale `undefined` al arrancar (paso con content → rulesSchema → predicates → content).
 * Solo cuentan los imports que existen al ejecutar: `import type` y los `{ type X }` sueltos se borran.
 * Mas barato que eslint-plugin-import: lee los ficheros y recorre el grafo.
 */
const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const EXTENSIONS = ['.ts', '.tsx'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.some((ext) => name.endsWith(ext)) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@core/')
    ? join(SRC, 'core', spec.slice('@core/'.length))
    : spec.startsWith('.')
      ? resolve(dirname(from), spec)
      : null;
  if (base === null) return null;
  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => join(base, 'index' + ext))];
  return candidates.find((path) => EXTENSIONS.some((ext) => path.endsWith(ext)) && isFile(path)) ?? null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Los modulos que este fichero carga al ejecutarse (sin los imports de solo tipos). */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  const statement = /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(statement)) {
    const sideEffect = match[5];
    if (sideEffect !== undefined) {
      found.push(sideEffect);
      continue;
    }
    if (match[2] !== undefined) continue;
    const names = match[3] ?? '';
    const braces = /\{([\s\S]*)\}/.exec(names);
    const onlyTypes =
      braces !== null &&
      !/^[^{]*\w/.test(names.replace(/\{[\s\S]*\}/, '')) &&
      braces[1]!.split(',').every((name) => name.trim() === '' || name.trim().startsWith('type '));
    if (!onlyTypes) found.push(match[4]!);
  }
  return found.flatMap((spec) => resolveImport(file, spec) ?? []);
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null;
    if (state.get(node) === 'open') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'open');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

describe('imports', () => {
  it('no hay ciclos de imports en src/', () => {
    const graph = new Map(sourceFiles(SRC).map((file) => [file, runtimeImports(file)]));
    const cycle = findCycle(graph);
    expect(cycle?.map((file) => relative(ROOT, file)).join(' → ') ?? null).toBeNull();
  });

  it('el detector ve el ciclo de content → rulesSchema → predicates → content', () => {
    const graph = new Map([
      ['content', ['rulesSchema']],
      ['rulesSchema', ['predicates']],
      ['predicates', ['content']],
    ]);
    expect(findCycle(graph)).toEqual(['content', 'rulesSchema', 'predicates', 'content']);
  });
});
