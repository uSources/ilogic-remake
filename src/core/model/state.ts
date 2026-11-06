import type { Building, ControlPoint } from './building';
import type { GameModeId } from './match';
import type { Objective } from './objective';
import type { TeamId, TeamState } from './team';
import type { Squad } from './squad';
import type { MatchSettings } from './settings';
import type { UndoableMove } from './undo';
import type { Unit } from './unit';
import type { WeatherState } from './weather';

/**
 * El contenido con el que se juega una partida (unidades, edificios, terreno...). Su forma la pone
 * content/index.ts (`GameContent`) ampliando esta interfaz con `declare module`: asi el modelo nombra
 * el campo sin depender del contenido.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- la completa content/index.ts
export interface MatchContent {}

/** Una partida: lo guardado (serializable a JSON) y su contenido, que no se guarda. */
export interface GameState {
  /** Version del formato guardado: la de ahora (SAVE_VERSION, saveVersion.ts, tiene que ser esta). */
  version: 8;
  /** Terreno: map[x][y] = id del terreno (terrain.json, ver terrainAt). El tamaño del mapa sale de aqui. */
  map: string[][];
  /** Tema del mapa (id de themes.json, ver themeOf): elige las imagenes de orilla y el clima. */
  theme: string;
  /** Los equipos, en orden: el puesto de cada uno es su numero (TeamId). Dinero, general y estadisticas son de cada uno. */
  teams: TeamState[];
  units: Unit[];
  buildings: Building[];
  nextUid: number;
  /** El numero de la siguiente escuadra: como `nextUid`, solo sube (un numero nombra siempre a la misma). */
  nextSquadId: number;
  /** Numero de ronda (empieza en 1). */
  day: number;
  /** El modo de juego (ver GameModeId y core/modes.ts): lo pone quien crea la partida y no cambia. */
  mode: GameModeId;
  /**
   * El orden de los turnos de cada ronda (todos los equipos, una vez cada uno): la ronda acaba tras
   * el turno del ultimo. Lo dice el modo al crear la partida (normalmente, los equipos en orden).
   */
  turnOrder: TeamId[];
  /** El equipo al que le toca: solo el puede mandar acciones (ver ACTION_GUARDS). */
  turn: TeamId;
  /**
   * El turno de `turn` ya ha empezado (la accion 'startTurn': sus TURN_START_PHASES, como los viajes
   * de varios turnos). Hasta entonces, ese equipo solo puede empezarlo.
   */
  turnStarted: boolean;
  /**
   * Estado de los dados de la partida (mulberry32: un entero sin signo de 32 bits; ver core/dice.ts).
   * Va con la partida para que lo que salga no dependa de quien juega ni de lo que decida: la misma
   * partida con las mismas acciones da siempre los mismos combates, se cargue o no por medio.
   */
  dice: number;
  /**
   * Los ajustes de esta partida (la unica fuente: no hay ajustes globales): numeros e interruptores
   * de los modulos de reglas. De ellos y del modo salen los modulos que lleva (`ruleset`); se cambian,
   * los dos a la vez, con `changeSettings`.
   */
  readonly settings: Readonly<MatchSettings>;
  /** Como se genero la partida (para enseñar el codigo del mapa y repetirlo). */
  setup?: GameSetup;
  /** [CAMBIO] Clima (regla weather): el de ahora, los dias que le quedan y el que viene despues. */
  weather?: WeatherState;
  /** Mision de la campaña que se esta jugando (su id) y su objetivo (que dice de que equipo es: `owner`). */
  mission?: { id: string; objective: Objective };
  /** [CAMBIO] Escuadras (cada una de un equipo; las unidades dicen a cual pertenecen con Unit.squad). */
  squads?: Squad[];
  /**
   * [CAMBIO] Puntos de control: zonas (rules.controlRadius alrededor del centro) que dan
   * rules.controlIncome cada ronda a su dueño. Al acabar la ronda: si dentro solo hay unidades de una
   * alianza, el punto es suyo y paga; si hay de alianzas enemigas, esta disputado y no paga a nadie; si
   * no hay nadie, sigue siendo de quien era y paga.
   */
  controlPoints?: ControlPoint[];
  /**
   * Los movimientos que aun se pueden deshacer, el ultimo al final (ver UndoableMove y la accion
   * 'undoMove'). Vacia o sin poner: no hay nada que deshacer.
   */
  undoableMoves?: UndoableMove[];
  /**
   * Contenido con el que se juega. No se guarda: `serialize` escribe el resto (`SavedGameState`) y lo
   * ponen `newGameState` y `deserialize`. Copiar la partida con `cloneState` (lo comparte).
   */
  readonly content: MatchContent;
  /**
   * Los modulos de reglas que lleva la partida, ya resueltos (de su modo y sus ajustes) con lo que
   * aporta cada uno a cada lista. Como el contenido, no se guarda (sale de los ajustes): lo ponen
   * `newGameState`, `readSave` y `changeSettings`; ruleModules/ruleset.ts le da la forma.
   */
  readonly ruleset: MatchRuleset;
}

/**
 * Lo que resuelven los modulos de reglas para una partida. El modelo solo lo nombra:
 * ruleModules/ruleset.ts lo completa con `declare module` (como MatchContent).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- la completa ruleModules/ruleset.ts
export interface MatchRuleset {}

/** Lo que se guarda de una partida: todo menos su contenido y sus modulos (que salen de los ajustes). */
export type SavedGameState = Omit<GameState, 'content' | 'ruleset'>;

/** Opciones de una partida nueva que no son reglas: mapa. */
export interface GameSetup {
  /** Semilla del generador de mapas. */
  seed: number;
  /** Lado del mapa en casillas (20, 32 o 40). */
  size: number;
  /** Tema elegido (id de themes.json) o null si fue al azar. */
  theme: string | null;
}
