import { KEY_BACK, KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP } from '../menu/nav';
import type { KeyInput } from './keyboard';

/**
 * Ordenes en los menus (inicio, partida nueva, campaña, opciones, notas de parche, ayuda, fin de
 * partida), sin importar de donde vienen. Igual que InputCommand en el mapa: cada mando las produce y
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
  | { kind: 'reroll' }
  /** Opciones, cambiando una tecla: la pulsada (KeyboardEvent.code), sea la que sea. */
  | { kind: 'key'; code: string }
  /** Opciones: la pestaña anterior o la siguiente. */
  | { kind: 'tab'; dir: -1 | 1 };

/**
 * Que menu tiene el foco de los mandos: cada uno tiene sus teclas (MenuCommand). En el mapa no hay
 * menu: alli mandan las ordenes InputCommand.
 */
export type MenuContext =
  | 'help'
  | 'notes'
  | 'options'
  | 'keyCapture'
  | 'home'
  | 'setup'
  | 'typing'
  | 'campaign'
  | 'online'
  | 'end'
  | 'endPeek'
  | 'pause'
  | 'buy'
  | 'handoff';

export interface MenuBinding {
  codes: readonly string[];
  command: MenuCommand;
}

const move = (dx: -1 | 0 | 1, dy: -1 | 0 | 1): MenuCommand => ({ kind: 'move', dx, dy });

/** Flechas/WASD/teclado numerico, Enter/Espacio y Esc/Retroceso: lo comun a casi todos los menus. */
export const MENU_KEYS: readonly MenuBinding[] = [
  { codes: KEY_UP, command: move(0, -1) },
  { codes: KEY_DOWN, command: move(0, 1) },
  { codes: KEY_LEFT, command: move(-1, 0) },
  { codes: KEY_RIGHT, command: move(1, 0) },
  { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
  { codes: KEY_BACK, command: { kind: 'back' } },
];

/**
 * Teclas de cada menu. Es la unica fuente de las teclas de los menus (las del mapa estan en
 * KEY_BINDINGS, keyboard.ts).
 */
export const MENU_BINDINGS: Readonly<Record<MenuContext, readonly MenuBinding[]>> = {
  // La ayuda se cierra con Esc, Retroceso, Enter, Espacio o H; arriba y abajo cambian de tema.
  help: [
    { codes: KEY_UP, command: move(0, -1) },
    { codes: KEY_DOWN, command: move(0, 1) },
    { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
    { codes: KEY_BACK, command: { kind: 'back' } },
    { codes: ['KeyH'], command: { kind: 'help' } },
  ],
  notes: [...MENU_KEYS, { codes: ['KeyN'], command: { kind: 'notes' } }],
  // Opciones: Q y E cambian de pestaña (izquierda y derecha cambian el valor de la fila).
  options: [
    ...MENU_KEYS,
    { codes: ['KeyO'], command: { kind: 'options' } },
    { codes: ['KeyQ'], command: { kind: 'tab', dir: -1 } },
    { codes: ['KeyE'], command: { kind: 'tab', dir: 1 } },
  ],
  // Opciones esperando la tecla nueva de una orden: Esc lo deja; cualquier otra es la elegida (`key`).
  keyCapture: [{ codes: ['Escape'], command: { kind: 'back' } }],
  home: [...MENU_KEYS, { codes: ['KeyO'], command: { kind: 'options' } }],
  setup: [...MENU_KEYS, { codes: ['KeyR'], command: { kind: 'reroll' } }],
  // Escribiendo el codigo de un mapa: las letras y el Retroceso son del cuadro de texto.
  typing: [
    { codes: ['Enter', 'NumpadEnter'], command: { kind: 'ok', repeat: false } },
    { codes: ['Escape'], command: { kind: 'back' } },
    { codes: ['ArrowUp'], command: move(0, -1) },
    { codes: ['ArrowDown'], command: move(0, 1) },
  ],
  campaign: MENU_KEYS,
  // Jugar en línea: R cambia el mapa al crear una sala.
  online: [...MENU_KEYS, { codes: ['KeyR'], command: { kind: 'reroll' } }],
  // Fin de partida: sus botones, uno debajo de otro (Tab pasa al siguiente). Esc no hace nada: salir
  // de la partida acabada es un boton, no una tecla que se pulsa sin querer.
  end: [
    { codes: ['ArrowLeft', 'KeyA'], command: move(-1, 0) },
    { codes: ['ArrowUp', 'KeyW'], command: move(0, -1) },
    { codes: ['ArrowRight', 'KeyD', 'Tab'], command: move(1, 0) },
    { codes: ['ArrowDown', 'KeyS'], command: move(0, 1) },
    { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
  ],
  // La pausa de la partida: moverse por sus opciones, elegir y cerrarla. Sus atajos (fin del turno,
  // amenaza...) son las teclas del mapa que tenga el jugador: no van aqui (KeyPanel.shortcut, keyInput.ts).
  pause: MENU_KEYS,
  // La compra en una fabrica, como la pausa: arriba y abajo señalan, Enter compra y Esc sale sin comprar.
  buy: MENU_KEYS,
  // Mirando el tablero desde el final: Esc, Retroceso, Enter o Espacio vuelven al resultado.
  endPeek: [
    { codes: KEY_OK, command: { kind: 'ok', repeat: false } },
    { codes: KEY_BACK, command: { kind: 'back' } },
  ],
  // El cambio de jugador en la misma pantalla: solo su boton, «Empezar mi turno» (nada del mapa detras).
  handoff: [{ codes: KEY_OK, command: { kind: 'ok', repeat: false } }],
};

/** La orden de una pulsacion en un menu, o null si en ese menu la tecla no hace nada. */
export function menuKeyCommand(key: Pick<KeyInput, 'code' | 'repeat'>, context: MenuContext): MenuCommand | null {
  const binding = MENU_BINDINGS[context].find((candidate) => candidate.codes.includes(key.code));
  if (!binding) return context === 'keyCapture' ? { kind: 'key', code: key.code } : null;
  if (binding.command.kind === 'ok') return { kind: 'ok', repeat: key.repeat };
  return binding.command;
}

/** Paso en una lista de una sola dimension: izquierda o arriba es -1, derecha o abajo es +1. */
export function listStep(command: MenuCommand): -1 | 0 | 1 {
  if (command.kind !== 'move') return 0;
  return command.dx || command.dy;
}
