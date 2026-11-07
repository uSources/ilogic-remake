/**
 * Objetivos de mision, uno por entrada: como se escribe en la mision, que se comprueba al cargarla,
 * cuando se gana o se pierde y cuanto falta. Un objetivo nuevo es una entrada en `OBJECTIVES` (y su
 * frase en `campaign.ts`); el tipo de la partida esta en `Objective` (`model/objective.ts`).
 *
 * Un objetivo es de un equipo (`Objective.owner`, el que juega la mision): si se cumple y el
 * progreso se miden para ese equipo. Si lo cumple gana su alianza, y si falla, sus enemigos (la
 * regla 'objective' de rules/victory.ts).
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

/** Lo que hace falta saber de la mision para comprobar su objetivo. */
export interface MissionLayout {
  unitCount: number;
  mapSize: number;
}

type InMission<K extends ObjectiveKind> = Extract<MissionObjective, { kind: K }>;
type InGame<K extends ObjectiveKind> = Extract<Objective, { kind: K }>;
type Goal<K extends ObjectiveKind> = Extract<ObjectiveGoal, { kind: K }>;

interface ObjectiveRules<K extends ObjectiveKind> {
  /** De como se escribe en la mision a lo que pide en la partida (`unitUids[i]` es la unidad `i`). */
  fromMission(written: InMission<K>, unitUids: readonly number[], content: GameContent): Goal<K>;
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
    fromMission: (written, _unitUids, content) => ({
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
    fromMission: (written, unitUids) => ({ kind: 'escort', uid: unitUids[written.vip]!, to: written.to, days: written.days }),
    problems: (written, layout) => [
      ...(written.vip >= 0 && written.vip < layout.unitCount ? [] : [`la unidad a escoltar (${written.vip}) no esta en la lista`]),
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

/** Lo que pide el objetivo de una mision en la partida (`unitUids[i]` es la unidad `i` de la mision). */
export const missionGoal = (written: MissionObjective, unitUids: readonly number[], content: GameContent): ObjectiveGoal =>
  rulesOf(written.kind).fromMission(written, unitUids, content);

/** El objetivo de la partida de una mision: lo que pide y su dueño (`owner`, el equipo que la juega). */
export const objectiveFromMission = (
  written: MissionObjective,
  owner: TeamId,
  unitUids: readonly number[],
  content: GameContent,
): Objective => ({
  ...missionGoal(written, unitUids, content),
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
