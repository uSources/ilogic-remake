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
  /** Valor del ejercito de cada bando al empezar cada dia (para la grafica final). */
  army?: [number, number][];
}

/** Valor de un ejercito: coste de cada unidad por su vida. */
export function armyValue(s: GameState, team: Team): number {
  let v = 0;
  for (const u of s.units) if (u.team === team) v += (UNIT.cost[u.type]! * u.life) / 100;
  return Math.round(v);
}

/** Apunta el valor de los dos ejercitos del dia actual (una muestra por dia). */
export function sampleArmy(s: GameState): void {
  const st = stats(s);
  const a = (st.army ??= []);
  const v: [number, number] = [armyValue(s, 0), armyValue(s, 1)];
  const i = Math.max(0, s.day - 1);
  if (i < a.length) a[i] = v;
  else {
    // Dias sin muestra (partidas antiguas): repetir la ultima.
    while (a.length < i) a.push(a[a.length - 1] ?? v);
    a.push(v);
  }
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
    default:
      // Mover, unir, subir y esperar no cuentan para las estadisticas.
      break;
  }
}

/** Valida las estadisticas leidas de una partida guardada (las antiguas no las tienen). */
export function sanitizeStats(v: unknown): GameStats {
  const ok = (a: unknown): a is [number, number] =>
    Array.isArray(a) && a.length === 2 && a.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
  const o = (v ?? {}) as Partial<GameStats>;
  if (!(ok(o.built) && ok(o.spent) && ok(o.lost) && ok(o.captured))) return emptyStats();
  const out: GameStats = { built: o.built, spent: o.spent, lost: o.lost, captured: o.captured };
  if (Array.isArray(o.army) && o.army.length <= 5000 && o.army.every(ok)) out.army = o.army;
  return out;
}
