import type { GameEvent } from './events';
import type { Pos } from './geometry';
import type { StandingOrder } from './standingOrder';

/**
 * Lo que quiere hacer quien juega un equipo: la unica forma de cambiar la partida (ver
 * core/actions.ts, `dispatch`). Son datos que se pueden guardar o mandar por la red: nombran las
 * unidades por su uid y las casillas por su Pos, nunca con objetos de la partida.
 */
export type GameAction =
  /** Mover la unidad a `to`; `path`, el camino trazado (si no vale, el mas corto). */
  | { kind: 'move'; uid: number; to: Pos; path?: Pos[] }
  /** Deshacer el ultimo movimiento de la unidad, si es lo ultimo que se ha hecho (ver UndoableMove y rules/undo.ts). */
  | { kind: 'undoMove'; uid: number }
  | { kind: 'attack'; uid: number; target: number }
  | { kind: 'capture'; uid: number }
  /** Ir hasta `into` (del mismo tipo) y fundirse con ella. */
  | { kind: 'merge'; uid: number; into: number }
  /** Ir hasta el transporte `into` y subir. */
  | { kind: 'load'; uid: number; into: number }
  /** El transporte `uid` baja a `passenger` en la casilla vecina `to`. */
  | { kind: 'unload'; uid: number; passenger: number; to: Pos }
  | { kind: 'supply'; uid: number }
  | { kind: 'wait'; uid: number }
  | { kind: 'deleteUnit'; uid: number }
  /** Fabricar una unidad de ese tipo (id de units.json) en el edificio de `at`. */
  | { kind: 'buy'; at: Pos; unitType: string }
  /** Un poder del general del equipo; `target`, la casilla de los de area. */
  | { kind: 'usePower'; power: string; target: Pos | null }
  /**
   * El paso de este turno de la orden de ir alli ('goto') de la unidad: hacia su destino lo que pueda;
   * si ya llega este turno, la orden acaba sin moverla (el ultimo trozo lo hace quien juega).
   */
  | { kind: 'gotoStep'; uid: number }
  | { kind: 'giveStandingOrder'; uids: number[]; order: StandingOrder }
  | { kind: 'cancelStandingOrder'; uids: number[] }
  /** La unidad ha cumplido la orden que seguia (la decide quien la cumple: ver autopilot/standingOrders.ts). */
  | { kind: 'finishStandingOrder'; uid: number }
  | { kind: 'formSquad'; uids: number[]; name?: string; key?: number }
  /** Estas unidades pasan a ser el grupo de esa tecla (Ctrl + numero). */
  | { kind: 'setGroup'; uids: number[]; key: number }
  /** Añadir estas unidades al grupo de esa tecla (Mayusculas + numero). */
  | { kind: 'addToGroup'; uids: number[]; key: number }
  | { kind: 'leaveSquad'; uids: number[] }
  | { kind: 'renameSquad'; squad: number; name: string }
  | { kind: 'disbandSquad'; squad: number }
  /** El equipo se rinde: cuenta como derrotado (ver isDefeated) aunque le quede de todo. */
  | { kind: 'surrender' }
  /** Empieza el turno del equipo al que le toca (sus TURN_START_PHASES: los viajes de varios turnos). */
  | { kind: 'startTurn' }
  /**
   * Acaba el turno del equipo (sus TURN_END_PHASES: las capturas que siguen solas) y pasa al
   * siguiente que juega; tras el ultimo de la ronda, el fin de ronda (ROUND_PHASES).
   */
  | { kind: 'endTurn' };

/** Tipo de accion ('move', 'attack'...). */
export type GameActionKind = GameAction['kind'];
/** La accion de un tipo concreto, p. ej. `GameActionOf<'attack'>`. */
export type GameActionOf<K extends GameActionKind> = Extract<GameAction, { kind: K }>;

/** Por que no vale una accion (lo dice `validate`; la partida no cambia). */
export type ActionRejection =
  /** No tiene la forma de una accion: un `kind` que no existe o un campo que no es lo que dice GameAction. */
  | 'badAction'
  /** Quien la manda no es un equipo de la partida. */
  | 'notATeam'
  /** La partida ya ha acabado (ver matchResult): nadie juega mas. */
  | 'matchOver'
  /** No es el turno de ese equipo (`GameState.turn`). */
  | 'notYourTurn'
  /** Su turno aun no ha empezado ('startTurn'), o ya habia empezado (al pedir empezarlo otra vez). */
  | 'turnNotStarted'
  | 'turnStarted'
  /** Empezar o acabar un turno: lo hace la sesion (core/session), no quien juega el equipo. */
  | 'sessionOnly'
  /** El equipo ya ha perdido (ver isDefeated): no juega mas. */
  | 'defeated'
  /** La partida no se puede perder (su modo no tiene forma de acabar): rendirse no vale. */
  | 'cannotLose'
  /** Una unidad, edificio o escuadra que nombra no existe (o no hay ninguna). */
  | 'missing'
  /** Es de otro equipo. */
  | 'notYours'
  /** Va dentro de un transporte (o tendria que ir). */
  | 'transported'
  /** Ya ha hecho lo que podia este turno. */
  | 'spent'
  /** No llega (destino o camino fuera de su alcance). */
  | 'unreachable'
  /** Deshacer: no es su ultimo movimiento, o ya ha hecho algo despues. */
  | 'nothingToUndo'
  /** Ir alli a donde ya llega este turno (o donde ya esta): para eso se mueve. */
  | 'withinReach'
  /** Deshacer: el movimiento descubrio enemigos (con niebla, volver atras seria mirar gratis). */
  | 'revealed'
  /** El objetivo no se puede atacar: no es enemigo, no se ve, esta lejos o no le hace nada. */
  | 'notTarget'
  | 'cannotCapture'
  | 'cannotMerge'
  | 'cannotLoad'
  | 'cannotUnload'
  /** No hay nadie al lado a quien reparar. */
  | 'nobodyToSupply'
  /** Fuera del mapa. */
  | 'offBoard'
  /** Comprar: el edificio no la fabrica, no hay sitio, falta dinero o no cabe en el ejercito. */
  | 'notBuiltHere'
  | 'occupied'
  | 'funds'
  | 'units'
  | 'command'
  /** Poderes del general (ver PowerBlock en generals.ts). */
  | 'noGeneral'
  | 'unknownPower'
  | 'powerUsed'
  | 'charge'
  | 'needsTarget'
  /** Ordenes permanentes (ver standingOrderBlock): capturar donde no hay nada, o sin nadie que capture. */
  | 'noBuilding'
  | 'noCapturer'
  /** Atacar o defender sin ninguna unidad que luche. */
  | 'noFighter'
  /** No lleva ninguna orden que cumplir o quitar. */
  | 'noStandingOrder'
  /** Escuadras: tecla de grupo fuera de 1-9, nombre vacio o ninguna de ellas va en una escuadra. */
  | 'badKey'
  | 'badName'
  | 'notInSquad';

/** Lo que ha pasado al mandar una accion: sus sucesos, o por que no valia. */
export type ActionResult = { ok: true; events: GameEvent[] } | { ok: false; reason: ActionRejection };

/**
 * Lo que decide quien juega un equipo (la IA, las ordenes permanentes), paso a paso: propone cada
 * accion (`yield`) y recibe lo que ha dicho la partida de ella; no la manda el. Quien lo cumple (la
 * sesion, el paso de fin de turno, la prevision sobre una copia) manda cada accion por su via y le
 * contesta con su resultado (`carryOut`, actions/plan.ts). Devuelve lo que diga el plan (si ha usado
 * la unidad, que ordenes se han cumplido...).
 */
export type ActionPlan<Result = void> = Generator<GameAction, Result, ActionResult>;
