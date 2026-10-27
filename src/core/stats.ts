import { UNIT } from './data';
import type { GameEvent, GameState, Team } from './types';

/** Estadisticas de la partida, por bando [jugador, IA] (para la pantalla final). */
export interface GameStats {
  built: [number, number];
  spent: [number, number];
  /** Unidades perdidas (destruidas o estrelladas). */
  lost: [number, number];
  /** Edificios ganados o neutralizados. */
  captured: [number, number];
}

export const emptyStats = (): GameStats => ({ built: [0, 0], spent: [0, 0], lost: [0, 0], captured: [0, 0] });

export function stats(s: GameState): GameStats {
  if (!s.stats) s.stats = emptyStats();
  return s.stats;
}

/** Apunta un evento ya aplicado al estado. `team` = bando que lo ha hecho. */
export function recordEvent(s: GameState, ev: GameEvent, team: Team): void {
  const st = stats(s);
  const other = (1 - team) as Team;
  switch (ev.kind) {
    case 'attack':
      if (ev.killed) st.lost[other]++;
      if (ev.attackerKilled) st.lost[team]++;
      break;
    case 'capture':
      // Con captura por puntos, solo cuenta cuando se termina.
      if (ev.left === undefined || ev.left === 0) st.captured[team]++;
      break;
    case 'spawn': {
      const u = s.units.find((x) => x.uid === ev.uid);
      if (u) {
        st.built[team]++;
        st.spent[team] += UNIT.cost[u.type]!;
      }
      break;
    }
  }
}

/** Valida las estadisticas leidas de una partida guardada (las antiguas no las tienen). */
export function sanitizeStats(v: unknown): GameStats {
  const ok = (a: unknown): a is [number, number] =>
    Array.isArray(a) && a.length === 2 && a.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
  const o = (v ?? {}) as Partial<GameStats>;
  return ok(o.built) && ok(o.spent) && ok(o.lost) && ok(o.captured) ? { built: o.built, spent: o.spent, lost: o.lost, captured: o.captured } : emptyStats();
}
