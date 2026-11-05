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

/** Lo que le ha pasado a una escuadra. */
export type SquadChange = 'formed' | 'grouped' | 'left' | 'renamed' | 'disbanded';

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
      /** [CAMBIO] Dinero cobrado por destruir una unidad (para quien la destruyo). */
      bounty?: number;
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
  /** Una unidad retirada del mapa (con lo que llevara dentro). */
  | { kind: 'remove'; actor: TeamId; uid: number; unitType: string; passengers: number[] }
  /** Deshecho el ultimo movimiento: la unidad vuelve a `to`. */
  | { kind: 'undoMove'; actor: TeamId; uid: number; to: Pos }
  /** Viaje de varios turnos hacia `to` (null: ya no viaja). */
  | { kind: 'travel'; actor: TeamId; uid: number; to: Pos | null }
  /** Orden permanente dada a estas unidades (null: se la quitan). */
  | { kind: 'standingOrder'; actor: TeamId; uids: number[]; order: StandingOrder | null }
  /** La unidad ha cumplido la orden que seguia. */
  | { kind: 'standingOrderDone'; actor: TeamId; uid: number }
  /** Una escuadra formada, cambiada o deshecha: como queda (`uids`, las suyas ahora; vacio si ya no existe). */
  | { kind: 'squad'; actor: TeamId; squad: number; change: SquadChange; uids: number[]; name: string; key?: number }
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
      /** Dinero conseguido (funds). */
      funds?: number;
    }
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
  | { kind: 'weather'; actor: null; from: string; to: string };

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
