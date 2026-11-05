/**
 * Objetivos de mision, uno por entrada: como se escribe en la mision, que se comprueba al cargarla,
 * cuando se gana o se pierde y cuanto falta. Un objetivo nuevo es una entrada en `OBJECTIVES` (y su
 * frase en `campaign.ts`); el tipo de la partida esta en `Objective` (`model/objective.ts`).
 *
 * Un objetivo es de un equipo (el que juega la mision, `GameState.mission.team`): el resultado y el
 * progreso se miden para ese equipo. Para sus enemigos el resultado es el contrario
 * (`outcome` de rules/outcome.ts).
 */

import { entryOf, type GameContent } from './content';

import type { GameState, Objective, Outcome, Pos, TeamId } from './model';
import { isHostile } from './teams';
import { samePos } from './geom';
import { Grid } from './util/grid';

/** Nombre interno de un edificio (buildings.json). */
type BuildingName = string;

/** El objetivo tal como se escribe en una mision: por nombre de edificio y por indice de unidad. */
export type MissionObjective =
  | { kind: 'hq' }
  | { kind: 'survive'; days: number }
  | { kind: 'capture'; count: number; type: BuildingName | null; days: number }
  | { kind: 'destroy'; days: number }
  /** `vip` es el indice en `units` de la mision de la unidad a escoltar. */
  | { kind: 'escort'; vip: number; to: Pos; days: number };

export type ObjectiveKind = Objective['kind'];

/** Lo que se puede contar de un objetivo para enseñarlo ("3/6", "quedan 4"). */
export interface ObjectiveProgress {
  done: number;
  total: number;
}

/** Lo que hace falta saber de la mision para comprobar su objetivo. */
export interface MissionLayout {
  unitCount: number;
  mapSize: number;
}

type InMission<K extends ObjectiveKind> = Extract<MissionObjective, { kind: K }>;
type InGame<K extends ObjectiveKind> = Extract<Objective, { kind: K }>;

interface ObjectiveRules<K extends ObjectiveKind> {
  /** De como se escribe en la mision a como queda en la partida (`unitUids[i]` es la unidad `i`). */
  fromMission(written: InMission<K>, unitUids: readonly number[], content: GameContent): InGame<K>;
  /** Problemas del objetivo en el mapa de la mision (para los tests). */
  problems(written: InMission<K>, layout: MissionLayout): string[];
  /** Resultado de la partida para el equipo `team`, dueño del objetivo (perder la Base ya se ha mirado antes). */
  outcome(s: GameState, team: TeamId, objective: InGame<K>): Outcome;
  progress(s: GameState, team: TeamId, objective: InGame<K>): ObjectiveProgress | null;
}

const noProblems = (): string[] => [];

/** Pasado el ultimo dia del objetivo. */
const isPastLastDay = (s: GameState, objective: { days: number }) => s.day > objective.days;

/** Ganada si ya se cumple; perdida si se acabaron los dias; si no, se sigue jugando. */
function wonOrLostByDays(s: GameState, objective: { days: number }, isDone: boolean): Outcome {
  if (isDone) return 'won';
  return isPastLastDay(s, objective) ? 'lost' : 'playing';
}

/** Edificios del equipo de ese tipo (o de cualquiera). */
function ownedBuildingsOfType(s: GameState, team: TeamId, type: string | null): number {
  return s.buildings.filter((building) => building.owner === team && (type === null || building.type === type)).length;
}

/** Unidades de los enemigos del equipo. */
const enemyUnitCount = (s: GameState, team: TeamId) => s.units.filter((unit) => isHostile(s, unit.team, team)).length;

/** Donde esta la unidad: dentro de un transporte, donde este el transporte. */
function positionOf(s: GameState, uid: number): Pos | undefined {
  const unit = s.units.find((candidate) => candidate.uid === uid);
  if (!unit) return undefined;
  if (unit.carrier === null) return unit;
  return s.units.find((candidate) => candidate.uid === unit.carrier) ?? unit;
}

const OBJECTIVES: { [K in ObjectiveKind]: ObjectiveRules<K> } = {
  hq: {
    fromMission: (written) => written,
    problems: noProblems,
    // La Base se mira en `outcome()` para todas las partidas, con objetivo o sin el.
    outcome: () => 'playing',
    progress: () => null,
  },
  survive: {
    fromMission: (written) => written,
    problems: noProblems,
    outcome: (s, _team, objective) => (isPastLastDay(s, objective) ? 'won' : 'playing'),
    progress: (s, _team, objective) => ({ done: Math.min(s.day - 1, objective.days), total: objective.days }),
  },
  capture: {
    fromMission: (written, _unitUids, content) => ({
      kind: 'capture',
      count: written.count,
      type: written.type === null ? null : entryOf(content.buildings, written.type, 'edificio').id,
      days: written.days,
    }),
    problems: noProblems,
    outcome: (s, team, objective) => wonOrLostByDays(s, objective, ownedBuildingsOfType(s, team, objective.type) >= objective.count),
    progress: (s, team, objective) => ({ done: ownedBuildingsOfType(s, team, objective.type), total: objective.count }),
  },
  destroy: {
    fromMission: (written) => written,
    problems: noProblems,
    outcome: (s, team, objective) => wonOrLostByDays(s, objective, enemyUnitCount(s, team) === 0),
    progress: (s, team) => ({ done: 0, total: enemyUnitCount(s, team) }),
  },
  escort: {
    fromMission: (written, unitUids) => ({ kind: 'escort', uid: unitUids[written.vip]!, to: written.to, days: written.days }),
    problems: (written, layout) => [
      ...(written.vip >= 0 && written.vip < layout.unitCount ? [] : [`la unidad a escoltar (${written.vip}) no esta en la lista`]),
      ...(Grid.fits({ width: layout.mapSize, height: layout.mapSize }, written.to)
        ? []
        : [`el destino (${written.to.x},${written.to.y}) esta fuera del mapa`]),
    ],
    outcome: (s, _team, objective) => {
      const at = positionOf(s, objective.uid);
      if (!at) return 'lost';
      return wonOrLostByDays(s, objective, samePos(at, objective.to));
    },
    progress: () => null,
  },
};

function rulesOf<K extends ObjectiveKind>(kind: K): ObjectiveRules<K> {
  return OBJECTIVES[kind];
}

export const objectiveFromMission = (written: MissionObjective, unitUids: readonly number[], content: GameContent): Objective =>
  rulesOf(written.kind).fromMission(written, unitUids, content);

export const objectiveProblems = (written: MissionObjective, layout: MissionLayout): string[] =>
  rulesOf(written.kind).problems(written, layout);

/** Resultado de la partida para `team`, el dueño del objetivo. */
export const objectiveOutcome = (s: GameState, team: TeamId, objective: Objective): Outcome =>
  rulesOf(objective.kind).outcome(s, team, objective);

/** Cuanto le falta a `team`, el dueño del objetivo (null si no se cuenta). */
export const measureObjective = (s: GameState, team: TeamId, objective: Objective): ObjectiveProgress | null =>
  rulesOf(objective.kind).progress(s, team, objective);
