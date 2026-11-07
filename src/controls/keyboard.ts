import { KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP } from '../menu/nav';
import type { InputCommand } from './inputCommands';

/**
 * Adaptador de teclado: teclas (KeyboardEvent.code) → ordenes del juego. Las tablas de aqui son la
 * unica fuente de las teclas del mapa: las fijas (`FIXED_KEYS`) y las que el jugador puede cambiar en
 * Opciones (`REBINDABLE_KEYS`, con su tecla de serie; los cambios van en `Settings.keys`). La ayuda y
 * la interfaz las enseñan con `keyName` (keyNames.ts), no a mano.
 */
export interface KeyBinding {
  codes: readonly string[];
  command: InputCommand;
  /** Solo con Ctrl (o Cmd en Mac). */
  ctrl?: boolean;
  /** [CAMBIO] Solo con Mayusculas (sin esto, Mayusculas da igual: Mayusculas + Enter es aceptar). */
  shift?: boolean;
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Teclas que no se cambian: cursor, aceptar, deshacer y los grupos con numero. */
export const FIXED_KEYS: readonly KeyBinding[] = [
  { codes: KEY_UP, command: { kind: 'cursor', dx: 0, dy: -1 } },
  { codes: KEY_DOWN, command: { kind: 'cursor', dx: 0, dy: 1 } },
  { codes: KEY_LEFT, command: { kind: 'cursor', dx: -1, dy: 0 } },
  { codes: KEY_RIGHT, command: { kind: 'cursor', dx: 1, dy: 0 } },
  { codes: KEY_OK, command: { kind: 'accept', wait: false } },
  { codes: ['KeyZ'], command: { kind: 'undo' }, ctrl: true },
  // [CAMBIO] Grupos: Ctrl+n lo hace, Mayusculas+n añade, n elige (dos veces: la camara va alli).
  ...DIGITS.map((digit): KeyBinding => ({ codes: [`Digit${digit}`], command: { kind: 'group', n: digit, mode: 'set' }, ctrl: true })),
  ...DIGITS.map((digit): KeyBinding => ({ codes: [`Digit${digit}`], command: { kind: 'group', n: digit, mode: 'add' }, shift: true })),
  ...DIGITS.map((digit): KeyBinding => ({ codes: [`Digit${digit}`], command: { kind: 'group', n: digit, mode: 'select' } })),
];

/** Las ordenes cuya tecla elige el jugador, en el orden en que salen en Opciones. */
export const KEY_BINDING_IDS = [
  'endTurn',
  'nextUnit',
  'orderHere',
  'orderAttack',
  'orderCapture',
  'orderDefend',
  'orderCancel',
  'threat',
  'intents',
  'minimap',
  'zoomIn',
  'zoomOut',
  'stepBack',
  'cancel',
  'help',
  'options',
] as const;
export type KeyBindingId = (typeof KEY_BINDING_IDS)[number];

/** Las teclas de serie de cada orden que se puede cambiar (sin Ctrl ni Mayusculas: una tecla sola). */
export const REBINDABLE_KEYS: Readonly<Record<KeyBindingId, Pick<KeyBinding, 'codes' | 'command'>>> = {
  endTurn: { codes: ['KeyE'], command: { kind: 'endTurn' } },
  nextUnit: { codes: ['Tab'], command: { kind: 'nextUnit' } },
  orderHere: { codes: ['KeyF'], command: { kind: 'orderHere' } },
  // [CAMBIO] Ordenes a lo elegido y luego la casilla (A, D y S ya mueven el cursor): Q atacar,
  // C capturar, G guardar (defender), X quitar la orden.
  orderAttack: { codes: ['KeyQ'], command: { kind: 'order', order: 'attack' } },
  orderCapture: { codes: ['KeyC'], command: { kind: 'order', order: 'capture' } },
  orderDefend: { codes: ['KeyG'], command: { kind: 'order', order: 'defend' } },
  orderCancel: { codes: ['KeyX'], command: { kind: 'order', order: 'cancel' } },
  threat: { codes: ['KeyT'], command: { kind: 'threat' } },
  intents: { codes: ['KeyV'], command: { kind: 'intents' } },
  minimap: { codes: ['KeyM'], command: { kind: 'minimap' } },
  zoomIn: { codes: ['Equal', 'NumpadAdd'], command: { kind: 'zoom', dir: 1 } },
  zoomOut: { codes: ['Minus', 'NumpadSubtract'], command: { kind: 'zoom', dir: -1 } },
  stepBack: { codes: ['Backspace'], command: { kind: 'stepBack' } },
  cancel: { codes: ['Escape'], command: { kind: 'cancel' } },
  help: { codes: ['KeyH'], command: { kind: 'help' } },
  options: { codes: ['KeyO'], command: { kind: 'options' } },
};

/** Las teclas que el jugador ha cambiado: solo las distintas de las de serie (KeyboardEvent.code). */
export type KeyOverrides = Readonly<Partial<Record<KeyBindingId, string>>>;

export const isKeyBindingId = (value: unknown): value is KeyBindingId => KEY_BINDING_IDS.includes(value as KeyBindingId);

/** La tecla (o teclas) con que se da ahora una orden: la elegida por el jugador o las de serie. */
export const keyCodesOf = (id: KeyBindingId, overrides: KeyOverrides): readonly string[] => {
  const chosen = overrides[id];
  return chosen ? [chosen] : REBINDABLE_KEYS[id].codes;
};

/** Todas las teclas del mapa con los cambios del jugador puestos. */
export const keyBindings = (overrides: KeyOverrides): readonly KeyBinding[] => [
  ...FIXED_KEYS,
  ...KEY_BINDING_IDS.map((id): KeyBinding => ({ codes: keyCodesOf(id, overrides), command: REBINDABLE_KEYS[id].command })),
];

/** Las teclas de serie. */
export const KEY_BINDINGS: readonly KeyBinding[] = keyBindings({});

/** Lo que hace falta de un KeyboardEvent (para poder probarlo sin navegador). */
export type KeyInput = Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'repeat'>;

/** La orden de una pulsacion, o null si la tecla no hace nada en el mapa. */
export function keyCommand(key: KeyInput, overrides: KeyOverrides = {}): InputCommand | null {
  const isCtrl = key.ctrlKey || key.metaKey;
  const matches = (binding: KeyBinding) =>
    binding.codes.includes(key.code) && !!binding.ctrl === isCtrl && (!binding.shift || key.shiftKey);
  // Las que piden Mayusculas van antes en la tabla y ganan a la misma tecla sin ellas.
  const binding = keyBindings(overrides).find(matches);
  if (!binding) return null;
  if (binding.command.kind !== 'accept') return binding.command;
  // Mantener la tecla pulsada no repite la aceptacion (confirmaria varias cosas seguidas).
  if (key.repeat) return null;
  // Mayusculas + Enter al mover: mover y esperar, sin menu.
  return { kind: 'accept', wait: key.shiftKey };
}

/** Por que una tecla no vale para una orden: ya la usa otra que se puede cambiar, o una fija. */
export type KeyConflict = { kind: 'fixed' } | { kind: 'binding'; id: KeyBindingId } | { kind: 'modifier' };

/** Teclas que no son una pulsacion por si mismas (acompañan a otra). */
const MODIFIER_CODES = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'];

/**
 * Lo que impide dar la tecla `code` a la orden `id`, o null si se puede (tambien si ya es la suya).
 * Una tecla fija choca aunque pida Ctrl o Mayusculas: asi 1…9 o Z nunca hacen dos cosas.
 */
export function keyConflict(id: KeyBindingId, code: string, overrides: KeyOverrides): KeyConflict | null {
  if (MODIFIER_CODES.includes(code)) return { kind: 'modifier' };
  if (FIXED_KEYS.some((binding) => binding.codes.includes(code))) return { kind: 'fixed' };
  const taken = KEY_BINDING_IDS.find((other) => other !== id && keyCodesOf(other, overrides).includes(code));
  return taken ? { kind: 'binding', id: taken } : null;
}

/** Los cambios del jugador con la orden `id` en la tecla `code` (si vuelve a la de serie, se quita el cambio). */
export function withKeyBound(overrides: KeyOverrides, id: KeyBindingId, code: string): KeyOverrides {
  const { [id]: _previous, ...rest } = overrides;
  return REBINDABLE_KEYS[id].codes.includes(code) ? rest : { ...rest, [id]: code };
}

/**
 * Lo guardado como cambios de teclas, sin fiarse: solo las ordenes que existen con una tecla que sea
 * texto; el resto se ignora (es de otra version o esta roto).
 */
export function parseKeyOverrides(saved: unknown): KeyOverrides {
  if (typeof saved !== 'object' || saved === null) return {};
  const overrides: Partial<Record<KeyBindingId, string>> = {};
  for (const [id, code] of Object.entries(saved)) if (isKeyBindingId(id) && typeof code === 'string' && code) overrides[id] = code;
  return overrides;
}
