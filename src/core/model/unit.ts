import type { Pos } from './geometry';
import type { StandingOrder } from './standingOrder';
import type { TeamId } from './team';

/**
 * En que punto de su turno esta una unidad:
 * - 'ready': aun no ha hecho nada (puede moverse y actuar);
 * - 'moved': se ha movido y aun puede actuar (atacar, salvo las de distancia, capturar, esperar...);
 * - 'done': ya no hace nada mas hasta la ronda siguiente (ha atacado, capturado, esperado...).
 */
export type UnitTurnState = 'ready' | 'moved' | 'done';

/** Una unidad en su casilla (x, y), o dentro de un transporte (carrier). */
export interface Unit extends Pos {
  /** Identificador estable (no cambia al morir otras unidades ni al guardar). */
  uid: number;
  /** Tipo de unidad: su id en units.json (ver unitTypeOf). */
  type: string;
  team: TeamId;
  /** En que punto de su turno esta (ver UnitTurnState y rules/unitTurn.ts). */
  turnState: UnitTurnState;
  /** 0..100 */
  life: number;
  /** [CAMBIO] Enemigos destruidos (veterania, reglas nuevas). Sin poner: ninguno. */
  kills?: number;
  /** [CAMBIO] Dia en que recibio un ataque por ultima vez (flanqueo y sin cura bajo fuego). */
  hitDay?: number;
  /**
   * [CAMBIO] Orden con destino propia (atacar, capturar o defender aqui): la cumple sola al terminar
   * cada turno si sigue sin usar. En una escuadra manda sobre la orden de la escuadra (destacada).
   */
  standingOrder?: StandingOrder;
  /** [CAMBIO] Escuadra a la que pertenece (id de GameState.squads). */
  squad?: number;
  /**
   * [CAMBIO] Viaje de varios turnos: casilla a la que va avanzando sola al empezar cada turno (sin
   * atacar ni capturar; para eso, `standingOrder`). Antes se guardaba como `order`.
   */
  travelTo?: Pos;
  /** uid del transporte que la lleva, o null. */
  carrier: number | null;
  /** uids de las unidades que lleva (una entrada por plaza, null = libre). */
  cargo: (number | null)[];
}
