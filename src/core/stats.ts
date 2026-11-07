/**
 * Estadisticas de cada equipo para la pantalla final (TeamState.stats): lo que ha fabricado y
 * gastado, lo que ha perdido y capturado, y el valor de su ejercito cada dia.
 */
import { entryOf } from './content';
import { emptyTeamStats, teamState } from './teams';
import { lifeValue } from './unitValue';
import { teamUnits } from './rules/queries';
import { hooksOf } from './ruleModules/ruleset';
import type { GameEvent, GameEventKind, GameEventOf, GameState, TeamId, TeamStats } from './model';

/** Valor de un ejercito: lo que vale la vida de cada unidad (lifeValue), redondeado. */
export function armyValue(s: GameState, team: TeamId): number {
  return Math.round(teamUnits(s, team).reduce((value, unit) => value + lifeValue(s, unit.life, unit), 0));
}

/** Apunta en un equipo el valor de su ejercito del dia actual (una muestra por dia). */
function sampleTeamArmy(s: GameState, stats: TeamStats, today: number): void {
  const samples = stats.army;
  const dayIndex = Math.max(0, s.day - 1);
  if (dayIndex < samples.length) {
    samples[dayIndex] = today;
    return;
  }
  // Dias sin muestra (unas estadisticas rotas que se vaciaron al leer la partida): repetir la ultima.
  while (samples.length < dayIndex) samples.push(samples[samples.length - 1] ?? today);
  samples.push(today);
}

/** Apunta el valor del ejercito de cada equipo del dia actual (al crear la partida y al empezar cada dia). */
export function sampleArmy(s: GameState): void {
  for (const team of s.teams) sampleTeamArmy(s, team.stats, armyValue(s, team.id));
}

/**
 * El valor del ejercito de un equipo cada dia, hasta hoy: el de las muestras de los dias pasados y,
 * hoy, el de ahora (asi la grafica del final acaba en como ha acabado). Solo lee.
 */
export function armyByDay(s: GameState, team: TeamId): number[] {
  const samples = teamState(s, team).stats.army;
  const pastDays = Math.max(0, s.day - 1);
  return [...Array.from({ length: pastDays }, (_, day) => samples[day] ?? 0), armyValue(s, team)];
}

/** Las estadisticas de un equipo, para leerlas. */
export function statsOf(s: GameState, team: TeamId): Readonly<TeamStats> {
  return teamState(s, team).stats;
}

/** Lo que apunta un suceso en las estadisticas: en las de quien lo ha hecho (`counts`) y, si toca, en las de otro equipo. */
export type StatCounter<K extends GameEventKind> = (s: GameState, counts: TeamStats, event: GameEventOf<K>) => void;

/**
 * Los sucesos que cuentan para las estadisticas, por su tipo; los demas no (mover, unir, subir,
 * esperar, ordenes, escuadras, poderes). Un suceso nuevo que cuente es una entrada aqui; lo que cuenta
 * un modulo de reglas (de sus sucesos o de los de siempre), un `statCounters` suyo.
 */
export const STAT_COUNTERS: { readonly [K in GameEventKind]?: StatCounter<K> } = {
  attack: (s, counts, event) => {
    if (event.killed) teamState(s, event.combat.defenderTeam).stats.lost++;
    if (event.attackerKilled) counts.lost++;
  },
  capture: (_s, counts, event) => {
    // Con captura por puntos, solo cuenta cuando se termina.
    if (event.left === 0) counts.captured++;
  },
  spawn: (s, counts, event) => {
    counts.built++;
    counts.spent += entryOf(s.content.units, event.unitType, 'unidad').cost;
  },
};

/** Lo que cuenta un suceso, con su tipo (TypeScript no lo deduce solo al indexar la tabla). */
function counterFor<K extends GameEventKind>(event: GameEventOf<K>): StatCounter<K> | undefined {
  const counters: { readonly [L in GameEventKind]?: StatCounter<L> } = STAT_COUNTERS;
  return counters[event.kind];
}

/**
 * Apunta un evento ya aplicado al estado en las estadisticas de quien lo ha hecho (`actor`): lo de
 * STAT_COUNTERS y lo de los modulos de la partida. Lo de la propia partida (el fin de ronda) no cuenta.
 */
export function recordEvent(s: GameState, event: GameEvent): void {
  if (event.actor === null) return;
  const counts = teamState(s, event.actor).stats;
  counterFor(event)?.(s, counts, event);
  for (const counter of hooksOf(s, 'statCounters')) counter.count(s, counts, event);
}

/** Apunta los sucesos de una accion ya hecha (dispatch lo hace con todas: las estadisticas salen de los sucesos). */
export function recordEvents(s: GameState, events: readonly GameEvent[]): void {
  for (const event of events) recordEvent(s, event);
}

/** Muestras de ejercito que se aceptan de una partida guardada (una por dia; mas es un fichero roto). */
const MAX_ARMY_SAMPLES = 5000;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Valida las estadisticas de un equipo leidas de una partida guardada (si estan rotas, a cero). */
export function sanitizeTeamStats(value: unknown): TeamStats {
  const { built, spent, lost, captured, army } = (value ?? {}) as Partial<TeamStats>;
  if (!isCount(built) || !isCount(spent) || !isCount(lost) || !isCount(captured)) return emptyTeamStats();
  const isValidArmy = Array.isArray(army) && army.length <= MAX_ARMY_SAMPLES && army.every(isCount);
  return { built, spent, lost, captured, army: isValidArmy ? army : [] };
}
