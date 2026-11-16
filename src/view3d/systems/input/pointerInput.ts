/**
 * El raton (y el dedo) sobre el mundo 3D: con el boton izquierdo, arrastrar desplaza la camara y
 * soltar sin arrastrar toca la casilla; con el central, arrastrar desplaza (como en los juegos de
 * estrategia y los programas 3D); con el derecho, gira la camara alrededor del punto mirado; la rueda
 * acerca y aleja. Que hacer con la casilla tocada lo dice quien lo instala.
 */
import type { Pos } from '../../../core/model';
import type { CameraControls } from '../camera/strategyCamera';

/** Se considera arrastre (y no toque) si el puntero se mueve mas de esto en pixeles. */
const DRAG_THRESHOLD = 6;
/** Radianes que gira la camara por pixel arrastrado con el boton derecho. */
const ORBIT_PER_PIXEL = 0.008;

export interface PointerHost {
  /** La camara como logica: la entrada pide desplazar, girar y acercar. */
  camera: CameraControls;
  /** La casilla bajo ese punto de la pantalla (null fuera del mapa). */
  tileAt(clientX: number, clientY: number): Pos | null;
  hover(pos: Pos | null): void;
  tap(pos: Pos): void;
}

type DragKind = 'pan' | 'orbit';

/** Que hace cada boton del raton (por `PointerEvent.button`): como arrastra y si soltarlo sin arrastrar toca la casilla. */
interface ButtonRole {
  drag: DragKind;
  taps: boolean;
}

const BUTTON_ROLES: Readonly<Record<number, ButtonRole>> = {
  0: { drag: 'pan', taps: true },
  1: { drag: 'pan', taps: false },
  2: { drag: 'orbit', taps: false },
};

interface Press extends ButtonRole {
  x: number;
  y: number;
  isDrag: boolean;
}

function drag(press: Press, event: PointerEvent, canvas: HTMLCanvasElement, camera: CameraControls): void {
  if (press.drag === 'orbit') return camera.orbit(-event.movementX * ORBIT_PER_PIXEL, event.movementY * ORBIT_PER_PIXEL);
  const scale = camera.tilesPerPixel(canvas.clientHeight);
  camera.pan(-event.movementX * scale, event.movementY * scale);
}

export function installPointer(canvas: HTMLCanvasElement, host: PointerHost): void {
  let press: Press | null = null;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    const role = BUTTON_ROLES[event.button];
    if (!role) return;
    // Sin esto, el boton central abre el desplazamiento automatico del navegador.
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    press = { ...role, x: event.clientX, y: event.clientY, isDrag: false };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!press) return host.hover(host.tileAt(event.clientX, event.clientY));
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD) press.isDrag = true;
    if (press.isDrag) drag(press, event, canvas, host.camera);
  });
  canvas.addEventListener('pointerup', (event) => {
    const isTap = !!press?.taps && !press.isDrag;
    press = null;
    const pos = isTap ? host.tileAt(event.clientX, event.clientY) : null;
    if (pos) host.tap(pos);
  });
  canvas.addEventListener('wheel', (event) => host.camera.zoom(event.deltaY), { passive: true });
}
