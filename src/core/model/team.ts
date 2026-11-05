import type { GeneralState } from './general';
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
  /** [CAMBIO] General del equipo (null = sin general). */
  general: GeneralState | null;
  /** Estadisticas para la pantalla final. */
  stats: TeamStats;
}
