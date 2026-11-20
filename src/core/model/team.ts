import type { TeamFall } from './defeat';
import type { TeamStats } from './stats';

/**
 * Equipo de una partida: su numero, el que llevan Unit.team, Building.owner, Squad.team... Es el
 * puesto del equipo en GameState.teams. Ningun numero es "el jugador" ni "la IA": eso lo dice el
 * `controller` de cada equipo, y quien es enemigo de quien, su `alliance`.
 */
export type TeamId = number;

/**
 * Quien decide las acciones de un equipo: una persona delante de la pantalla ('human') o la IA del
 * juego ('ai'). Los modos de juego (online, repeticion...) añadiran los suyos.
 */
export type ControllerKind = 'human' | 'ai';

/** Lo que es de cada equipo en una partida. */
export interface TeamState {
  /** Su numero (su puesto en GameState.teams). */
  id: TeamId;
  /**
   * Alianza: los equipos con la misma son aliados (no se atacan, se dejan pasar y comparten lo que
   * ven); los de otra, enemigos. Con una alianza por equipo, todos contra todos.
   */
  alliance: number;
  controller: ControllerKind;
  funds: number;
  /** Estadisticas para la pantalla final. */
  stats: TeamStats;
  /** Se ha rendido (la accion 'surrender'): cuenta como derrotado, aunque le quede de todo. */
  resigned: boolean;
  /**
   * Cuando y por que cayo (null: sigue en pie). Lo apunta la invariante 'falls' (`recordFalls`) en la
   * accion o la ronda en que cae; el resultado de la partida mira la ultima caida.
   */
  fell: TeamFall | null;
  /**
   * Donde vio por ultima vez a cada unidad enemiga que ahora no ve (memoria con la niebla,
   * rules/sightings.ts). Solo lo sabe su alianza: la niebla lo quita a las demas.
   */
  sightings: Sighting[];
  /**
   * Como juega cuando lo juega la IA (docs/PLAN-IA.md, fase 4): su personalidad y su dificultad, por
   * su id en ai.json ("personalities", "difficulties"). Un equipo de una persona tambien las tiene:
   * las usa si se le da a la IA.
   */
  personality: string;
  difficulty: string;
}

/**
 * Donde vio un equipo por ultima vez a una unidad enemiga (docs/PLAN-IA.md, fase 3: memoria con la
 * niebla). Lo apunta la partida tras cada accion (invariante 'sightings') y lo olvida cuando ve su
 * casilla vacia. Solo lo sabe su alianza: la niebla lo quita a las demas (y cada equipo lleva lo suyo).
 */
export interface Sighting {
  uid: number;
  /** Tipo de unidad (id de units.json). */
  type: string;
  team: TeamId;
  x: number;
  y: number;
  life: number;
  /** Dia en que la vio ahi. */
  day: number;
}
