import type { Pos } from './geometry';
import type { StandingOrder } from './standingOrder';
import type { Team } from './team';

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
  /** [CAMBIO] Dia en que recibio un ataque por ultima vez (flanqueo y sin cura bajo fuego). */
  hitDay?: number;
  /**
   * [CAMBIO] Orden con destino propia (atacar, capturar o defender aqui): la cumple sola al terminar
   * cada turno si sigue sin usar. En una escuadra manda sobre la orden de la escuadra (destacada).
   */
  standingOrder?: StandingOrder;
  /** [CAMBIO] Escuadra a la que pertenece (id de GameState.squads). */
  squad?: number;
  /** [CAMBIO] Orden de varios turnos: casilla a la que va avanzando sola al empezar cada turno. */
  order?: Pos;
  /** uid del transporte que la lleva, o null. */
  carrier: number | null;
  /** uids de las unidades que lleva (una entrada por plaza, null = libre). */
  cargo: (number | null)[];
}
