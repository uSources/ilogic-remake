/**
 * Objetivos de mision, uno por entrada: como se escribe en la mision, que se comprueba al cargarla,
 * cuando se gana o se pierde y cuanto falta. Un objetivo nuevo es una entrada en `OBJECTIVES` (y su
 * frase en `campaign.ts`); el tipo de la partida esta en `Objective` (`types.ts`).
 *
 * Los resultados son los mismos que `objectiveOutcome`/`objectiveProgress` de `rules/outcome.ts`
 * (lo comprueba `tests/objectives.test.ts`), que todavia tiene su propia copia.
 */
import { BUILDING_NAMES } from './data';
import type { GameState, Objective, Outcome, Pos } from './types';

type BuildingName = (typeof BUILDING_NAMES)[number];

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
  fromMission(written: InMission<K>, unitUids: readonly number[]): InGame<K>;
  /** Problemas del objetivo en el mapa de la mision (para los tests). */
  problems(written: InMission<K>, layout: MissionLayout): string[];
  /** Resultado de la partida por el objetivo (perder la Base ya se ha mirado antes). */
  outcome(s: GameState, objective: InGame<K>): Outcome;
  progress(s: GameState, objective: InGame<K>): ObjectiveProgress | null;
}

const PLAYER = 0;
const ENEMY = 1;

const noProblems = (): string[] => [];

/** Pasado el ultimo dia del objetivo. */
const isPastLastDay = (s: GameState, objective: { days: number }) => s.day > objective.days;

/** Ganada si ya se cumple; perdida si se acabaron los dias; si no, se sigue jugando. */
function wonOrLostByDays(s: GameState, objective: { days: number }, isDone: boolean): Outcome {
  if (isDone) return 'won';
  return isPastLastDay(s, objective) ? 'lost' : 'playing';
}

function ownedBuildingsOfType(s: GameState, type: number | null): number {
  return s.buildings.filter((building) => building.owner === PLAYER && (type === null || building.type === type)).length;
}

const enemyUnitCount = (s: GameState) => s.units.filter((unit) => unit.team === ENEMY).length;

/** Donde esta la unidad: dentro de un transporte, donde este el transporte. */
function positionOf(s: GameState, uid: number): Pos | undefined {
  const unit = s.units.find((candidate) => candidate.uid === uid);
  if (!unit) return undefined;
  if (unit.carrier === null) return unit;
  return s.units.find((candidate) => candidate.uid === unit.carrier) ?? unit;
}

const isInsideMap = (pos: Pos, mapSize: number) => pos.x >= 0 && pos.y >= 0 && pos.x < mapSize && pos.y < mapSize;

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
    outcome: (s, objective) => (isPastLastDay(s, objective) ? 'won' : 'playing'),
    progress: (s, objective) => ({ done: Math.min(s.day - 1, objective.days), total: objective.days }),
  },
  capture: {
    fromMission: (written) => ({
      kind: 'capture',
      count: written.count,
      type: written.type === null ? null : BUILDING_NAMES.indexOf(written.type),
      days: written.days,
    }),
    problems: noProblems,
    outcome: (s, objective) => wonOrLostByDays(s, objective, ownedBuildingsOfType(s, objective.type) >= objective.count),
    progress: (s, objective) => ({ done: ownedBuildingsOfType(s, objective.type), total: objective.count }),
  },
  destroy: {
    fromMission: (written) => written,
    problems: noProblems,
    outcome: (s, objective) => wonOrLostByDays(s, objective, enemyUnitCount(s) === 0),
    progress: (s) => ({ done: 0, total: enemyUnitCount(s) }),
  },
  escort: {
    fromMission: (written, unitUids) => ({ kind: 'escort', uid: unitUids[written.vip]!, to: written.to, days: written.days }),
    problems: (written, layout) => [
      ...(written.vip >= 0 && written.vip < layout.unitCount ? [] : [`la unidad a escoltar (${written.vip}) no esta en la lista`]),
      ...(isInsideMap(written.to, layout.mapSize) ? [] : [`el destino (${written.to.x},${written.to.y}) esta fuera del mapa`]),
    ],
    outcome: (s, objective) => {
      const at = positionOf(s, objective.uid);
      if (!at) return 'lost';
      return wonOrLostByDays(s, objective, at.x === objective.to.x && at.y === objective.to.y);
    },
    progress: () => null,
  },
};

function rulesOf<K extends ObjectiveKind>(kind: K): ObjectiveRules<K> {
  return OBJECTIVES[kind];
}

export const objectiveFromMission = (written: MissionObjective, unitUids: readonly number[]): Objective =>
  rulesOf(written.kind).fromMission(written, unitUids);

export const objectiveProblems = (written: MissionObjective, layout: MissionLayout): string[] =>
  rulesOf(written.kind).problems(written, layout);

export const objectiveOutcome = (s: GameState, objective: Objective): Outcome => rulesOf(objective.kind).outcome(s, objective);

export const measureObjective = (s: GameState, objective: Objective): ObjectiveProgress | null =>
  rulesOf(objective.kind).progress(s, objective);
