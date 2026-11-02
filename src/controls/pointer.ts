/**
 * Adaptador de punteros (raton y dedos). PointerGestures recibe los eventos de bajo nivel (bajar,
 * mover, subir, rueda) y decide que gesto son: un toque, arrastrar el mapa, coger y soltar una
 * unidad, un recuadro, una pulsacion larga, un pellizco. Sin Phaser ni estado de partida, asi que se
 * prueba sola (tests/pointer.test.ts).
 *
 * Lo que cada gesto significa en la partida lo cumple GameScene a traves de PointerTarget: la escena
 * ya no lee punteros, solo traduce el evento de Phaser a PointerIn y lo pasa aqui.
 */

/** Pixeles (CSS) que hay que mover el puntero para que no cuente como toque. */
export const DRAG_THRESHOLD = 6;
/** Con el dedo, mantener pulsado este tiempo (ms) para levantar la unidad. */
export const PICK_HOLD_MS = 250;
/** Mantener pulsado este tiempo (ms) para llevar el cursor ahi (ficha de informacion). */
export const LONG_PRESS_MS = 480;
/** [CAMBIO] Dos clics (o toques) seguidos en el mismo sitio dentro de este tiempo (ms) son doble clic. */
export const DOUBLE_MS = 350;

/** Se ha movido lo bastante para ser arrastre. `dpr`: densidad de pantalla (el umbral es en pixeles reales). */
export function movedFar(dx: number, dy: number, dpr: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD * dpr;
}

export interface Pt {
  x: number;
  y: number;
}

/** Un paso de zoom del pellizco, y el punto medio entre los dedos (alrededor de ese punto). */
export interface PinchZoom {
  dir: 1 | -1;
  x: number;
  y: number;
}

/** Cuanto tiene que cambiar la distancia entre dos dedos para dar un paso de zoom. */
const PINCH_IN = 1.3;
const PINCH_OUT = 0.77;

/**
 * Los dedos que estan en la pantalla y el pellizco. Con dos o mas dedos, cada cambio grande de la
 * distancia entre los dos primeros da un paso de zoom. El pellizco dura hasta que se levantan todos.
 */
export class Pinch {
  private points = new Map<number, Pt>();
  /** Distancia de referencia del pellizco; null si no se pellizca. */
  private base: number | null = null;

  /** Dedos en pantalla. */
  get count(): number {
    return this.points.size;
  }

  /** Hay un pellizco en curso. */
  get active(): boolean {
    return this.base !== null;
  }

  /** Un dedo nuevo. Con dos o mas, (re)empieza el pellizco con los dos primeros. */
  add(id: number, p: Pt): void {
    this.points.set(id, { ...p });
    if (this.points.size >= 2) {
      const [a, b] = this.first2();
      this.base = Math.max(1, dist(a, b));
    }
  }

  /** Un dedo se ha movido. Devuelve el paso de zoom si la distancia ha cambiado bastante. */
  move(id: number, p: Pt): PinchZoom | null {
    if (this.points.has(id)) this.points.set(id, { ...p });
    if (this.base === null || this.points.size < 2) return null;
    const [a, b] = this.first2();
    const d = dist(a, b);
    const ratio = d / this.base;
    if (ratio <= PINCH_IN && ratio >= PINCH_OUT) return null;
    this.base = d;
    return { dir: ratio > 1 ? 1 : -1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Un dedo se levanta. Devuelve true si era parte de un pellizco: entonces el gesto no es un toque
   * ni un arrastre. El pellizco termina cuando no queda ningun dedo.
   */
  remove(id: number): boolean {
    const had = this.points.delete(id);
    const was = this.base !== null;
    if (this.points.size === 0) this.base = null;
    return had && was;
  }

  private first2(): [Pt, Pt] {
    const [a, b] = [...this.points.values()];
    return [a!, b!];
  }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- Desplazar el mapa por el borde --------------------------------------------

/** Franja del borde (pixeles CSS) y velocidad (pixeles CSS por ms) de un tipo de desplazamiento. */
export interface EdgeZone {
  margin: number;
  speed: number;
}

/** Raton parado cerca del borde de la pantalla, sin arrastrar. */
export const EDGE_HOVER: EdgeZone = { margin: 14, speed: 0.9 };
/** Llevando una unidad con el raton cerca del borde. */
export const EDGE_CARRY_MOUSE: EdgeZone = { margin: 24, speed: 0.6 };
/** Llevando una unidad con el dedo (franja mas ancha: el dedo tapa). */
export const EDGE_CARRY_TOUCH: EdgeZone = { margin: 40, speed: 0.6 };

/**
 * Cuanto desplazar el mapa (pixeles del lienzo) en `dt` ms con el puntero en `p`, en una vista de
 * `w` x `h` pixeles del lienzo. `dpr`: densidad de pantalla (franja y velocidad son en pixeles CSS).
 * {0, 0} si el puntero no esta en la franja del borde.
 */
export function edgeScroll(p: Pt, w: number, h: number, dt: number, zone: EdgeZone, dpr: number): Pt {
  const edge = zone.margin * dpr;
  const sx = p.x < edge ? -1 : p.x > w - edge ? 1 : 0;
  const sy = p.y < edge ? -1 : p.y > h - edge ? 1 : 0;
  const v = dt * zone.speed * dpr;
  return { x: sx * v, y: sy * v };
}

// --- Gestos ------------------------------------------------------------------

/** Un evento del raton o de un dedo, sin Phaser (GameScene lo traduce desde Phaser.Input.Pointer). */
export interface PointerIn {
  id: number;
  /** Posicion en pixeles del lienzo. */
  x: number;
  y: number;
  /** Viene de un dedo (no del raton). */
  touch: boolean;
  /** Algun boton (o el dedo) esta pulsado. */
  down: boolean;
  /** Boton derecho: pulsado (en down) o soltado (en up). */
  right: boolean;
  /** Mayusculas pulsadas. */
  shift: boolean;
  /** [CAMBIO] Ctrl (o Cmd en Mac) pulsado: elegir varias, como en Windows. */
  ctrl?: boolean;
  /** [CAMBIO] Alt pulsado (Alt + clic derecho: el menu completo de ordenes). */
  alt?: boolean;
  /** [CAMBIO] Boton central (rueda): pulsado (en down) o soltado (en up). Solo arrastra el mapa. */
  middle?: boolean;
}

/** [CAMBIO] Teclas que acompañan a un clic. */
export interface Mods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** [CAMBIO] Un toque o clic sin arrastrar: con que, que teclas y cuantas veces seguidas (2 = doble clic). */
export interface TapInfo extends Mods {
  touch: boolean;
  count: number;
}

const modsOf = (p: PointerIn): Mods => ({ shift: p.shift, ctrl: !!p.ctrl, alt: !!p.alt });

/** Algo programado para despues (temporizador de la escena), que se puede cancelar. */
export interface Later {
  cancel(): void;
}

/** Recuadro de seleccion en pixeles del lienzo (arrastrar desde una casilla sin unidad propia). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Mayusculas o Ctrl: añadir a lo elegido en vez de cambiarlo. */
  add?: boolean;
}

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

/**
 * Adaptador de raton y dedos: recibe los eventos de bajo nivel (bajar, mover, subir, rueda, salir) y
 * los convierte en gestos que cumple un PointerTarget. Todo el estado de un gesto vive aqui: el
 * arrastre del mapa, la unidad pulsada que aun no se sabe si es clic o arrastre, el recuadro, el
 * pellizco y la pulsacion larga.
 */
export class PointerGestures {
  /** El raton esta sobre el juego (para desplazar el mapa en el borde). */
  inside = false;
  /** Pulsado sin soltar: `button` (izquierdo, derecho o central), donde empezo y por donde va. */
  private drag: { x: number; y: number; x0: number; y0: number; moved: boolean; button: 'left' | 'right' | 'middle'; mods: Mods } | null =
    null;
  /** El ultimo toque, para el doble clic. */
  private lastTap: { x: number; y: number; at: number; count: number } | null = null;
  private pick: { uid: number; x: number; y: number; touch: boolean; timer: Later | null } | null = null;
  private box: Box | null = null;
  private pinch = new Pinch();
  private longTimer: Later | null = null;

  constructor(
    private readonly t: PointerTarget,
    private readonly dpr: () => number = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
  ) {}

  /** Se esta arrastrando el mapa o pulsando sin soltar (no desplazar por el borde). */
  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Olvidar cualquier gesto a medias (partida nueva). */
  reset(): void {
    this.cancelLongPress();
    this.dropPick();
    this.inside = false;
    this.drag = null;
    this.box = null;
    this.lastTap = null;
    this.pinch = new Pinch();
  }

  leave(): void {
    this.inside = false;
  }

  wheel(dy: number, x: number, y: number): void {
    if (this.t.ended()) return;
    this.t.zoomAt(dy < 0 ? 1 : -1, x, y, true);
  }

  /**
   * Cada fotograma, con el estado actual del puntero (`p`) y el tamaño de la vista: desplazar el mapa
   * si el puntero esta en el borde. Llevando una unidad (raton o dedo) el mapa la sigue; con el raton
   * parado cerca del borde, tambien (pero no arrastrando, con menus ni con la partida acabada).
   */
  tick(p: PointerIn, w: number, h: number, dt: number): void {
    const t = this.t;
    const carry = t.carrying() && p.down;
    let zone: EdgeZone;
    if (carry) zone = t.carryTouch() ? EDGE_CARRY_TOUCH : EDGE_CARRY_MOUSE;
    else if (this.inside && !t.ended() && !this.dragging && !p.touch && t.edgeScrollable()) zone = EDGE_HOVER;
    else return;
    const d = edgeScroll(p, w, h, dt, zone, this.dpr());
    if (!d.x && !d.y) return;
    t.edgeScroll(d.x, d.y);
    if (carry) t.carryTo(p.x, p.y);
  }

  move(p: PointerIn): void {
    const t = this.t;
    this.inside = !p.touch;
    if (t.ended()) return;
    // Pellizcar: cada vez que la distancia entre los dedos cambia bastante, un paso de zoom.
    const zoom = this.pinch.move(p.id, { x: p.x, y: p.y });
    if (this.pinch.active) {
      if (zoom) t.zoomAt(zoom.dir, zoom.x, zoom.y, false);
      return;
    }
    // Unidad cogida: sigue al puntero.
    if (t.carrying()) return t.carryTo(p.x, p.y);
    if (this.box && p.down) {
      this.box.x1 = p.x;
      this.box.y1 = p.y;
      return t.boxUpdate(this.box);
    }
    // Arrastrar desde la unidad la lleva (tambien con el dedo, sin mantener pulsado antes).
    if (this.pick && movedFar(p.x - this.pick.x, p.y - this.pick.y, this.dpr())) {
      this.startCarry(false);
      return t.carryTo(p.x, p.y);
    }
    // Arrastrar el mapa (o, con el boton izquierdo desde una casilla sin unidad propia, un recuadro).
    if (this.drag && p.down) {
      const dx = p.x - this.drag.x,
        dy = p.y - this.drag.y;
      if (!this.drag.moved && this.drag.button === 'left' && movedFar(dx, dy, this.dpr()) && t.canBox(p.touch)) {
        const d = this.drag;
        this.drag = null;
        this.cancelLongPress();
        this.box = { x0: d.x0, y0: d.y0, x1: p.x, y1: p.y, add: d.mods.shift || d.mods.ctrl };
        return t.boxUpdate(this.box);
      }
      if (this.drag.moved || movedFar(dx, dy, this.dpr())) {
        this.drag.moved = true;
        this.cancelLongPress();
        t.pan(-dx, -dy);
        this.drag.x = p.x;
        this.drag.y = p.y;
        return;
      }
    }
    if (!p.touch) t.hover(p.x, p.y);
  }

  down(p: PointerIn): void {
    const t = this.t;
    if (t.ended()) return;
    if (t.busy()) return t.fastForward();
    // [CAMBIO] Botones derecho y central: arrastrar mueve el mapa; el derecho sin arrastrar es un clic
    // derecho (al soltar).
    if (p.right || p.middle) {
      this.drag = { x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false, button: p.right ? 'right' : 'middle', mods: modsOf(p) };
      return;
    }
    // Mayusculas o Ctrl + clic o arrastrar: recuadro que añade (un clic sin arrastrar añade o quita la
    // unidad de debajo, como Ctrl + clic en Windows).
    if (!p.touch && (p.shift || p.ctrl) && t.canBox(false)) {
      this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: true };
      this.drag = null;
      return;
    }
    this.drag = { x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false, button: 'left', mods: modsOf(p) };
    const uid = t.pickAt(p.x, p.y);
    if (uid !== null && this.pinch.count < 1) {
      this.pick = { uid, x: p.x, y: p.y, touch: p.touch, timer: null };
      // Con el dedo, mantener pulsado un momento tambien la levanta.
      if (p.touch) this.pick.timer = t.later(PICK_HOLD_MS, () => this.startCarry(true));
    }
    if (!p.touch) return;
    t.touchStart();
    this.pinch.add(p.id, { x: p.x, y: p.y });
    if (this.pinch.count >= 2) {
      // Segundo dedo: es un pellizco, no un toque ni un arrastre.
      this.drag = null;
      this.cancelLongPress();
      this.dropPick();
      if (t.carrying()) t.cancelCarry();
    } else if (!this.pick) {
      this.cancelLongPress();
      const at = { x: p.x, y: p.y };
      this.longTimer = t.later(LONG_PRESS_MS, () => this.onLongPress(at));
    }
  }

  up(p: PointerIn): void {
    const t = this.t;
    this.cancelLongPress();
    if (t.carrying()) {
      this.pinch.remove(p.id);
      this.drag = null;
      return t.dropCarry(p.x, p.y, p.shift);
    }
    this.dropPick();
    if (this.box) {
      const b = this.box;
      this.box = null;
      return t.boxEnd(b);
    }
    if (this.pinch.remove(p.id)) {
      // Fin del pellizco: ignorar los dedos que quedan hasta que se levanten todos.
      this.drag = null;
      return;
    }
    const drag = this.drag;
    this.drag = null;
    if (t.ended() || t.busy() || !drag || drag.moved) return;
    if (drag.button === 'right') return t.rightClick(p.x, p.y, modsOf(p));
    if (drag.button !== 'left') return;
    t.tap(p.x, p.y, { touch: p.touch, ...modsOf(p), count: this.tapCount(p) });
  }

  /** Cuantos toques seguidos van en el mismo sitio (2 = doble clic). */
  private tapCount(p: PointerIn): number {
    const now = this.t.now();
    const l = this.lastTap;
    const count = l && now - l.at <= DOUBLE_MS && !movedFar(p.x - l.x, p.y - l.y, this.dpr()) ? l.count + 1 : 1;
    this.lastTap = { x: p.x, y: p.y, at: now, count };
    return count;
  }

  /** Levantar la unidad pulsada. `held`: con el dedo, se ha mantenido pulsado antes de arrastrar. */
  private startCarry(held: boolean): void {
    const pick = this.pick;
    this.pick = null;
    if (!pick) return;
    pick.timer?.cancel();
    if (this.t.ended() || this.t.carrying()) return;
    if (!this.t.beginCarry(pick.uid, pick.touch, held)) return;
    this.drag = null;
    this.cancelLongPress();
  }

  private onLongPress(at: { x: number; y: number }): void {
    this.longTimer = null;
    if (!this.drag || this.drag.moved || this.t.ended()) return;
    // Que al levantar el dedo no cuente como toque.
    if (this.t.longPress(at.x, at.y)) this.drag.moved = true;
  }

  private cancelLongPress(): void {
    this.longTimer?.cancel();
    this.longTimer = null;
  }

  /** Olvidar una pulsacion pendiente sobre una unidad (ha sido un clic, o se ha desplazado el mapa). */
  private dropPick(): void {
    this.pick?.timer?.cancel();
    this.pick = null;
  }
}
