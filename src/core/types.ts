/**
 * Modelo de datos de una partida. Todo es serializable a JSON (para guardar).
 * Coordenadas: x = columna (crece a la derecha), y = fila (crece hacia abajo).
 */

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
  fuel: number;
  ammo: number;
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
  stats?: import('./stats').GameStats;
  /** Reglas de esta partida (las antiguas no las tienen: se juegan con las clasicas). */
  rules?: import('./data').RulesConfig;
  /** Como se genero la partida (para enseñar el codigo del mapa y repetirlo). */
  setup?: GameSetup;
}

/** Generador de numeros aleatorios en [0, 1). */
export type Rng = () => number;

export type Outcome = 'playing' | 'won' | 'lost';

/** Lo que acaba de pasar, para que la interfaz lo anime. Lo usan el jugador y la IA. */
export type GameEvent =
  | { kind: 'move'; uid: number; path: Pos[] }
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
