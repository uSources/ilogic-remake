import { KEY_BACK, KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP } from '../menu/nav';
import type { KeyInput } from './keyboard';

/**
 * Ordenes en los menus (inicio, partida nueva, campaña, opciones, notas de parche, ayuda, fin de
 * partida), sin importar de donde vienen. Igual que GameCommand en el mapa: cada mando las produce y
 * la escena (o el panel) las cumple con `menu(cmd)`.
 */
export type MenuCommand =
  /** Moverse por el menu (una de las dos componentes es 0). */
  | { kind: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  /** Aceptar. `repeat`: viene de mantener pulsado (casi todos los menus lo ignoran). */
  | { kind: 'ok'; repeat: boolean }
  /** Atras o cerrar. */
  | { kind: 'back' }
  /** Atajos propios de algunos menus (abrir o cerrar su panel). */
  | { kind: 'help' }
  | { kind: 'options' }
  | { kind: 'notes' }
  /** Partida nueva: otro mapa al azar. */
  | { kind: 'reroll' };

/**
 * Donde esta el foco de los mandos. 'map': el mapa (ordenes GameCommand); el resto son menus
 * (MenuCommand) y cada uno tiene sus teclas. Las escenas lo dicen con `controlContext()`.
 */
export type MenuContext = 'help' | 'notes' | 'options' | 'home' | 'setup' | 'typing' | 'campaign' | 'end';
export type ControlContext = 'map' | MenuContext;

export interface MenuBinding {
  codes: readonly string[];
  command: MenuCommand;
}

const mv = (dx: -1 | 0 | 1, dy: -1 | 0 | 1): MenuCommand => ({ kind: 'move', dx, dy });

/** Flechas/WASD/teclado numerico, Enter/Espacio y Esc/Retroceso: lo comun a casi todos los menus. */
export const MENU_KEYS: readonly MenuBinding[] = [
  { codes: KEY_UP, command: mv(0, -1) },
  { codes: KEY_DOWN, command: mv(0, 1) },
  { codes: KEY_LEFT, command: mv(-1, 0) },
  { codes: KEY_RIGHT, command: mv(1, 0) },
  { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
  { codes: KEY_BACK, command: { kind: 'back' } },
];

/**
 * Teclas de cada menu. Es la unica fuente de las teclas de los menus (las del mapa estan en
 * KEY_BINDINGS, keyboard.ts).
 */
export const MENU_BINDINGS: Readonly<Record<MenuContext, readonly MenuBinding[]>> = {
  // La ayuda se cierra con Esc, Retroceso, Enter, Espacio o H (las flechas no hacen nada).
  help: [
    { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
    { codes: KEY_BACK, command: { kind: 'back' } },
    { codes: ['KeyH'], command: { kind: 'help' } },
  ],
  notes: [...MENU_KEYS, { codes: ['KeyN'], command: { kind: 'notes' } }],
  options: [...MENU_KEYS, { codes: ['KeyO'], command: { kind: 'options' } }],
  home: [...MENU_KEYS, { codes: ['KeyO'], command: { kind: 'options' } }],
  setup: [...MENU_KEYS, { codes: ['KeyR'], command: { kind: 'reroll' } }],
  // Escribiendo el codigo de un mapa: las letras y el Retroceso son del cuadro de texto.
  typing: [
    { codes: ['Enter', 'NumpadEnter'], command: { kind: 'ok', repeat: false } },
    { codes: ['Escape'], command: { kind: 'back' } },
    { codes: ['ArrowUp'], command: mv(0, -1) },
    { codes: ['ArrowDown'], command: mv(0, 1) },
  ],
  campaign: MENU_KEYS,
  // Fin de partida: una fila de botones; Tab pasa al siguiente y Esc vuelve al menu.
  end: [
    { codes: ['ArrowLeft', 'KeyA'], command: mv(-1, 0) },
    { codes: ['ArrowUp', 'KeyW'], command: mv(0, -1) },
    { codes: ['ArrowRight', 'KeyD', 'Tab'], command: mv(1, 0) },
    { codes: ['ArrowDown', 'KeyS'], command: mv(0, 1) },
    { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
    { codes: ['Escape'], command: { kind: 'back' } },
  ],
};

/** La orden de una pulsacion en un menu, o null si en ese menu la tecla no hace nada. */
export function menuKeyCommand(e: Pick<KeyInput, 'code' | 'repeat'>, ctx: MenuContext): MenuCommand | null {
  const b = MENU_BINDINGS[ctx].find((k) => k.codes.includes(e.code));
  if (!b) return null;
  if (b.command.kind === 'ok') return { kind: 'ok', repeat: e.repeat };
  return b.command;
}

/** Paso en una lista de una sola dimension: izquierda o arriba es -1, derecha o abajo es +1. */
export function listStep(cmd: MenuCommand): -1 | 0 | 1 {
  if (cmd.kind !== 'move') return 0;
  return cmd.dx || cmd.dy;
}
