/**
 * Objetivos de mision, uno por entrada: como se escribe en la mision, que se comprueba al cargarla,
 * cuando se gana o se pierde y cuanto falta. Un objetivo nuevo es una entrada en `OBJECTIVES` (y su
 * frase en `campaign.ts`); el tipo de la partida esta en `Objective` (`model/objective.ts`).
 *
 * Un objetivo es de un equipo (`Objective.owner`): cada equipo de una mision tiene el suyo o
 * ninguno (`MissionTeam.objective`), asi que caben misiones con varias personas o con objetivos
 * para la IA. Si se cumple y el progreso se miden para su dueño. Si lo cumple gana su alianza, y si
 * falla, sus enemigos (la regla 'objective' de rules/victory.ts).
 */

import { entryOf, isEntryId, type GameContent, type MissionObjective } from './content';
import { isInt, isPosOn, isObject, isUid } from './util/validation';

import type { GameState, Objective, ObjectiveGoal, ObjectiveStatus, Pos, TeamId } from './model';
import { isHostile } from './teams';
import { samePos } from './geom';
import { Grid, type GridBounds } from './util/grid';
import { isOnMap } from './util/predicates';

export type ObjectiveKind = Objective['kind'];

/** Lo que se puede contar de un objetivo para enseñarlo ("3/6", "quedan 4"). */
export interface ObjectiveProgress {
  done: number;
  total: number;
}

/** Donde se comprueba el objetivo de una partida guardada: su contenido y los bordes de su mapa. */
export interface SavedMap {
  content: GameContent;
  board: GridBounds;
}

/** Lo que hace falta saber de la mision para comprobar el objetivo de un equipo. */
export interface MissionLayout {
  /** Cuantas unidades de ese equipo estan marcadas para escoltar (`vip`). */
  vipCount: number;
  mapSize: number;
}

/** Donde ha quedado lo de la mision en la partida para el objetivo de un equipo: el uid de su unidad a escoltar (si la tiene). */
export interface MissionPlacement {
  vipUid?: number;
}

/** El uid de una unidad que todavia no esta en ninguna partida (al describir el objetivo antes de jugar). */
const NOT_PLACED = -1;

type InMission<K extends ObjectiveKind> = Extract<MissionObjective, { kind: K }>;
type InGame<K extends ObjectiveKind> = Extract<Objective, { kind: K }>;
type Goal<K extends ObjectiveKind> = Extract<ObjectiveGoal, { kind: K }>;

interface ObjectiveRules<K extends ObjectiveKind> {
  /** De como se escribe en la mision a lo que pide en la partida (con lo de la mision ya puesto: `placed`). */
  fromMission(written: InMission<K>, placed: MissionPlacement, content: GameContent): Goal<K>;
  /** Problemas del objetivo en el mapa de la mision (para los tests). */
  problems(written: InMission<K>, layout: MissionLayout): string[];
  /** El objetivo de una partida guardada (lo de su `kind` ya esta mirado) tiene bien sus campos. */
  isValid(where: SavedMap, saved: Record<string, unknown>): boolean;
  /** Como va para su dueño, `team` (perder la Base ya lo mira la regla 'lastAllianceStanding'). */
  status(s: GameState, team: TeamId, objective: InGame<K>): ObjectiveStatus;
  /** Cuanto le falta al dueño del objetivo, `team`. */
  progress(s: GameState, team: TeamId, objective: InGame<K>): ObjectiveProgress | null;
}

const noProblems = (): string[] => [];

/** Dias que se aceptan en el objetivo de una partida guardada (mas es un fichero roto). */
const MAX_OBJECTIVE_DAYS = 10000;
/** Edificios que se aceptan en un objetivo de capturar. */
const MAX_OBJECTIVE_COUNT = 1000;

const hasDays = (saved: Record<string, unknown>): boolean => isInt(saved.days, 1, MAX_OBJECTIVE_DAYS);

/** Pasado el ultimo dia del objetivo. */
const isPastLastDay = (s: GameState, objective: { days: number }) => s.day > objective.days;

/** Cumplido si ya se cumple; fallado si se acabaron los dias; si no, aun no se sabe. */
function doneInTime(s: GameState, objective: { days: number }, isDone: boolean): ObjectiveStatus {
  if (isDone) return 'achieved';
  return isPastLastDay(s, objective) ? 'failed' : 'pending';
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
  if (isOnMap(unit)) return unit;
  return s.units.find((candidate) => candidate.uid === unit.carrier) ?? unit;
}

const OBJECTIVES: { [K in ObjectiveKind]: ObjectiveRules<K> } = {
  hq: {
    fromMission: (written) => written,
    problems: noProblems,
    isValid: () => true,
    // La Base la mira la regla 'lastAllianceStanding' (rules/victory.ts), con objetivo o sin el.
    status: () => 'pending',
    progress: () => null,
  },
  survive: {
    fromMission: (written) => written,
    problems: noProblems,
    isValid: (_s, saved) => hasDays(saved),
    status: (s, _team, objective) => (isPastLastDay(s, objective) ? 'achieved' : 'pending'),
    progress: (s, _team, objective) => ({ done: Math.min(s.day - 1, objective.days), total: objective.days }),
  },
  capture: {
    fromMission: (written, _placed, content) => ({
      kind: 'capture',
      count: written.count,
      type: written.type === null ? null : entryOf(content.buildings, written.type, 'edificio').id,
      days: written.days,
    }),
    problems: noProblems,
    isValid: (where, saved) =>
      hasDays(saved) &&
      isInt(saved.count, 1, MAX_OBJECTIVE_COUNT) &&
      (saved.type === null || isEntryId(where.content.buildings, saved.type)),
    status: (s, team, objective) => doneInTime(s, objective, ownedBuildingsOfType(s, team, objective.type) >= objective.count),
    progress: (s, team, objective) => ({ done: ownedBuildingsOfType(s, team, objective.type), total: objective.count }),
  },
  destroy: {
    fromMission: (written) => written,
    problems: noProblems,
    isValid: (_s, saved) => hasDays(saved),
    status: (s, team, objective) => doneInTime(s, objective, enemyUnitCount(s, team) === 0),
    progress: (s, team) => ({ done: 0, total: enemyUnitCount(s, team) }),
  },
  escort: {
    fromMission: (written, placed) => ({ kind: 'escort', uid: placed.vipUid ?? NOT_PLACED, to: written.to, days: written.days }),
    problems: (written, layout) => [
      ...(layout.vipCount === 1 ? [] : [`escoltar: el equipo tiene que tener una unidad con "vip": true (tiene ${layout.vipCount})`]),
      ...(Grid.fits({ width: layout.mapSize, height: layout.mapSize }, written.to)
        ? []
        : [`el destino (${written.to.x},${written.to.y}) esta fuera del mapa`]),
    ],
    isValid: (where, saved) => hasDays(saved) && isUid(saved.uid) && isPosOn(where.board, saved.to),
    status: (s, _team, objective) => {
      const at = positionOf(s, objective.uid);
      if (!at) return 'failed';
      return doneInTime(s, objective, samePos(at, objective.to));
    },
    progress: () => null,
  },
};

function rulesOf<K extends ObjectiveKind>(kind: K): ObjectiveRules<K> {
  return OBJECTIVES[kind];
}

/** Los tipos de objetivo que hay (para comprobar los que vienen de fuera). */
const isObjectiveKind = (value: unknown): value is ObjectiveKind => typeof value === 'string' && Object.hasOwn(OBJECTIVES, value);

/** El objetivo de una partida guardada (con ese contenido y en ese mapa) es uno de los que hay y tiene bien sus campos. */
export function isValidObjective(where: SavedMap, value: unknown): value is Objective {
  return isObject(value) && isObjectiveKind(value.kind) && OBJECTIVES[value.kind].isValid(where, value);
}

/** Lo que pide el objetivo de una mision en la partida (con lo de la mision ya puesto, `placed`; sin partida, nada). */
export const missionGoal = (written: MissionObjective, placed: MissionPlacement, content: GameContent): ObjectiveGoal =>
  rulesOf(written.kind).fromMission(written, placed, content);

/** El objetivo de la partida de una mision: lo que pide y su dueño (`owner`, el equipo que la juega). */
export const objectiveFromMission = (
  written: MissionObjective,
  owner: TeamId,
  placed: MissionPlacement,
  content: GameContent,
): Objective => ({
  ...missionGoal(written, placed, content),
  owner,
});

export const objectiveProblems = (written: MissionObjective, layout: MissionLayout): string[] =>
  rulesOf(written.kind).problems(written, layout);

/** Como va el objetivo para su dueño. */
export const objectiveStatus = (s: GameState, objective: Objective): ObjectiveStatus =>
  rulesOf(objective.kind).status(s, objective.owner, objective);

/** Cuanto le falta al dueño del objetivo (null si no se cuenta). */
export const measureObjective = (s: GameState, objective: Objective): ObjectiveProgress | null =>
  rulesOf(objective.kind).progress(s, objective.owner, objective);

/** Los objetivos de la mision que se juega, en el orden de los equipos (ninguno si no es una mision). */
export const missionObjectives = (s: GameState): readonly Objective[] => s.mission?.objectives ?? [];

/** El objetivo del equipo `team` en la mision que se juega, si tiene. */
export const objectiveOf = (s: GameState, team: TeamId): Objective | undefined =>
  missionObjectives(s).find((objective) => objective.owner === team);
