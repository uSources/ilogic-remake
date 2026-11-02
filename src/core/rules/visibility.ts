/**
 * Vision y niebla: que casillas ve cada bando.
 */
import { BUILDING, HIDING_TERRAIN, RULES, UNIT } from '../data';
import { abilityOf } from '../abilities';
import { diamond, grid, manhattan } from '../geom';
import { revealsAll } from '../generals';
import { weatherVision } from '../weather';
import type { GameState, Team, Unit } from '../types';

/** Radio de vision de una unidad. [CAMBIO] El clima puede quitar vision (nunca por debajo de 1 si ve). */
export function visionOf(s: GameState, u: Unit): number {
  const base = UNIT.vision[u.type]!;
  return base > 0 ? Math.max(1, base + weatherVision(s)) : base;
}

/** Casillas visibles para un bando: rombo de vision de sus unidades + casillas de sus edificios. */
export function visibility(s: GameState, team: Team): boolean[][] {
  // [CAMBIO] partida sin niebla, o el general ha usado reconocimiento: se ve todo.
  if (!RULES.fog || revealsAll(s, team)) return grid(true);
  const vis = grid(false);
  // [CAMBIO] Reglas nuevas: el bosque solo se ve desde al lado (o desde dentro).
  const hides = RULES.forestHides ? (x: number, y: number) => HIDING_TERRAIN.includes(s.map[x]![y]!) : () => false;
  for (const u of s.units) {
    if (u.team !== team || u.carrier !== null) continue;
    // [CAMBIO] Habilidad scout (Jeep): ve dentro del bosque en todo su radio.
    const scout = !!abilityOf(u.type, 'scout');
    for (const p of diamond(u, 0, visionOf(s, u))) if (scout || !hides(p.x, p.y) || manhattan(u, p) <= 1) vis[p.x]![p.y] = true;
  }
  for (const b of s.buildings) {
    if (b.owner !== team) continue;
    for (const p of diamond(b, 0, BUILDING.vision[b.type]!)) vis[p.x]![p.y] = true;
  }
  return vis;
}
