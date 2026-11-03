/**
 * Adaptador de punteros (raton y dedos). PointerGestures recibe los eventos de bajo nivel (bajar,
 * mover, subir, rueda) y decide que gesto son: un toque, arrastrar el mapa, coger y soltar una
 * unidad, un recuadro, una pulsacion larga, un pellizco. Sin Phaser ni estado de partida, asi que se
 * prueba sola (tests/pointer.test.ts).
 *
 * Cada gesto tiene su pieza en `gestures/` (pellizco, borde, toque, pulsacion, mantener pulsado);
 * aqui solo se reparten los eventos entre ellas. Lo que cada gesto significa en la partida lo cumple
 * GameScene a traves de PointerTarget: la escena no lee punteros, solo traduce el evento de Phaser a
 * PointerIn y lo pasa aqui.
 */
import { modsOf, movedFar, type Later, type Mods, type PointerIn, type Pt } from './gestures/basics';
import { edgeScroll, edgeZoneFor } from './gestures/edgeScroll';
import { LONG_PRESS_MS, PICK_HOLD_MS, TimerSlot } from './gestures/hold';
import { Pinch } from './gestures/pinch';
import { boxFromPress, classifyPressMove, newPress, type Box, type Press } from './gestures/press';
import { nextTap, type TapInfo, type TapRecord } from './gestures/tap';

export { DRAG_THRESHOLD, movedFar, type Later, type Mods, type PointerIn, type Pt } from './gestures/basics';
export { EDGE_CARRY_MOUSE, EDGE_CARRY_TOUCH, EDGE_HOVER, edgeScroll, type EdgeZone } from './gestures/edgeScroll';
export { LONG_PRESS_MS, PICK_HOLD_MS } from './gestures/hold';
export { Pinch, type PinchZoom } from './gestures/pinch';
export type { Box } from './gestures/press';
export { DOUBLE_MS, type TapInfo } from './gestures/tap';

/**
 * Lo que el juego hace con cada gesto. Lo pone GameScene: aqui solo se decide que gesto es (un toque,
 * un arrastre, coger una unidad, un pellizco...), no lo que significa en la partida.
 */
export interface PointerTarget {
  /** Programar algo para dentro de `ms` (temporizadores del juego, que se paran con la escena). */
  later(ms: number, fn: () => void): Later;
  /** La partida ha terminado: ningun gesto hace nada. */
  ended(): boolean;
  /** Turno enemigo o animacion: un toque solo acelera. */
  busy(): boolean;
  fastForward(): void;
  /** Hay una unidad cogida (arrastrandola). */
  carrying(): boolean;
  /** Hora (ms) para reconocer el doble clic. */
  now(): number;
  /**
   * Se puede empezar un recuadro de seleccion aqui (en el mapa, sin menus). Con el raton, arrastrar
   * desde una casilla sin unidad propia es recuadro; con el dedo solo si se pide (modo "Elegir varias").
   */
  canBox(touch: boolean): boolean;
  /** Unidad propia que se puede coger en ese punto, o null. */
  pickAt(x: number, y: number): number | null;
  /** Primer toque de un dedo (aviso de gestos). */
  touchStart(): void;
  /** [CAMBIO] Clic derecho (soltado sin arrastrar: arrastrar con el derecho mueve el mapa). */
  rightClick(x: number, y: number, mods: Mods): void;
  /** Levantar la unidad `uid`. false si ya no se puede (entonces no hay arrastre que olvidar). */
  beginCarry(uid: number, touch: boolean, held: boolean): boolean;
  carryTo(x: number, y: number): void;
  dropCarry(x: number, y: number, shift: boolean): void;
  cancelCarry(): void;
  boxUpdate(box: Box): void;
  boxEnd(box: Box): void;
  /** Desplazar el mapa (pixeles del lienzo). */
  pan(dx: number, dy: number): void;
  /** La unidad cogida se cogio con el dedo. */
  carryTouch(): boolean;
  /** El mapa se puede desplazar por el borde con el raton (en el mapa, sin menus). */
  edgeScrollable(): boolean;
  /** Desplazamiento continuo por el borde (cada fotograma; pixeles del lienzo). */
  edgeScroll(dx: number, dy: number): void;
  /** Un paso de zoom alrededor de un punto. `wheel`: viene de la rueda del raton. */
  zoomAt(dir: 1 | -1, x: number, y: number, wheel: boolean): void;
  /** El raton pasa por encima (sin dedo). */
  hover(x: number, y: number): void;
  /** Un toque o clic sin arrastrar. */
  tap(x: number, y: number, info: TapInfo): void;
  /** Pulsacion larga con el dedo. false si ahora no tiene efecto (el gesto sigue pudiendo ser un toque). */
  longPress(x: number, y: number): boolean;
}

/** Una unidad pulsada que aun no se sabe si es clic o arrastre (con el dedo, con su temporizador). */
interface PendingPick extends Pt {
  uid: number;
  touch: boolean;
  timer: Later | null;
}

const positionOf = (pointer: PointerIn): Pt => ({ x: pointer.x, y: pointer.y });

const defaultDpr = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);

/**
 * Adaptador de raton y dedos: recibe los eventos de bajo nivel (bajar, mover, subir, rueda, salir) y
 * los convierte en gestos que cumple un PointerTarget. Todo el estado de un gesto vive aqui: el
 * arrastre del mapa, la unidad pulsada que aun no se sabe si es clic o arrastre, el recuadro, el
 * pellizco y la pulsacion larga.
 */
export class PointerGestures {
  /** El raton esta sobre el juego (para desplazar el mapa en el borde). */
  inside = false;
  /** Pulsado sin soltar (izquierdo, derecho o central): donde empezo y por donde va. */
  private press: Press | null = null;
  /** El ultimo toque, para el doble clic. */
  private lastTap: TapRecord | null = null;
  private pick: PendingPick | null = null;
  private box: Box | null = null;
  private pinch = new Pinch();
  private readonly longPressTimer = new TimerSlot();

  constructor(
    private readonly target: PointerTarget,
    private readonly dpr: () => number = defaultDpr,
  ) {}

  /** Se esta arrastrando el mapa o pulsando sin soltar (no desplazar por el borde). */
  get dragging(): boolean {
    return this.press !== null;
  }

  /** Olvidar cualquier gesto a medias (partida nueva). */
  reset(): void {
    this.longPressTimer.cancel();
    this.dropPick();
    this.inside = false;
    this.press = null;
    this.box = null;
    this.lastTap = null;
    this.pinch = new Pinch();
  }

  leave(): void {
    this.inside = false;
  }

  wheel(dy: number, x: number, y: number): void {
    if (this.target.ended()) return;
    this.target.zoomAt(dy < 0 ? 1 : -1, x, y, true);
  }

  /**
   * Cada fotograma, con el estado actual del puntero (`p`) y el tamaño de la vista: desplazar el mapa
   * si el puntero esta en el borde. Llevando una unidad (raton o dedo) el mapa la sigue; con el raton
   * parado cerca del borde, tambien (pero no arrastrando, con menus ni con la partida acabada).
   */
  tick(p: PointerIn, w: number, h: number, dt: number): void {
    const target = this.target;
    const isCarrying = target.carrying() && p.down;
    const zone = edgeZoneFor({
      isCarrying,
      carryIsTouch: isCarrying && target.carryTouch(),
      isHoveringMap: !isCarrying && this.isHoveringMap(p),
    });
    if (!zone) return;
    const scroll = edgeScroll(p, w, h, dt, zone, this.dpr());
    if (!scroll.x && !scroll.y) return;
    target.edgeScroll(scroll.x, scroll.y);
    if (isCarrying) target.carryTo(p.x, p.y);
  }

  move(p: PointerIn): void {
    const target = this.target;
    this.inside = !p.touch;
    if (target.ended()) return;
    if (this.movePinch(p)) return;
    // Unidad cogida: sigue al puntero.
    if (target.carrying()) return target.carryTo(p.x, p.y);
    if (this.box && p.down) return this.extendBox(this.box, p);
    // Arrastrar desde la unidad la lleva (tambien con el dedo, sin mantener pulsado antes).
    if (this.pick && movedFar(p.x - this.pick.x, p.y - this.pick.y, this.dpr())) {
      this.startCarry(false);
      return target.carryTo(p.x, p.y);
    }
    if (this.press && p.down && this.movePress(this.press, p)) return;
    if (!p.touch) target.hover(p.x, p.y);
  }

  down(p: PointerIn): void {
    const target = this.target;
    if (target.ended()) return;
    if (target.busy()) return target.fastForward();
    // [CAMBIO] Botones derecho y central: arrastrar mueve el mapa; el derecho sin arrastrar es un clic
    // derecho (al soltar).
    if (p.right || p.middle) {
      this.press = newPress(p, p.right ? 'right' : 'middle', modsOf(p));
      return;
    }
    // Mayusculas o Ctrl + clic o arrastrar: recuadro que añade (un clic sin arrastrar añade o quita la
    // unidad de debajo, como Ctrl + clic en Windows).
    if (!p.touch && (p.shift || p.ctrl) && target.canBox(false)) {
      this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: true };
      this.press = null;
      return;
    }
    this.press = newPress(p, 'left', modsOf(p));
    this.pressUnitUnder(p);
    if (p.touch) this.fingerDown(p);
  }

  up(p: PointerIn): void {
    const target = this.target;
    this.longPressTimer.cancel();
    if (target.carrying()) {
      this.pinch.remove(p.id);
      this.press = null;
      return target.dropCarry(p.x, p.y, p.shift);
    }
    this.dropPick();
    if (this.box) return this.finishBox(this.box);
    if (this.pinch.remove(p.id)) {
      // Fin del pellizco: ignorar los dedos que quedan hasta que se levanten todos.
      this.press = null;
      return;
    }
    const press = this.press;
    this.press = null;
    if (target.ended() || target.busy() || !press || press.moved) return;
    if (press.button === 'right') return target.rightClick(p.x, p.y, modsOf(p));
    if (press.button !== 'left') return;
    target.tap(p.x, p.y, { touch: p.touch, ...modsOf(p), count: this.tapCount(p) });
  }

  // --- Mover -----------------------------------------------------------------------------------

  /** Raton sobre el juego, sin pulsar, con la partida en marcha y el mapa a la vista. */
  private isHoveringMap(p: PointerIn): boolean {
    return this.inside && !this.target.ended() && !this.dragging && !p.touch && this.target.edgeScrollable();
  }

  /** Pellizcar: cada vez que la distancia entre los dedos cambia bastante, un paso de zoom. */
  private movePinch(p: PointerIn): boolean {
    const zoom = this.pinch.move(p.id, positionOf(p));
    if (!this.pinch.active) return false;
    if (zoom) this.target.zoomAt(zoom.dir, zoom.x, zoom.y, false);
    return true;
  }

  private extendBox(box: Box, p: PointerIn): void {
    box.x1 = p.x;
    box.y1 = p.y;
    this.target.boxUpdate(box);
  }

  /** Arrastrar el mapa (o, con el boton izquierdo desde una casilla sin unidad propia, un recuadro). */
  private movePress(press: Press, p: PointerIn): boolean {
    const gesture = classifyPressMove(press, p, this.dpr(), () => this.target.canBox(p.touch));
    if (gesture === 'still') return false;
    this.longPressTimer.cancel();
    if (gesture === 'box') {
      this.press = null;
      this.box = boxFromPress(press, p);
      this.target.boxUpdate(this.box);
      return true;
    }
    press.moved = true;
    this.target.pan(-(p.x - press.last.x), -(p.y - press.last.y));
    press.last = positionOf(p);
    return true;
  }

  // --- Bajar -----------------------------------------------------------------------------------

  /** Pulsar sobre una unidad propia (con un solo dedo): aun no se sabe si es clic o arrastre. */
  private pressUnitUnder(p: PointerIn): void {
    const uid = this.target.pickAt(p.x, p.y);
    if (uid === null || this.pinch.count >= 1) return;
    this.pick = { uid, x: p.x, y: p.y, touch: p.touch, timer: null };
    // Con el dedo, mantener pulsado un momento tambien la levanta.
    if (p.touch) this.pick.timer = this.target.later(PICK_HOLD_MS, () => this.startCarry(true));
  }

  private fingerDown(p: PointerIn): void {
    this.target.touchStart();
    this.pinch.add(p.id, positionOf(p));
    if (this.pinch.count >= 2) return this.startPinch();
    if (this.pick) return;
    const at = positionOf(p);
    this.longPressTimer.start(
      (fire) => this.target.later(LONG_PRESS_MS, fire),
      () => this.onLongPress(at),
    );
  }

  /** Segundo dedo: es un pellizco, no un toque ni un arrastre. */
  private startPinch(): void {
    this.press = null;
    this.longPressTimer.cancel();
    this.dropPick();
    if (this.target.carrying()) this.target.cancelCarry();
  }

  // --- Soltar ----------------------------------------------------------------------------------

  private finishBox(box: Box): void {
    this.box = null;
    this.target.boxEnd(box);
  }

  /** Cuantos toques seguidos van en el mismo sitio (2 = doble clic). */
  private tapCount(p: PointerIn): number {
    this.lastTap = nextTap(this.lastTap, p, this.target.now(), this.dpr());
    return this.lastTap.count;
  }

  // --- Coger una unidad y mantener pulsado -----------------------------------------------------

  /** Levantar la unidad pulsada. `held`: con el dedo, se ha mantenido pulsado antes de arrastrar. */
  private startCarry(held: boolean): void {
    const pick = this.pick;
    this.pick = null;
    if (!pick) return;
    pick.timer?.cancel();
    if (this.target.ended() || this.target.carrying()) return;
    if (!this.target.beginCarry(pick.uid, pick.touch, held)) return;
    this.press = null;
    this.longPressTimer.cancel();
  }

  private onLongPress(at: Pt): void {
    if (!this.press || this.press.moved || this.target.ended()) return;
    // Que al levantar el dedo no cuente como toque.
    if (this.target.longPress(at.x, at.y)) this.press.moved = true;
  }

  /** Olvidar una pulsacion pendiente sobre una unidad (ha sido un clic, o se ha desplazado el mapa). */
  private dropPick(): void {
    this.pick?.timer?.cancel();
    this.pick = null;
  }
}
