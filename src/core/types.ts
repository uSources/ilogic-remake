/**
 * Modelo de datos de una partida. Todo es serializable a JSON (para guardar).
 * Coordenadas: x = columna (crece a la derecha), y = fila (crece hacia abajo).
 */
import type { RulesConfig } from './data';
import type { GameStats } from './stats';

export interface Pos {
  x: number;
  y: number;
}

/** Bando: 0 = jugador, 1 = IA. */
export type Team = 0 | 1;

export interface Unit {
  /** Identificador estable (no cambia al morir otras unidades ni al guardar). */
  uid: number;
  /** Tipo 0..18 (ver UNIT_NAMES). */
  type: number;
  team: Team;
  x: number;
  y: number;
  /** Puede actuar este turno. */
  active: boolean;
  /** Aun no se ha movido este turno. */
  canMove: boolean;
  /** Puede disparar este turno (las unidades a distancia lo pierden al moverse). */
  canFire: boolean;
  /** 0..100 */
  life: number;
  /** [CAMBIO] Enemigos destruidos (veterania, reglas nuevas). Las partidas antiguas no lo tienen. */
  kills?: number;
  /** [CAMBIO] Orden de varios turnos: casilla a la que va avanzando sola al empezar cada turno. */
  order?: Pos;
  /** uid del transporte que la lleva, o null. */
  carrier: number | null;
  /** uids de las unidades que lleva (una entrada por plaza, null = libre). */
  cargo: (number | null)[];
}

export interface Building {
  /** Tipo 0..5 (ver BUILDING_NAMES). */
  type: number;
  /** Bando propietario, o null si es neutral. */
  owner: Team | null;
  x: number;
  y: number;
  /**
   * [CAMBIO] Captura a medias (reglas nuevas): quien la hace, con que unidad y los puntos que
   * le quedan al edificio. Se pierde si esa unidad se va o muere.
   */
  capture?: { team: Team; uid: number; left: number } | null;
}

export interface GameState {
  version: 1;
  /** Terreno: map[x][y] = indice 0..14 (ver TERRAIN_NAMES). */
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
  /** Mision de la campaña que se esta jugando (su id) y objetivo especial, si lo hay. */
  mission?: { id: string; objective: Objective };
}

/** Clima de la partida (indices de weather.json). */
export interface WeatherState {
  kind: number;
  /** Dias que quedan contando el de hoy (al llegar a 0 entra `next`). */
  left: number;
  next: number;
}

/** Generador de numeros aleatorios en [0, 1). */
export type Rng = () => number;

export type Outcome = 'playing' | 'won' | 'lost';

/** Lo que acaba de pasar, para que la interfaz lo anime. Lo usan el jugador y la IA. */
export type GameEvent =
  | { kind: 'move'; uid: number; path: Pos[]; ambush?: Pos }
  | { kind: 'attack'; attacker: number; target: Pos; damage: number; killed: boolean; counter?: number; attackerKilled?: boolean }
  | { kind: 'capture'; uid: number; at: Pos; owner: Team | null; left?: number; total?: number }
  | { kind: 'merge'; uid: number; into: number; path: Pos[] }
  | { kind: 'load'; uid: number; into: number; path: Pos[] }
  | { kind: 'spawn'; uid: number; at: Pos }
  | { kind: 'wait'; uid: number };

/** Opciones de una partida nueva que no son reglas: mapa. */
export interface GameSetup {
  /** Semilla del generador de mapas. */
  seed: number;
  /** Lado del mapa en casillas (20, 32 o 40). */
  size: number;
  /** Tema elegido (0..4) o null si fue al azar. */
  theme: number | null;
}

/**
 * Objetivo de una mision. En todas se pierde tambien si cae la Base propia.
 * - hq: conquistar la Base enemiga (lo normal).
 * - survive: aguantar hasta el final del dia `days`.
 * - capture: tener `count` edificios del tipo `type` (o de cualquiera) antes de acabar el dia `days`.
 * - destroy: destruir todas las unidades enemigas antes de acabar el dia `days`.
 * - escort: llevar la unidad `uid` hasta `to` antes de acabar el dia `days`; si la destruyen, se pierde.
 */
export type Objective =
  | { kind: 'hq' }
  | { kind: 'survive'; days: number }
  | { kind: 'capture'; count: number; type: number | null; days: number }
  | { kind: 'destroy'; days: number }
  | { kind: 'escort'; uid: number; to: Pos; days: number };
