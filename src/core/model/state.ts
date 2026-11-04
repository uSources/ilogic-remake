import type { Building, ControlPoint } from './building';
import type { GeneralState } from './general';
import type { Objective } from './objective';
import type { Squad } from './orders';
import type { RulesConfig } from './rules';
import type { GameStats } from './stats';
import type { Unit } from './unit';
import type { WeatherState } from './weather';

/** Una partida. Todo es serializable a JSON (para guardar). */
export interface GameState {
  version: 1;
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
  /** Reglas de esta partida (las antiguas no las tienen: se juegan con las clasicas). */
  rules?: RulesConfig;
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
}

/** Opciones de una partida nueva que no son reglas: mapa. */
export interface GameSetup {
  /** Semilla del generador de mapas. */
  seed: number;
  /** Lado del mapa en casillas (20, 32 o 40). */
  size: number;
  /** Tema elegido (0..4) o null si fue al azar. */
  theme: number | null;
}
