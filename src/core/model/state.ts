import type { Building, ControlPoint } from './building';
import type { Objective } from './objective';
import type { TeamId, TeamState } from './team';
import type { Squad } from './squad';
import type { RulesConfig } from './rules';
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
  version: 3;
  /** Terreno: map[x][y] = id del terreno (terrain.json, ver terrainAt). El tamaño del mapa sale de aqui. */
  map: string[][];
  /** Tema del mapa (id de themes.json, ver themeOf): elige las imagenes de orilla y el clima. */
  theme: string;
  /** Los equipos, en orden: el puesto de cada uno es su numero (TeamId). Dinero, general y estadisticas son de cada uno. */
  teams: TeamState[];
  units: Unit[];
  buildings: Building[];
  nextUid: number;
  /** Numero de ronda (empieza en 1). */
  day: number;
  /** Reglas de esta partida: la unica fuente de las reglas (no hay reglas globales). */
  rules: RulesConfig;
  /** Como se genero la partida (para enseñar el codigo del mapa y repetirlo). */
  setup?: GameSetup;
  /** [CAMBIO] Clima (regla weather): el de ahora, los dias que le quedan y el que viene despues. */
  weather?: WeatherState;
  /**
   * Mision de la campaña que se esta jugando (su id), el equipo que la juega (el de su objetivo: para
   * sus enemigos, al reves) y su objetivo especial.
   */
  mission?: { id: string; team: TeamId; objective: Objective };
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
  /** Tema elegido (id de themes.json) o null si fue al azar. */
  theme: string | null;
}
