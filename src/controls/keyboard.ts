import { KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP } from '../menu/nav';
import type { GameCommand } from './commands';

/**
 * Adaptador de teclado: teclas (KeyboardEvent.code) → ordenes del juego. La tabla es la unica fuente
 * de las teclas del mapa; la ayuda (helpText.ts) las explica a mano.
 */
export interface KeyBinding {
  codes: readonly string[];
  command: GameCommand;
  /** Solo con Ctrl (o Cmd en Mac). */
  ctrl?: boolean;
  /** [CAMBIO] Solo con Mayusculas (sin esto, Mayusculas da igual: Mayusculas + Enter es aceptar). */
  shift?: boolean;
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const KEY_BINDINGS: readonly KeyBinding[] = [
  { codes: KEY_UP, command: { kind: 'cursor', dx: 0, dy: -1 } },
  { codes: KEY_DOWN, command: { kind: 'cursor', dx: 0, dy: 1 } },
  { codes: KEY_LEFT, command: { kind: 'cursor', dx: -1, dy: 0 } },
  { codes: KEY_RIGHT, command: { kind: 'cursor', dx: 1, dy: 0 } },
  { codes: KEY_OK, command: { kind: 'accept', wait: false } },
  { codes: ['Backspace'], command: { kind: 'stepBack' } },
  { codes: ['Escape'], command: { kind: 'cancel' } },
  { codes: ['KeyZ'], command: { kind: 'undo' }, ctrl: true },
  { codes: ['KeyE'], command: { kind: 'endTurn' } },
  { codes: ['KeyT'], command: { kind: 'threat' } },
  { codes: ['KeyV'], command: { kind: 'intents' } },
  { codes: ['KeyM'], command: { kind: 'minimap' } },
  { codes: ['KeyF'], command: { kind: 'orderHere' } },
  { codes: ['Tab'], command: { kind: 'nextUnit' } },
  // [CAMBIO] Ordenes a lo elegido y luego la casilla (A, D y S ya mueven el cursor): Q atacar,
  // C capturar, G guardar (defender), X quitar la orden.
  { codes: ['KeyQ'], command: { kind: 'order', order: 'attack' } },
  { codes: ['KeyC'], command: { kind: 'order', order: 'capture' } },
  { codes: ['KeyG'], command: { kind: 'order', order: 'defend' } },
  { codes: ['KeyX'], command: { kind: 'order', order: 'cancel' } },
  // [CAMBIO] Grupos: Ctrl+n lo hace, Mayusculas+n añade, n elige (dos veces: la camara va alli).
  ...DIGITS.map((n): KeyBinding => ({ codes: [`Digit${n}`], command: { kind: 'group', n, mode: 'set' }, ctrl: true })),
  ...DIGITS.map((n): KeyBinding => ({ codes: [`Digit${n}`], command: { kind: 'group', n, mode: 'add' }, shift: true })),
  ...DIGITS.map((n): KeyBinding => ({ codes: [`Digit${n}`], command: { kind: 'group', n, mode: 'select' } })),
  { codes: ['Equal', 'NumpadAdd'], command: { kind: 'zoom', dir: 1 } },
  { codes: ['Minus', 'NumpadSubtract'], command: { kind: 'zoom', dir: -1 } },
  { codes: ['KeyH'], command: { kind: 'help' } },
  { codes: ['KeyO'], command: { kind: 'options' } },
];

/** Lo que hace falta de un KeyboardEvent (para poder probarlo sin navegador). */
export type KeyInput = Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'repeat'>;

/** La orden de una pulsacion, o null si la tecla no hace nada en el mapa. */
export function keyCommand(e: KeyInput): GameCommand | null {
  const ctrl = e.ctrlKey || e.metaKey;
  // Las que piden Mayusculas van antes en la tabla y ganan a la misma tecla sin ellas.
  const b = KEY_BINDINGS.find((k) => k.codes.includes(e.code) && !!k.ctrl === ctrl && (!k.shift || e.shiftKey));
  if (!b) return null;
  if (b.command.kind === 'accept') {
    // Mantener la tecla pulsada no repite la aceptacion (confirmaria varias cosas seguidas).
    if (e.repeat) return null;
    // Mayusculas + Enter al mover: mover y esperar, sin menu.
    return { kind: 'accept', wait: e.shiftKey };
  }
  return b.command;
}
