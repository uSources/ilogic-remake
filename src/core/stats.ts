/**
 * Estadisticas de cada equipo para la pantalla final (TeamState.stats): lo que ha fabricado y
 * gastado, lo que ha perdido y capturado, y el valor de su ejercito cada dia.
 */
import { unitTypeOf } from './gameContent';
import { emptyTeamStats, teamState } from './teams';
import { isOnMap } from './util/predicates';
import type { GameEvent, GameState, TeamId, TeamStats } from './model';

/** Valor de un ejercito: coste de cada unidad por su vida. */
export function armyValue(s: GameState, team: TeamId): number {
  let value = 0;
  for (const unit of s.units) if (unit.team === team) value += (unitTypeOf(s, unit).cost * unit.life) / 100;
  return Math.round(value);
}

/** Apunta en un equipo el valor de su ejercito del dia actual (una muestra por dia). */
function sampleTeamArmy(s: GameState, stats: TeamStats, today: number): void {
  const samples = stats.army;
  const dayIndex = Math.max(0, s.day - 1);
  if (dayIndex < samples.length) {
    samples[dayIndex] = today;
    return;
  }
  // Dias sin muestra (partidas antiguas): repetir la ultima.
  while (samples.length < dayIndex) samples.push(samples[samples.length - 1] ?? today);
  samples.push(today);
}

/** Apunta el valor del ejercito de cada equipo del dia actual. */
export function sampleArmy(s: GameState): void {
  for (const team of s.teams) sampleTeamArmy(s, team.stats, armyValue(s, team.id));
}

/** Las estadisticas de un equipo, para leerlas. */
export function statsOf(s: GameState, team: TeamId): Readonly<TeamStats> {
  return teamState(s, team).stats;
}

/** El equipo de la unidad que estaba en `at` antes del ataque (la que ha caido ya no esta). */
function defenderTeamOf(s: GameState, event: Extract<GameEvent, { kind: 'attack' }>): TeamId | null {
  if (event.combat) return event.combat.defenderTeam;
  const defender = s.units.find((unit) => isOnMap(unit) && unit.x === event.target.x && unit.y === event.target.y);
  return defender?.team ?? null;
}

/** Apunta un evento ya aplicado al estado. `team` = equipo que lo ha hecho. */
export function recordEvent(s: GameState, event: GameEvent, team: TeamId): void {
  const counts = teamState(s, team).stats;
  switch (event.kind) {
    case 'attack': {
      const defenderTeam = defenderTeamOf(s, event);
      if (event.killed && defenderTeam !== null) teamState(s, defenderTeam).stats.lost++;
      if (event.attackerKilled) counts.lost++;
      break;
    }
    case 'capture':
      // Con captura por puntos, solo cuenta cuando se termina.
      if (event.left === undefined || event.left === 0) counts.captured++;
      break;
    case 'spawn': {
      const built = s.units.find((unit) => unit.uid === event.uid);
      if (built) {
        counts.built++;
        counts.spent += unitTypeOf(s, built).cost;
      }
      break;
    }
    default:
      // Mover, unir, subir, esperar y los poderes no cuentan para las estadisticas.
      break;
  }
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
