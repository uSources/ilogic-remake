import { expect } from 'vitest';
import { entryOf, type BuildingType, type TerrainType, type UnitType } from '@core/content';
import { defaultContent } from '@core/content/default';
import { SAVE_VERSION } from '@core/saveVersion';
import { rulesWith } from '@core/rulesConfig';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import type {
  ActionRejection,
  Building,
  Dice,
  GameAction,
  GameEvent,
  GameEventOf,
  GameState,
  Pos,
  Rng,
  RulesConfig,
  TeamId,
  Unit,
} from '@core/model';
import { aiController } from '@core/controllers';
import { GameSession } from '@core/session';
import { dispatch, isTurnBoundary } from '@core/actions';
import { serialize } from '@core/save';
import { uncheckedAttack } from '@core/sandbox';
import { seededRng } from '@core/util/random';
import { endRound, isWinner, matchResult, roundReport, type RoundReport } from '@core/rules';
import { teamIds, type TeamSetup } from '@core/teams';
import { samePos } from '@core/geom';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/**
 * Una partida guardada que dice ser del formato 1 (`version: 1`): para probar que MIGRATIONS hace con
 * ella lo de entonces (los pasos de los tipos por numero dejan los ids como estan).
 */
export function savedByVersion1(json: string): string {
  return json.replace(`"version":${SAVE_VERSION}`, '"version":1');
}

/**
 * El equipo `team` hace la accion (por dispatch, como en el juego) y tiene que valer: sus sucesos. Si
 * no era su turno, antes se le da (ya empezado: `giveTurn`), para probar las acciones de cualquier
 * equipo sin jugar los turnos de los demas; lo de los turnos se prueba con `dispatch` o `expectRejected`.
 */
export function act(s: GameState, team: TeamId, action: GameAction): GameEvent[] {
  const isOwnStartedTurn = s.turn === team && (s.turnStarted || action.kind === 'startTurn');
  if (!isOwnStartedTurn) giveTurn(s, team);
  const result = dispatch(s, team, action);
  if (!result.ok) throw new Error(`Accion rechazada (${result.reason}): ${JSON.stringify(action)}`);
  return result.events;
}

/** La accion no vale por `reason` y la partida no cambia. */
export function expectRejected(s: GameState, team: TeamId, action: GameAction, reason: ActionRejection): void {
  const before = serialize(s);
  expect(dispatch(s, team, action)).toEqual({ ok: false, reason });
  expect(serialize(s)).toBe(before);
}

/**
 * Un combate con unos dados elegidos, sin comprobar si se puede atacar (para probar la cuenta del
 * combate): el de la accion 'attack', y despues se quitan las que caen, como hace dispatch.
 */
export function fight(s: GameState, attacker: Unit, defender: Unit, dice: Dice): GameEventOf<'attack'> {
  return uncheckedAttack(s, attacker, defender, dice);
}

/** El equipo usa un poder de su general por dispatch: el suceso, o null si no se puede. */
export function usePower(s: GameState, team: TeamId, power: string, target: Pos | null = null): GameEventOf<'power'> | null {
  const result = dispatch(s, team, { kind: 'usePower', power, target });
  const event = result.ok ? result.events[0] : undefined;
  return event?.kind === 'power' ? event : null;
}

/** Acaba la ronda y da su resumen (el que enseña la escena: lo cobrado, pagado, curado...). */
export const endRoundReport = (s: GameState): RoundReport => roundReport(s, endRound(s));

/** Dados que tiran de un `Rng` (para probar un combate con una tirada conocida, sin los de la partida). */
export const diceFrom = (rng: Rng): Dice => ({ roll: rng });

/** Semilla de los dados de las partidas de prueba (`GameState.dice`). */
export const BLANK_DICE_SEED = 1;

/** Dinero de cada equipo en las partidas de prueba. */
export const BLANK_FUNDS = 5000;

/** Los equipos de una partida de prueba normal: el 0 lo juega una persona y el 1, la IA; enemigos. */
export const PLAYER = 0;
export const ENEMY = 1;
const PERSON_VS_AI: TeamSetup[] = [
  { controller: 'human', funds: BLANK_FUNDS },
  { controller: 'ai', funds: BLANK_FUNDS },
];

/**
 * Una partida vacia (todo llano, sin unidades y sin mas edificios que una Base por equipo, ver
 * blankHeadquarters) con esas reglas y esos equipos, en el turno ya empezado del primero.
 */
export function blankState(rules: Partial<RulesConfig> = {}, teams: readonly TeamSetup[] = PERSON_VS_AI): GameState {
  const s = newGameState({
    map: blankMap(BLANK_SIZE, defaultContent().plainTerrain.id),
    rules: rulesWith(defaultContent(), rules),
    content: defaultContent(),
    mode: 'skirmish',
    teams,
    diceSeed: BLANK_DICE_SEED,
  });
  teams.forEach((_, team) => s.buildings.push({ type: hqId(), owner: team, ...blankHeadquarters(team), capture: null }));
  // La partida de prueba ya esta en el turno del primer equipo (sin nada que hacer al empezarlo).
  return giveTurn(s, s.turn);
}

/**
 * Donde esta la Base de cada equipo en `blankState`: en la ultima fila, lejos de donde ponen sus
 * unidades los tests. Sin Base un equipo ha perdido (isDefeated) y no puede mandar acciones.
 */
export const blankHeadquarters = (team: TeamId): Pos => ({ x: BLANK_SIZE - 1 - team, y: BLANK_SIZE - 1 });

/**
 * Quita las Bases de `blankState`: para los tests de dinero o de puntos que ponen sus propios
 * edificios. Sin Base, el equipo ya no puede mandar acciones (ha perdido).
 */
export function withoutHeadquarters(s: GameState): GameState {
  s.buildings = placedBuildings(s);
  return s;
}

/** Los edificios que ha puesto el test (sin las Bases de `blankState`). */
export const placedBuildings = (s: GameState): Building[] =>
  s.buildings.filter((building) => building.type !== hqId() || !isBlankHeadquarters(building));

const isBlankHeadquarters = (building: Building): boolean =>
  building.owner !== null && samePos(building, blankHeadquarters(building.owner));

/** Un tipo de unidad del contenido del juego, por su id ('Tank'). */
export const unitTypeNamed = (id: string): UnitType => entryOf(defaultContent().units, id, 'unidad');
/** Un tipo de edificio del contenido del juego, por su id ('City'). */
export const buildingTypeNamed = (id: string): BuildingType => entryOf(defaultContent().buildings, id, 'edificio');
/** Un terreno del contenido del juego, por su id ('Woods'). */
export const terrainNamed = (id: string): TerrainType => entryOf(defaultContent().terrain, id, 'terreno');

/** El id del cuartel general del contenido del juego (lo que guarda `Building.type`). */
export const hqId = (): string => defaultContent().hq.id;

/** Juega el turno del equipo al que le toca en la sesion, hasta que lo pasa (o acaba la partida). */
export function playOneTurn(session: GameSession): void {
  for (;;) {
    const step = session.step();
    if (step.kind !== 'acted' || step.action.kind === 'endTurn') return;
  }
}

/**
 * Juega `days` rondas IA contra IA de cada partida a la vez, turno a turno (un turno de cada una por
 * equipo), cada una con su azar de semilla `seed`: para ver que dos partidas en el mismo proceso no
 * se mezclan. Devuelve los sucesos de las acciones de cada una (sin empezar ni acabar los turnos).
 */
export function playInterleaved(games: readonly GameState[], days: number, seed: number): GameEvent[][] {
  const events: GameEvent[][] = games.map(() => []);
  const sessions = games.map((s, i) => {
    const rng = seededRng(seed);
    const session = new GameSession(
      s,
      s.teams.map(() => aiController(rng)),
    );
    session.subscribe((step) => {
      if (!isTurnBoundary(step.action)) events[i]!.push(...step.events);
    });
    return session;
  });
  for (let turn = 0; turn < days * teamIds(games[0]!).length; turn++) sessions.forEach(playOneTurn);
  return events;
}

/** Le pasa el turno a `team`, ya empezado (para probar las acciones de cualquier equipo sin jugar los de antes). */
export function giveTurn(s: GameState, team: TeamId): GameState {
  s.turn = team;
  s.turnStarted = true;
  return s;
}

/** Unas unidades que no pueden estar vacias (formar escuadra con ninguna no se puede pedir). */
export function someUnits(units: readonly Unit[]): readonly [Unit, ...Unit[]] {
  const [first, ...rest] = units;
  if (!first) throw new Error('Hace falta al menos una unidad');
  return [first, ...rest];
}

/** Como va la partida para `team`, en una palabra (para comprobarlo en una linea): sigue, gana, pierde o empate. */
export function resultFor(s: GameState, team: TeamId): 'playing' | 'won' | 'lost' | 'draw' {
  const result = matchResult(s);
  if (result.status !== 'decided') return result.status;
  return isWinner(result, team) ? 'won' : 'lost';
}
