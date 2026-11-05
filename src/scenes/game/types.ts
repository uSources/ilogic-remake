/**
 * Tipos y constantes que comparten GameScene y sus modulos (src/scenes/game). Sin Phaser: se pueden
 * importar desde los tests.
 */
import type { UnitActions } from '../../core/rules';
import type { GameSetup, Pos, RulesConfig, Unit } from '../../core/model';
import type { LabOptions } from '../../lab';
import type { TextKey } from '../../settings';

/**
 * Fases de la partida (equivalen a las del original, docs/SPEC-INTERFAZ.md §2):
 * map 3, gameMenu 4, unitMenu 5, buy 6, move 7, attack 8, unloadPick 11, unloadTile 12.
 * "busy" = animando o jugando la IA (no se acepta entrada).
 */
export type Phase =
  'map' | 'gameMenu' | 'unitMenu' | 'groupMenu' | 'orderMenu' | 'buy' | 'move' | 'attack' | 'unloadPick' | 'unloadTile' | 'target' | 'busy';

export type ActionKey = keyof UnitActions;
/** Orden de las opciones del menu de una unidad. */
export const ACTION_ORDER: ActionKey[] = [
  'attack',
  'capture',
  'unload',
  'supply',
  'wait',
  'orderToAttack',
  'orderToCapture',
  'orderToDefend',
  'cancelOrder',
  'back',
  'delete',
];
export type GameMenuKey = 'endTurn' | 'save' | 'replay' | 'options' | 'help' | 'surrender' | 'quit' | 'resume';
export const GAME_MENU: GameMenuKey[] = ['resume', 'endTurn', 'save', 'replay', 'options', 'help', 'surrender', 'quit'];

export type EndButton = 'rematch' | 'new' | 'menu' | 'next' | 'retry';
export const END_LABEL: Record<EndButton, TextKey> = {
  rematch: 'endRematch',
  new: 'newGame',
  menu: 'endMenu',
  next: 'endNext',
  retry: 'endRetry',
};

/** Que pasaria al soltar la unidad elegida en una casilla. */
export type Intent =
  | { kind: 'none' }
  | { kind: 'stay' }
  | { kind: 'move'; to: Pos; capture: boolean }
  | { kind: 'attack'; from: Pos; target: Unit }
  | { kind: 'merge'; target: Unit }
  | { kind: 'load'; target: Unit };

/** Donde estaba la unidad antes de moverla (para "Atras" en su menu). */
export interface MoveUndo extends Pos {
  uid: number;
}

/** Fases en las que el cursor sigue al puntero. */
export const CURSOR_PHASES: Phase[] = ['map', 'move', 'attack', 'unloadTile', 'target'];
/** Fases con un menu de bocadillo abierto. */
export const MENU_PHASES: Phase[] = ['gameMenu', 'unitMenu', 'groupMenu', 'orderMenu', 'buy', 'unloadPick'];
/** Milisegundos por casilla al mover, a velocidad normal. */
export const STEP_MS = 70;
/** Tiempo sin aceptar Enter/clic al volver el turno al jugador. */
export const INPUT_LOCK_MS = 350;
/** Ventana para confirmar acciones pulsando dos veces (terminar turno, salir, rendirse). */
export const CONFIRM_MS = 2500;

/** Como empieza una partida (scene.start('Game', data)). */
export interface GameStartData {
  /** new: mapa al azar o con `setup`; load: la guardada; mission: `mission`; state: `state` (JSON de una partida). */
  mode?: 'new' | 'load' | 'mission' | 'state' | 'lab';
  /** Laboratorio de animaciones (src/lab.ts). */
  lab?: LabOptions;
  rules?: Partial<RulesConfig>;
  setup?: GameSetup;
  mission?: string;
  state?: string;
  /** Partida nueva: general del jugador y de la IA (id de generals.json). */
  general?: string | null;
  enemyGeneral?: string | null;
}
