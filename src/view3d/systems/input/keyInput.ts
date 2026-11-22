/**
 * El teclado en el 3D, con las mismas teclas que el juego: la tabla de controls/keyboard.ts con los
 * cambios del jugador (`settings.keys`). Las flechas y WASD, que en 2D mueven el cursor, aqui
 * desplazan la camara mientras se mantienen; el resto de ordenes que la partida 3D sabe hacer van a
 * KEY_ACTIONS (una nueva es una entrada mas). Con un panel abierto encima del mapa (opciones, ayuda),
 * las teclas son suyas, como en el menu principal: ordenes de menu (controls/menu.ts), y el mapa no
 * recibe ninguna.
 */
import type { GroupMode, InputCommand, InputCommandKind } from '../../../controls/inputCommands';
import { keyCommand, type KeyInput } from '../../../controls/keyboard';
import { menuKeyCommand, type MenuCommand, type MenuContext } from '../../../controls/menu';
import type { SoundPort } from '../../../audio/sounds';
import { settings } from '../../../settings';
import type { CameraControls } from '../camera/strategyCamera';
import type { FrameListener } from '../../ports/frame';
import { menuSound } from '../sound/soundCues';

/** Lo que hace la rueda por cada pulsacion de las teclas de acercar y alejar. */
const KEY_ZOOM_STEP = 250;

/** Un panel que se abre encima del mapa (opciones, ayuda): mientras esta abierto, el teclado es suyo. */
export interface KeyPanel {
  readonly isOpen: boolean;
  /** Que teclas valen en el ahora (MENU_BINDINGS de controls/menu.ts). */
  context(): MenuContext;
  command(command: MenuCommand): void;
}

export interface KeyHost {
  /** La camara como logica: la entrada pide desplazar y acercar, no mueve objetos del motor. */
  camera: CameraControls;
  onFrame(listener: FrameListener): void;
  /** Los paneles que se abren encima del mapa; el primero abierto se queda con las teclas. */
  panels: readonly KeyPanel[];
  /** Donde suenan las ordenes de menu de los paneles (moverse, aceptar, volver), como en el menu. */
  sounds: SoundPort;
  endTurn(): void;
  nextUnit(): void;
  cancel(): void;
  /** Intro: elegir la opcion señalada del menu abierto. */
  accept(): void;
  /** Teclas de grupo (1-9; con Ctrl lo hace, con Mayusculas lo añade). */
  group(n: number, mode: GroupMode): void;
  /** Ver u ocultar lo que haran todas las ordenes al terminar el turno. */
  intents(): void;
  /** Q, C, G: orden de atacar, capturar o defender (luego la casilla); X la quita. */
  order(order: 'attack' | 'capture' | 'defend' | 'cancel'): void;
  /** T: ver u ocultar a donde llegan los enemigos. */
  threat(): void;
  /** F: la orden que tiene sentido en la casilla señalada (como el clic derecho). */
  orderHere(): void;
  /** Ctrl+Z: deshacer el ultimo movimiento. */
  undo(): void;
  /** M: abrir o cerrar el minimapa. */
  minimap(): void;
  /** H: abrir la ayuda. */
  help(): void;
  /** O: abrir las opciones. */
  options(): void;
}

type CommandOf<K extends InputCommandKind> = Extract<InputCommand, { kind: K }>;
type KeyActions = { readonly [K in InputCommandKind]?: (command: CommandOf<K>, host: KeyHost) => void };
type CursorCommand = CommandOf<'cursor'>;

const KEY_ACTIONS: KeyActions = {
  endTurn: (_command, host) => host.endTurn(),
  nextUnit: (_command, host) => host.nextUnit(),
  cancel: (_command, host) => host.cancel(),
  accept: (_command, host) => host.accept(),
  zoom: (command, host) => host.camera.zoom(-command.dir * KEY_ZOOM_STEP),
  group: (command, host) => host.group(command.n, command.mode),
  order: (command, host) => host.order(command.order),
  intents: (_command, host) => host.intents(),
  orderHere: (_command, host) => host.orderHere(),
  threat: (_command, host) => host.threat(),
  undo: (_command, host) => host.undo(),
  minimap: (_command, host) => host.minimap(),
  help: (_command, host) => host.help(),
  options: (_command, host) => host.options(),
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

/** Lo que hace falta de una tecla pulsada (un KeyboardEvent, o uno falso en los tests). */
export type KeyPress = KeyInput & Pick<KeyboardEvent, 'preventDefault'>;

/** Reparte las teclas entre el panel abierto y el mapa, sin escuchar al navegador (eso es installKeys). */
export class KeyRouter {
  /** Las teclas de cursor que se mantienen pulsadas en el mapa (desplazan la camara). */
  private readonly held = new Map<string, CursorCommand>();

  constructor(private readonly host: KeyHost) {}

  press(key: KeyPress): void {
    const panel = this.openPanel();
    if (panel) return this.pressInPanel(key, panel);
    this.pressOnMap(key);
  }

  release(code: string): void {
    this.held.delete(code);
  }

  releaseAll(): void {
    this.held.clear();
  }

  /** Cada fotograma, la camara se desplaza con las teclas de cursor mantenidas (no detras de un panel). */
  frame(seconds: number): void {
    if (this.openPanel()) return;
    const { right, forward } = panDirection(this.held);
    if (right || forward) this.host.camera.panByKeys(right, forward, seconds);
  }

  private openPanel(): KeyPanel | undefined {
    return this.host.panels.find((panel) => panel.isOpen);
  }

  private pressInPanel(key: KeyPress, panel: KeyPanel): void {
    const command = menuKeyCommand(key, panel.context());
    if (!command) return;
    // La tecla es del panel: tampoco para el navegador (Tab, F5... al elegir la tecla nueva de una orden).
    key.preventDefault();
    const sound = menuSound(command);
    if (sound) this.host.sounds.play(sound);
    panel.command(command);
  }

  private pressOnMap(key: KeyPress): void {
    const command = keyCommand(key, settings.keys);
    if (!command) return;
    key.preventDefault();
    if (command.kind === 'cursor') return void this.held.set(key.code, command);
    if (!key.repeat) keyActionOf(command)?.(command, this.host);
  }
}

export function installKeys(host: KeyHost): void {
  const router = new KeyRouter(host);
  window.addEventListener('keydown', (event) => router.press(event));
  window.addEventListener('keyup', (event) => router.release(event.code));
  window.addEventListener('blur', () => router.releaseAll());
  host.onFrame((seconds) => router.frame(seconds));
}
