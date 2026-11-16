/**
 * El raton (y el dedo) sobre el mundo 3D, como en los juegos de estrategia: con el boton izquierdo,
 * soltar sin arrastrar toca la casilla y arrastrar hace un recuadro para elegir varias; con el
 * central, arrastrar desplaza la camara; con el derecho, arrastrar la gira alrededor del punto mirado
 * y soltarlo sin arrastrar es el gesto de contexto (la rueda o una orden); la rueda del raton acerca y
 * aleja; con el raton quieto en el borde de la pantalla, la camara se desplaza hacia alli. Con el
 * dedo, arrastrar desplaza y mantener pulsado sin moverse es el gesto de contexto. Que hacer con la
 * casilla tocada, el gesto o el recuadro lo dice quien lo instala.
 */
import type { ClickMods } from '../../../controls/selection';
import { DOUBLE_MS, LONG_PRESS_MS } from '../../../controls/pointer';
import type { Pos } from '../../../core/model';
import type { FrameListener } from '../../ports/frame';
import type { ScreenBox, SelectionBoxView } from '../../ports/pointer';
import type { CameraControls } from '../camera/strategyCamera';

/** Se considera arrastre (y no toque) si el puntero se mueve mas de esto en pixeles. */
const DRAG_THRESHOLD = 6;
/** Radianes que gira la camara por pixel arrastrado con el boton derecho. */
const ORBIT_PER_PIXEL = 0.008;
/** A cuantos pixeles del borde de la pantalla el raton empieza a desplazar la camara. */
const EDGE_ZONE = 18;

export interface PointerHost {
  /** La camara como logica: la entrada pide desplazar, girar y acercar. */
  camera: CameraControls;
  /** El recuadro de seleccion mientras se arrastra. */
  box: SelectionBoxView;
  /** La casilla bajo ese punto de la pantalla (null fuera del mapa). */
  tileAt(clientX: number, clientY: number): Pos | null;
  hover(pos: Pos | null): void;
  /** Un clic sin arrastrar, con sus teclas y cuantas veces seguidas (2: doble clic). */
  tap(pos: Pos, mods: ClickMods): void;
  /** Clic derecho sin arrastrar, o mantener pulsado con el dedo: la rueda o una orden alli. */
  context(pos: Pos): void;
  /** Se ha soltado un recuadro; `add`: con Mayusculas o Ctrl, se suma a lo elegido. */
  boxSelect(box: ScreenBox, add: boolean): void;
  onFrame(listener: FrameListener): void;
}

type DragKind = 'box' | 'pan' | 'orbit';

/**
 * Que hace cada boton (por `PointerEvent.button`): como arrastra, si soltarlo sin arrastrar toca la
 * casilla (`taps`) o hace el gesto de contexto (`context`), y si mantenerlo quieto lo hace (`holds`).
 */
interface ButtonRole {
  drag: DragKind;
  taps: boolean;
  context: boolean;
  holds: boolean;
}

const BUTTON_ROLES: Readonly<Record<number, ButtonRole>> = {
  0: { drag: 'box', taps: true, context: false, holds: false },
  1: { drag: 'pan', taps: false, context: false, holds: false },
  2: { drag: 'orbit', taps: false, context: true, holds: false },
};
/** Con el dedo no hay recuadro: arrastrar desplaza (elegir varias con el dedo, con su boton) y mantener es el contexto. */
const TOUCH_ROLE: ButtonRole = { drag: 'pan', taps: true, context: false, holds: true };

interface Press extends ButtonRole {
  x: number;
  y: number;
  isDrag: boolean;
  /** Ya hizo el gesto de contexto al mantenerlo: soltarlo no toca. */
  isHeld: boolean;
}

/** El ultimo clic, para saber si el siguiente es doble. */
interface LastTap {
  pos: Pos;
  at: number;
  count: number;
}

const roleOf = (event: PointerEvent): ButtonRole | undefined => (event.pointerType === 'touch' ? TOUCH_ROLE : BUTTON_ROLES[event.button]);

const boxOf = (press: Press, event: PointerEvent): ScreenBox => ({
  left: Math.min(press.x, event.clientX),
  top: Math.min(press.y, event.clientY),
  right: Math.max(press.x, event.clientX),
  bottom: Math.max(press.y, event.clientY),
});

function drag(press: Press, event: PointerEvent, canvas: HTMLCanvasElement, host: PointerHost): void {
  if (press.drag === 'box') return host.box.show(boxOf(press, event));
  if (press.drag === 'orbit') return host.camera.orbit(-event.movementX * ORBIT_PER_PIXEL, event.movementY * ORBIT_PER_PIXEL);
  const scale = host.camera.tilesPerPixel(canvas.clientHeight);
  host.camera.pan(-event.movementX * scale, event.movementY * scale);
}

/** Cuantas veces seguidas se ha tocado esa casilla (2 si es un doble clic). */
function countTaps(last: LastTap | null, pos: Pos, now: number): number {
  const isRepeat = !!last && last.pos.x === pos.x && last.pos.y === pos.y && now - last.at <= DOUBLE_MS;
  return isRepeat ? last.count + 1 : 1;
}

/** Hacia donde desplaza el borde: -1, 0 o 1 en cada eje (y: hacia el fondo de la pantalla). */
function edgeDirection(x: number, y: number, canvas: HTMLCanvasElement): { right: number; forward: number } {
  const rect = canvas.getBoundingClientRect();
  const right = x <= rect.left + EDGE_ZONE ? -1 : x >= rect.right - EDGE_ZONE ? 1 : 0;
  const forward = y <= rect.top + EDGE_ZONE ? 1 : y >= rect.bottom - EDGE_ZONE ? -1 : 0;
  return { right, forward };
}

export function installPointer(canvas: HTMLCanvasElement, host: PointerHost): void {
  let press: Press | null = null;
  let lastTap: LastTap | null = null;
  /** Donde esta el raton sobre el lienzo (null fuera o con el dedo): para el borde. */
  let mouseAt: { x: number; y: number } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const stopHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  /** Mantener quieto (con el dedo): al cabo de LONG_PRESS_MS, el gesto de contexto en esa casilla. */
  const startHold = (held: Press) => {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      const pos = held.isDrag ? null : host.tileAt(held.x, held.y);
      if (!pos) return;
      held.isHeld = true;
      host.context(pos);
    }, LONG_PRESS_MS);
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    const role = roleOf(event);
    if (!role) return;
    // Sin esto, el boton central abre el desplazamiento automatico del navegador.
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    press = { ...role, x: event.clientX, y: event.clientY, isDrag: false, isHeld: false };
    if (role.holds) startHold(press);
  });
  canvas.addEventListener('pointermove', (event) => {
    mouseAt = event.pointerType === 'mouse' ? { x: event.clientX, y: event.clientY } : null;
    if (!press) return host.hover(host.tileAt(event.clientX, event.clientY));
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD) {
      press.isDrag = true;
      stopHold();
    }
    if (press.isDrag) drag(press, event, canvas, host);
  });
  canvas.addEventListener('pointerup', (event) => {
    const released = press;
    press = null;
    stopHold();
    if (!released || released.isHeld) return;
    const mods = { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey };
    if (released.isDrag && released.drag === 'box') {
      host.box.show(null);
      return host.boxSelect(boxOf(released, event), mods.shift || mods.ctrl);
    }
    const pos = !released.isDrag ? host.tileAt(event.clientX, event.clientY) : null;
    if (!pos) return;
    if (released.context) return host.context(pos);
    if (!released.taps) return;
    const count = countTaps(lastTap, pos, event.timeStamp);
    lastTap = { pos, at: event.timeStamp, count };
    host.tap(pos, { ...mods, count });
  });
  canvas.addEventListener('pointerleave', () => (mouseAt = null));
  canvas.addEventListener('wheel', (event) => host.camera.zoom(event.deltaY), { passive: true });
  host.onFrame((seconds) => {
    if (!mouseAt || press) return;
    const { right, forward } = edgeDirection(mouseAt.x, mouseAt.y, canvas);
    if (right || forward) host.camera.panByKeys(right, forward, seconds);
  });
}
