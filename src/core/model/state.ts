import type { Building, ControlPoint } from './building';
import type { GeneralState } from './general';
import type { Objective } from './objective';
import type { Squad } from './squad';
import type { RulesConfig } from './rules';
import type { GameStats } from './stats';
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
  /** Version del formato guardado (SAVE_VERSION en saveMigrations.ts). */
  version: 2;
  /** Terreno: map[x][y] = indice 0..14 (ver TERRAIN_NAMES). El tamaño del mapa sale de aqui. */
  map: number[][];
  /** Tema del mapa 0..4 (Plains, Desert, Forest, Swamp, Snowy): elige las imagenes de orilla. */
  theme: number;
  /** Fondos por bando: [jugador, IA]. */
  funds: [number, number];
  units: Unit[];
  buildings: Building[];
  nextUid: number;
  /** Numero de ronda (empieza en 1). */
  day: number;
  /** Estadisticas para la pantalla final (opcional: las partidas antiguas no las tienen). */
  stats?: GameStats;
  /** Reglas de esta partida: la unica fuente de las reglas (no hay reglas globales). */
  rules: RulesConfig;
  /** Como se genero la partida (para enseñar el codigo del mapa y repetirlo). */
  setup?: GameSetup;
  /** [CAMBIO] Clima (regla weather): el de ahora, los dias que le quedan y el que viene despues. */
  weather?: WeatherState;
  /** [CAMBIO] General de cada bando [jugador, IA] (null = sin general). Las partidas antiguas no lo tienen. */
  generals?: [GeneralState | null, GeneralState | null];
  /** Mision de la campaña que se esta jugando (su id) y objetivo especial, si lo hay. */
  mission?: { id: string; objective: Objective };
  /** [CAMBIO] Escuadras del jugador (las unidades dicen a cual pertenecen con Unit.squad). */
  squads?: Squad[];
  /**
   * [CAMBIO] Puntos de control: zonas (rules.controlRadius alrededor del centro) que dan
   * rules.controlIncome cada ronda a su dueño. Al acabar la ronda: si dentro solo hay unidades de un
   * bando, el punto es suyo y paga; si hay de los dos, esta disputado y no paga a nadie; si no hay
   * nadie, sigue siendo de quien era y paga.
   */
  controlPoints?: ControlPoint[];
  /**
   * Contenido con el que se juega. No se guarda: `serialize` escribe el resto (`SavedGameState`) y lo
   * ponen `newGameState` y `deserialize`. Copiar la partida con `cloneState` (lo comparte).
   */
  readonly content: MatchContent;
}

/** Lo que se guarda de una partida: todo menos su contenido. */
export type SavedGameState = Omit<GameState, 'content'>;

/** Opciones de una partida nueva que no son reglas: mapa. */
export interface GameSetup {
  /** Semilla del generador de mapas. */
  seed: number;
  /** Lado del mapa en casillas (20, 32 o 40). */
  size: number;
  /** Tema elegido (0..4) o null si fue al azar. */
  theme: number | null;
}
