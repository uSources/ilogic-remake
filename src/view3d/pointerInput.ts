/**
 * El raton (y el dedo) sobre el mundo 3D: con el boton izquierdo, arrastrar desplaza la camara y
 * soltar sin arrastrar toca la casilla; con el derecho, arrastrar gira la camara alrededor del punto
 * mirado; la rueda acerca y aleja. Que hacer con la casilla tocada lo dice quien lo instala.
 */
import type { Pos } from '../core/model';
import type { CameraRig } from './cameraRig';

/** Se considera arrastre (y no toque) si el puntero se mueve mas de esto en pixeles. */
const DRAG_THRESHOLD = 6;
/** Radianes que gira la camara por pixel arrastrado con el boton derecho. */
const ORBIT_PER_PIXEL = 0.008;
const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

export interface PointerHost {
  rig: CameraRig;
  /** La casilla bajo ese punto de la pantalla (null fuera del mapa). */
  tileAt(clientX: number, clientY: number): Pos | null;
  hover(pos: Pos | null): void;
  tap(pos: Pos): void;
}

type DragKind = 'pan' | 'orbit';

interface Press {
  kind: DragKind;
  x: number;
  y: number;
  isDrag: boolean;
}

const dragKindOf = (button: number): DragKind | null => {
  if (button === LEFT_BUTTON) return 'pan';
  return button === RIGHT_BUTTON ? 'orbit' : null;
};

function drag(press: Press, event: PointerEvent, canvas: HTMLCanvasElement, rig: CameraRig): void {
  if (press.kind === 'orbit') return rig.orbit(-event.movementX * ORBIT_PER_PIXEL, event.movementY * ORBIT_PER_PIXEL);
  const scale = rig.tilesPerPixel(canvas.clientHeight);
  rig.pan(-event.movementX * scale, event.movementY * scale);
}

export function installPointer(canvas: HTMLCanvasElement, host: PointerHost): void {
  let press: Press | null = null;
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    const kind = dragKindOf(event.button);
    if (!kind) return;
    canvas.setPointerCapture(event.pointerId);
    press = { kind, x: event.clientX, y: event.clientY, isDrag: false };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!press) return host.hover(host.tileAt(event.clientX, event.clientY));
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD) press.isDrag = true;
    if (press.isDrag) drag(press, event, canvas, host.rig);
  });
  canvas.addEventListener('pointerup', (event) => {
    const isTap = press?.kind === 'pan' && !press.isDrag;
    press = null;
    const pos = isTap ? host.tileAt(event.clientX, event.clientY) : null;
    if (pos) host.tap(pos);
  });
  canvas.addEventListener('wheel', (event) => host.rig.zoom(event.deltaY), { passive: true });
}
