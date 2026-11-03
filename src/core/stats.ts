import { UNIT } from './data';
import { AI_TEAM, PLAYER, opponentOf } from './util/predicates';
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
  let value = 0;
  for (const unit of s.units) if (unit.team === team) value += (UNIT.cost[unit.type]! * unit.life) / 100;
  return Math.round(value);
}

/** Apunta el valor de los dos ejercitos del dia actual (una muestra por dia). */
export function sampleArmy(s: GameState): void {
  const samples = (stats(s).army ??= []);
  const today: [number, number] = [armyValue(s, PLAYER), armyValue(s, AI_TEAM)];
  const dayIndex = Math.max(0, s.day - 1);
  if (dayIndex < samples.length) {
    samples[dayIndex] = today;
    return;
  }
  // Dias sin muestra (partidas antiguas): repetir la ultima.
  while (samples.length < dayIndex) samples.push(samples[samples.length - 1] ?? today);
  samples.push(today);
}

export const emptyStats = (): GameStats => ({ built: [0, 0], spent: [0, 0], lost: [0, 0], captured: [0, 0] });

export function stats(s: GameState): GameStats {
  if (!s.stats) s.stats = emptyStats();
  return s.stats;
}

/** Apunta un evento ya aplicado al estado. `team` = bando que lo ha hecho. */
export function recordEvent(s: GameState, event: GameEvent, team: Team): void {
  const counts = stats(s);
  switch (event.kind) {
    case 'attack':
      if (event.killed) counts.lost[opponentOf(team)]++;
      if (event.attackerKilled) counts.lost[team]++;
      break;
    case 'capture':
      // Con captura por puntos, solo cuenta cuando se termina.
      if (event.left === undefined || event.left === 0) counts.captured[team]++;
      break;
    case 'spawn': {
      const built = s.units.find((unit) => unit.uid === event.uid);
      if (built) {
        counts.built[team]++;
        counts.spent[team] += UNIT.cost[built.type]!;
      }
      break;
    }
    default:
      // Mover, unir, subir y esperar no cuentan para las estadisticas.
      break;
  }
}

/** Muestras de ejercito que se aceptan de una partida guardada (una por dia; mas es un fichero roto). */
const MAX_ARMY_SAMPLES = 5000;

/** Un par [jugador, IA] de enteros no negativos. */
function isCountPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0);
}

/** Valida las estadisticas leidas de una partida guardada (las antiguas no las tienen). */
export function sanitizeStats(v: unknown): GameStats {
  const saved = (v ?? {}) as Partial<GameStats>;
  if (!(isCountPair(saved.built) && isCountPair(saved.spent) && isCountPair(saved.lost) && isCountPair(saved.captured)))
    return emptyStats();
  const clean: GameStats = { built: saved.built, spent: saved.spent, lost: saved.lost, captured: saved.captured };
  const army = saved.army;
  if (Array.isArray(army) && army.length <= MAX_ARMY_SAMPLES && army.every(isCountPair)) clean.army = army;
  return clean;
}
