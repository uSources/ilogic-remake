import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = join(__dirname, '../src/core');

/** El fichero al que lleva un import relativo (con .ts o su index.ts). */
function resolveImport(from: string, spec: string): string | null {
  const base = join(dirname(from), spec);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base])
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  return null;
}

/** Todos los ficheros del nucleo que carga `entry`, siguiendo sus imports (los de tipos no cargan nada). */
function loadedBy(entry: string): Set<string> {
  const seen = new Set<string>();
  const pending = [join(CORE, entry)];
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)) {
      const target = resolveImport(file, match[1]!);
      if (target) pending.push(target);
    }
  }
  return new Set([...seen].map((file) => relative(CORE, file)));
}

const isAi = (file: string) => /^(ai\/|ai\.ts$|controllers\/|controllers\.ts$)/.test(file);

/** Una partida se juega, se repite o se lleva en un servidor sin cargar la IA (docs/ARQUITECTURA.md, capas). */
describe('capas: la IA es un jugador mas', () => {
  it.each(['session.ts', 'actions.ts', 'autopilot.ts', 'rules.ts'])('%s no carga nada de la IA', (entry) => {
    expect([...loadedBy(entry)].filter(isAi)).toEqual([]);
  });

  it('core/controllers.ts si la carga (para comprobar que la prueba mira de verdad)', () => {
    expect([...loadedBy('controllers.ts')].some(isAi)).toBe(true);
    expect(loadedBy('controllers.ts').has('ai.ts')).toBe(true);
  });
});

const sendsActions = (file: string) => /^(actions\/dispatch\.ts|session\.ts|session\/)/.test(file);

/** I1: quien decide solo propone; ni la IA ni autopilot/ cargan dispatch ni la sesion (ni de lejos). */
describe('capas: quien decide no manda', () => {
  it.each(['ai.ts', 'autopilot.ts', 'playerView.ts'])('%s no carga dispatch ni la sesion', (entry) => {
    expect([...loadedBy(entry)].filter(sendsActions)).toEqual([]);
  });

  it('core/controllers.ts si (es quien la hace jugar por la sesion)', () => {
    expect([...loadedBy('controllers.ts')].some(sendsActions)).toBe(true);
  });
});
