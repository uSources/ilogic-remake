/**
 * El teclado en el 3D, con las mismas teclas que el juego: la tabla de controls/keyboard.ts con los
 * cambios del jugador (`settings.keys`). Las flechas y WASD, que en 2D mueven el cursor, aqui
 * desplazan la camara mientras se mantienen; el resto de ordenes que la partida 3D sabe hacer van a
 * KEY_ACTIONS (una nueva es una entrada mas).
 */
import type { InputCommand, InputCommandKind } from '../controls/inputCommands';
import { keyCommand } from '../controls/keyboard';
import { settings } from '../settings';
import type { CameraRig } from './cameraRig';
import type { FrameListener } from './world';

/** Lo que hace la rueda por cada pulsacion de las teclas de acercar y alejar. */
const KEY_ZOOM_STEP = 250;

export interface KeyHost {
  rig: CameraRig;
  onFrame(listener: FrameListener): void;
  endTurn(): void;
  nextUnit(): void;
  cancel(): void;
  /** Intro: elegir la opcion señalada del menu abierto. */
  accept(): void;
}

type CommandOf<K extends InputCommandKind> = Extract<InputCommand, { kind: K }>;
type KeyActions = { readonly [K in InputCommandKind]?: (command: CommandOf<K>, host: KeyHost) => void };
type CursorCommand = CommandOf<'cursor'>;

const KEY_ACTIONS: KeyActions = {
  endTurn: (_command, host) => host.endTurn(),
  nextUnit: (_command, host) => host.nextUnit(),
  cancel: (_command, host) => host.cancel(),
  accept: (_command, host) => host.accept(),
  zoom: (command, host) => host.rig.zoom(-command.dir * KEY_ZOOM_STEP),
};

type AnyKeyAction = (command: InputCommand, host: KeyHost) => void;
/** TypeScript no sabe que la entrada de cada orden recibe una orden de esa misma clase. */
const keyActionOf = (command: InputCommand): AnyKeyAction | undefined => KEY_ACTIONS[command.kind] as AnyKeyAction | undefined;

/** La direccion de las teclas de cursor que se mantienen: x a la derecha, y hacia el fondo de la pantalla. */
function panDirection(held: ReadonlyMap<string, CursorCommand>): { right: number; forward: number } {
  const commands = [...held.values()];
  const sum = (pick: (command: CursorCommand) => number) => Math.sign(commands.reduce((total, command) => total + pick(command), 0));
  return { right: sum((command) => command.dx), forward: -sum((command) => command.dy) };
}

export function installKeys(host: KeyHost): void {
  const held = new Map<string, CursorCommand>();
  window.addEventListener('keydown', (event) => {
    const command = keyCommand(event, settings.keys);
    if (!command) return;
    event.preventDefault();
    if (command.kind === 'cursor') return void held.set(event.code, command);
    if (!event.repeat) keyActionOf(command)?.(command, host);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  host.onFrame((seconds) => {
    const { right, forward } = panDirection(held);
    if (right || forward) host.rig.panByKeys(right, forward, seconds);
  });
}
