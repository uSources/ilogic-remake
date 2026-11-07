import type { AttackRecordParts } from './combat';
import type { Pos } from './geometry';
import type { StandingOrder } from './standingOrder';
import type { DefeatReason } from './defeat';
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
 * Por que se puede cortar un camino a mitad (las `pathInterruptions` de los modulos de reglas): los
 * del juego aqui (la emboscada). Un corte nuevo (minas, fuego de vigilancia...) anade su nombre
 * ampliando esta interfaz (`declare module '.../model/events' { interface InterruptionKinds { minas:
 * true } }`, tambien desde el modulo de un modo) y su entrada en la lista de su modulo; la escena y
 * `npm run play` tienen algo por defecto para los que no conocen.
 */
export interface InterruptionKinds {
  ambush: true;
}

/**
 * El nombre de un corte de camino (ver InterruptionKinds). Como la lista se puede ampliar, una tabla
 * indexada por nombre es Partial y tiene algo por defecto (la escena, `npm run play`).
 */
export type InterruptionKind = keyof InterruptionKinds;

/** Lo que ha cortado un camino y donde (la casilla que ya no se ha podido pisar). */
export interface Interruption {
  readonly kind: InterruptionKind;
  readonly at: Pos;
}

/**
 * Como se cumple una orden (suceso 'standingOrderDone'): la de pelear, cuando lo dice quien la
 * cumple ('fulfilled'); la de ir alli, al estar en el destino ('arrived'), al llegar ya este turno
 * (el ultimo trozo lo hace quien juega: 'withinReach') o cuando algo corta su camino (el nombre del
 * corte: 'ambush'...). Quitarla, o moverla a mano con la de ir alli, es un 'standingOrder' sin orden.
 */
export type StandingOrderEnd = 'fulfilled' | 'arrived' | 'withinReach' | InterruptionKind;

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
export type GameEvent = CoreGameEvent | ModuleEvent;

/**
 * Lo de cualquier ataque en su suceso. El suceso lleva ademas lo que han apuntado los modulos
 * (AttackRecordParts: botin, carga...), que no puede llamarse como nada de aqui (AttackPartsFitEvent).
 */
export interface AttackEventBase {
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
  /** Como estaban las dos antes del combate (ver CombatInfo). */
  combat: CombatInfo;
}

/** true si ninguna parte de los modulos se llama como un campo del suceso del ataque (si no, never: no compila quien lo comprueba). */
export type AttackPartsFitEvent = [keyof AttackRecordParts & keyof AttackEventBase] extends [never] ? true : never;

/**
 * Los sucesos de los modulos de reglas, por su tipo (`kind`): esta vacia aqui y cada modulo anade
 * los suyos ampliandola (`declare module '../model/events' { interface ModuleEvents { upkeep: {
 * actor: null; team: TeamId; amount: number } } }`). Quien los lee (la escena, `npm run play`, las
 * estadisticas) tiene algo por defecto para los que no conoce.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- se amplia con declare module
export interface ModuleEvents {}

/** Un suceso de un modulo (ver ModuleEvents). */
export type ModuleEvent = { [K in keyof ModuleEvents]: { kind: K } & ModuleEvents[K] }[keyof ModuleEvents];

/** true si ningun modulo usa el tipo de un suceso de siempre (si no, never). */
export type ModuleEventsAreNew = [keyof ModuleEvents & CoreGameEvent['kind']] extends [never] ? true : never;

/** Los sucesos de cualquier partida (los de los modulos van en ModuleEvents). */
export type CoreGameEvent =
  | { kind: 'move'; actor: TeamId; uid: number; path: Pos[]; interruption?: Interruption }
  | (AttackEventBase & Partial<AttackRecordParts>)
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
  /** Orden permanente dada a estas unidades (null: se la quitan). */
  | { kind: 'standingOrder'; actor: TeamId; uids: number[]; order: StandingOrder | null }
  /** La unidad ha cumplido la orden que seguia, y como (`end`). */
  | { kind: 'standingOrderDone'; actor: TeamId; uid: number; end: StandingOrderEnd }
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
  /** Fin de ronda: empieza el dia `day`. */
  | { kind: 'newDay'; actor: null; day: number }
  /** El equipo `actor` se ha rendido. */
  | { kind: 'surrender'; actor: TeamId }
  /** Con lo que ha hecho `actor` (null: al acabar la ronda), el equipo `team` ha caido (ya no juega), por `reason`. */
  | { kind: 'teamDefeated'; actor: TeamId | null; team: TeamId; reason: DefeatReason }
  /** Empieza el turno del equipo `actor` en el dia `day` (lo que hagan sus TURN_START_PHASES va detras). */
  | { kind: 'turnStart'; actor: TeamId; day: number }
  /** Acaba el turno del equipo `actor` y le toca a `next` (si acaba la ronda, sus sucesos van detras). */
  | { kind: 'turnEnd'; actor: TeamId; next: TeamId };

/** Tipo de evento ('move', 'attack'... y los de los modulos). */
export type GameEventKind = GameEvent['kind'];
/** Tipo de un suceso de cualquier partida (no de un modulo). */
export type CoreGameEventKind = CoreGameEvent['kind'];
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
