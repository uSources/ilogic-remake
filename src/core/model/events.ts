import type { Pos } from './geometry';
import type { StandingOrder } from './standingOrder';
import type { TeamId } from './team';

/**
 * Quien ha hecho algo (`GameEvent.actor`): el equipo que mando la accion, o null si es la propia
 * partida (el fin de ronda: ingresos, curas, mantenimiento, clima, puntos de control).
 */
export type EventActor = GameEvent['actor'];

/** Lo que ha curado algo a una unidad (abastecer, un poder del general, un edificio al acabar la ronda). */
export interface Healing {
  uid: number;
  amount: number;
}

/** La carga que ha ganado el general de un equipo (en estrellas, con decimales). */
export interface GeneralCharge {
  team: TeamId;
  amount: number;
}

/**
 * Por que acaba un viaje (suceso 'travel' con `to: null`): se le quita o se la mueve a mano
 * ('cancelled'), recibe una orden permanente ('ordered'), ya esta en el destino ('arrived'), llega
 * este turno y el ultimo trozo lo hace quien juega ('withinReach') o una emboscada la para ('ambush').
 */
export type TravelEnd = 'cancelled' | 'ordered' | 'arrived' | 'withinReach' | 'ambush';

/**
 * Lo que le ha pasado a una escuadra. Cada escuadra que deja de existir tiene un solo suceso que lo
 * dice: 'disbanded' (su equipo la deshace) o 'removed' (se ha quedado sin unidades: al salir, al
 * formar otra con las suyas o al caer; `actor`, el equipo de esa accion, o null si la quita la
 * partida). 'left' y 'grouped' solo van para las que siguen existiendo. Los 'removed' de una accion
 * van antes que su 'formed' o 'grouped', en orden. Un numero de escuadra no se reutiliza nunca
 * (`GameState.nextSquadId`).
 */
export type SquadChange = 'formed' | 'grouped' | 'left' | 'renamed' | 'disbanded' | 'removed';

/**
 * Lo que acaba de pasar, completo: quien lo hizo (`actor`), a quien (uids) y lo que hace falta para
 * contarlo sin mirar la partida (tipos, equipos, casillas). Con ellos se anima, se cuentan las
 * estadisticas y se podria repetir una partida o mandarla a otra pantalla. Lo dan las acciones
 * (`dispatch`) y el fin de ronda (`endRound`).
 */
export type GameEvent =
  | { kind: 'move'; actor: TeamId; uid: number; path: Pos[]; ambush?: Pos }
  | {
      kind: 'attack';
      actor: TeamId;
      attacker: number;
      /** La unidad atacada (puede ya no existir) y su casilla. */
      target: number;
      at: Pos;
      damage: number;
      killed: boolean;
      /** Vida quitada al atacante por el contraataque (0 si no lo hay). */
      counter: number;
      attackerKilled: boolean;
      /**
       * [CAMBIO] Dinero cobrado por destruir una unidad (para quien la destruyo), entero: si pasa del
       * maximo, lo que se pierde lo cuenta un suceso 'fundsCapped' de la misma accion.
       */
      bounty?: number;
      /** Carga que gana el general de cada equipo por el combate (solo los que la ganan). */
      charge?: GeneralCharge[];
      /** Como estaban las dos antes del combate (ver CombatInfo). */
      combat: CombatInfo;
    }
  | { kind: 'capture'; actor: TeamId; uid: number; at: Pos; owner: TeamId | null; left: number; total: number }
  | { kind: 'merge'; actor: TeamId; uid: number; into: number; path: Pos[] }
  | { kind: 'load'; actor: TeamId; uid: number; into: number; path: Pos[] }
  | { kind: 'unload'; actor: TeamId; uid: number; passenger: number; to: Pos }
  | { kind: 'spawn'; actor: TeamId; uid: number; unitType: string; team: TeamId; at: Pos }
  | { kind: 'wait'; actor: TeamId; uid: number }
  | { kind: 'supply'; actor: TeamId; uid: number; repairs: Healing[] }
  /** Una unidad retirada del mapa; si llevaba pasajeros, detras va un 'cargoLost' con ellos. */
  | { kind: 'remove'; actor: TeamId; uid: number; unitType: string }
  /** Deshecho el ultimo movimiento: la unidad vuelve a `to`. */
  | { kind: 'undoMove'; actor: TeamId; uid: number; to: Pos }
  /** Viaje de varios turnos hacia `to` (null: ya no viaja). */
  /** Un viaje que empieza (`to`, su destino) o que acaba (`to: null`, y por que). */
  | ({ kind: 'travel'; actor: TeamId; uid: number } & ({ to: Pos } | { to: null; end: TravelEnd }))
  /** Orden permanente dada a estas unidades (null: se la quitan). */
  | { kind: 'standingOrder'; actor: TeamId; uids: number[]; order: StandingOrder | null }
  /** La unidad ha cumplido la orden que seguia. */
  | { kind: 'standingOrderDone'; actor: TeamId; uid: number }
  /** Una escuadra formada, cambiada o deshecha: como queda (`uids`, las suyas ahora; vacio si ya no existe). */
  | { kind: 'squad'; actor: TeamId | null; squad: number; change: SquadChange; uids: number[]; name: string; key?: number }
  | {
      kind: 'power';
      actor: TeamId;
      general: string;
      power: string;
      /** Casilla elegida (poderes de area). */
      target?: Pos;
      /** Unidades tocadas y vida que han perdido. */
      hits: { uid: number; damage: number }[];
      /** Unidades propias curadas y vida que han recuperado (heal). */
      heals?: Healing[];
      /** Dinero conseguido (funds), entero: lo que pase del maximo lo cuenta 'fundsCapped'. */
      funds?: number;
    }
  /**
   * Los pasajeros de un transporte que ha caido o se ha retirado, que se van con el (sus uids;
   * `transport` ya no existe). Un solo suceso para los dos casos.
   */
  | { kind: 'cargoLost'; actor: null; transport: number; team: TeamId; passengers: number[] }
  /** Al acabar una accion o la ronda: una captura a medias que se pierde (su unidad se ha ido o ha caido). */
  | { kind: 'captureDropped'; actor: null; at: Pos; uid: number; team: TeamId }
  /** Al acabar una accion o la ronda: el dinero de un equipo que pasaba del maximo y se ha perdido. */
  | { kind: 'fundsCapped'; actor: null; team: TeamId; lost: number }
  /** Fin de ronda: lo que cobra un equipo por sus edificios o por sus puntos de control. */
  | { kind: 'income'; actor: null; team: TeamId; amount: number; source: 'buildings' | 'controlPoints' }
  /** Fin de ronda: una unidad curada en un edificio propio. */
  | { kind: 'heal'; actor: null; uid: number; team: TeamId; amount: number }
  /** Fin de ronda: el mantenimiento que paga un equipo. */
  | { kind: 'upkeep'; actor: null; team: TeamId; amount: number }
  /** Fin de ronda: un punto de control, de quien queda (y si esta disputado: entonces no paga). */
  | { kind: 'controlPoint'; actor: null; at: Pos; owner: TeamId | null; contested: boolean }
  /** Fin de ronda: empieza el dia `day`. */
  | { kind: 'newDay'; actor: null; day: number }
  /** [CAMBIO] Fin de ronda: cambia el clima (ids de weather.json). */
  | { kind: 'weather'; actor: null; from: string; to: string }
  /** El equipo `actor` se ha rendido. */
  | { kind: 'surrender'; actor: TeamId }
  /** Empieza el turno del equipo `actor` en el dia `day` (lo que hagan sus TURN_START_PHASES va detras). */
  | { kind: 'turnStart'; actor: TeamId; day: number }
  /** Acaba el turno del equipo `actor` y le toca a `next` (si acaba la ronda, sus sucesos van detras). */
  | { kind: 'turnEnd'; actor: TeamId; next: TeamId };

/** Tipo de evento ('move', 'attack'...). */
export type GameEventKind = GameEvent['kind'];
/** El evento de un tipo concreto, p. ej. `GameEventOf<'attack'>`. */
export type GameEventOf<K extends GameEventKind> = Extract<GameEvent, { kind: K }>;

/**
 * Como estaban las dos unidades justo antes de un combate. La interfaz lo usa para enseñarlo
 * (panel de combate, barras de vida) aunque una de las dos haya caido.
 */
export interface CombatInfo {
  /** Tipos de unidad (id de units.json). */
  attackerType: string;
  defenderType: string;
  attackerTeam: TeamId;
  defenderTeam: TeamId;
  /** Vida antes del combate. */
  attackerLife: number;
  defenderLife: number;
  /** Rango de veterania (0..3) antes del combate. */
  attackerRank: number;
  defenderRank: number;
  /** Probabilidad de acierto de cada disparo del atacante (0..1). */
  hit: number;
  /** Lo mismo para el contraataque, o null si no lo hubo. */
  counterHit: number | null;
}
