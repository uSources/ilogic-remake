import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  PICK_HOLD_MS,
  Pinch,
  PointerGestures,
  movedFar,
  type PointerIn,
  type PointerTarget,
} from '../src/controls/pointer';

describe('umbral de arrastre', () => {
  it('cuenta como arrastre solo a partir del umbral (en pixeles reales)', () => {
    expect(movedFar(DRAG_THRESHOLD, 0, 1)).toBe(false);
    expect(movedFar(DRAG_THRESHOLD + 0.5, 0, 1)).toBe(true);
    // Con pantalla de densidad 2 el mismo gesto tiene el doble de pixeles.
    expect(movedFar(DRAG_THRESHOLD + 0.5, 0, 2)).toBe(false);
    expect(movedFar(0, 0, 1)).toBe(false);
  });
});

describe('pellizco', () => {
  it('con un dedo no hay pellizco', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    expect(pz.active).toBe(false);
    expect(pz.count).toBe(1);
    expect(pz.move(1, { x: 500, y: 0 })).toBeNull();
    expect(pz.remove(1)).toBe(false);
  });

  it('dos dedos que se separan dan zoom hacia fuera, en el punto medio', () => {
    const pz = new Pinch();
    pz.add(1, { x: 100, y: 100 });
    pz.add(2, { x: 140, y: 100 }); // distancia 40
    expect(pz.active).toBe(true);
    // Distancia 60: ratio 1.5 > 1.3 → un paso de zoom hacia fuera.
    expect(pz.move(2, { x: 160, y: 100 })).toEqual({ dir: 1, x: 130, y: 100 });
  });

  it('dos dedos que se juntan dan zoom hacia dentro', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    pz.add(2, { x: 100, y: 0 });
    expect(pz.move(2, { x: 50, y: 0 })).toEqual({ dir: -1, x: 25, y: 0 });
  });

  it('cambios pequenos no dan paso (el umbral es 1.3 hacia fuera y 0.77 hacia dentro)', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    pz.add(2, { x: 100, y: 0 });
    expect(pz.move(2, { x: 120, y: 0 })).toBeNull(); // 1.2
    expect(pz.move(2, { x: 100, y: 0 })).toBeNull(); // 1.0
    expect(pz.move(2, { x: 80, y: 0 })).toBeNull(); // 0.8, todavia por encima de 0.77
  });

  it('tras un paso, la referencia es la distancia nueva', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    pz.add(2, { x: 100, y: 0 });
    expect(pz.move(2, { x: 200, y: 0 })?.dir).toBe(1); // 2.0 → paso, referencia 200
    expect(pz.move(2, { x: 220, y: 0 })).toBeNull(); // 1.1 frente a 200
    expect(pz.move(2, { x: 300, y: 0 })?.dir).toBe(1); // 300/200 = 1.5 → otro paso
  });

  it('el pellizco dura hasta que se levantan todos los dedos', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    pz.add(2, { x: 100, y: 0 });
    expect(pz.remove(1)).toBe(true); // era parte del pellizco
    expect(pz.active).toBe(true); // queda un dedo: sigue sin ser toque
    expect(pz.remove(2)).toBe(true); // el ultimo dedo tambien cierra el pellizco: no es un toque
    expect(pz.active).toBe(false);
    expect(pz.count).toBe(0);
  });

  it('un tercer dedo reinicia la referencia con los dos primeros', () => {
    const pz = new Pinch();
    pz.add(1, { x: 0, y: 0 });
    pz.add(2, { x: 100, y: 0 }); // referencia 100
    pz.add(3, { x: 1000, y: 0 }); // se recalcula con 1 y 2: sigue 100
    expect(pz.move(2, { x: 150, y: 0 })?.dir).toBe(1); // 150/100 = 1.5
  });

  it('mover un dedo que no esta en la pantalla no hace nada', () => {
    const pz = new Pinch();
    expect(pz.move(9, { x: 1, y: 1 })).toBeNull();
    expect(pz.count).toBe(0);
  });
});

// --- Gestos (PointerGestures) con un destino falso -------------------------------------------------

/** Destino que apunta lo que le piden; `unitAt` dice donde hay una unidad que se puede coger. */
function fake(o: { unitAt?: (x: number, y: number) => number | null; busy?: boolean; canBox?: boolean; longPressOk?: boolean } = {}) {
  const log: string[] = [];
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  let now = 0;
  let carrying = false;
  const t: PointerTarget = {
    later: (ms, fn) => {
      const tm = { at: now + ms, fn, dead: false };
      timers.push(tm);
      return { cancel: () => (tm.dead = true) };
    },
    ended: () => false,
    busy: () => !!o.busy,
    fastForward: () => log.push('fastForward'),
    carrying: () => carrying,
    canBox: () => o.canBox ?? true,
    pickAt: (x, y) => o.unitAt?.(x, y) ?? null,
    touchStart: () => log.push('touchStart'),
    rightPress: () => log.push('right'),
    beginCarry: (uid, touch, held) => {
      carrying = true;
      log.push(`carry ${uid} ${touch ? 'dedo' : 'raton'} ${held ? 'mantenida' : 'arrastrada'}`);
      return true;
    },
    carryTo: (x, y) => log.push(`carryTo ${x},${y}`),
    dropCarry: (x, y) => {
      carrying = false;
      log.push(`drop ${x},${y}`);
    },
    cancelCarry: () => {
      carrying = false;
      log.push('cancelCarry');
    },
    boxUpdate: (b) => log.push(`box ${b.x1},${b.y1}`),
    boxEnd: (b) => log.push(`boxEnd ${b.x0},${b.y0}-${b.x1},${b.y1}`),
    pan: (dx, dy) => log.push(`pan ${dx},${dy}`),
    zoomAt: (dir, _x, _y, wheel) => log.push(`zoom ${dir}${wheel ? ' rueda' : ''}`),
    hover: (x, y) => log.push(`hover ${x},${y}`),
    tap: (x, y, touch) => log.push(`tap ${x},${y}${touch ? ' dedo' : ''}`),
    longPress: (x, y) => {
      log.push(`long ${x},${y}`);
      return o.longPressOk ?? true;
    },
  };
  const g = new PointerGestures(t, () => 1);
  const wait = (ms: number) => {
    now += ms;
    for (const tm of timers)
      if (!tm.dead && tm.at <= now) {
        tm.dead = true;
        tm.fn();
      }
  };
  return { g, log, wait };
}

const pt = (x: number, y: number, o: Partial<PointerIn> = {}): PointerIn => ({
  id: 1,
  x,
  y,
  touch: false,
  down: true,
  right: false,
  shift: false,
  ...o,
});

describe('gestos del raton y del dedo', () => {
  it('pulsar y soltar sin moverse es un toque; moverse poco tambien', () => {
    const { g, log } = fake();
    g.down(pt(10, 10));
    g.move(pt(13, 12));
    g.up(pt(13, 12, { down: false }));
    // Con el raton, moverse poco (sin llegar a arrastre) tambien lleva el cursor, como antes.
    expect(log).toEqual(['hover 13,12', 'tap 13,12']);
  });

  it('arrastrar desde una casilla vacia mueve el mapa y no es un toque', () => {
    const { g, log } = fake();
    g.down(pt(10, 10));
    g.move(pt(30, 10));
    g.move(pt(40, 15));
    g.up(pt(40, 15, { down: false }));
    expect(log).toEqual(['pan -20,0', 'pan -10,-5']);
  });

  it('el raton sin pulsar solo señala', () => {
    const { g, log } = fake();
    g.move(pt(5, 6, { down: false }));
    expect(log).toEqual(['hover 5,6']);
    expect(g.inside).toBe(true);
    g.leave();
    expect(g.inside).toBe(false);
  });

  it('arrastrar desde una unidad la lleva y al soltar la deja', () => {
    const { g, log } = fake({ unitAt: () => 7 });
    g.down(pt(10, 10));
    g.move(pt(30, 10));
    g.move(pt(40, 10));
    g.up(pt(40, 10, { down: false }));
    expect(log).toEqual(['carry 7 raton arrastrada', 'carryTo 30,10', 'carryTo 40,10', 'drop 40,10']);
  });

  it('con el dedo, mantener pulsada una unidad la levanta (sin moverse)', () => {
    const { g, log, wait } = fake({ unitAt: () => 3 });
    g.down(pt(10, 10, { touch: true }));
    wait(PICK_HOLD_MS);
    expect(log).toEqual(['touchStart', 'carry 3 dedo mantenida']);
  });

  it('con el dedo en una casilla vacia, la pulsacion larga no acaba en toque', () => {
    const { g, log, wait } = fake();
    g.down(pt(10, 10, { touch: true }));
    wait(LONG_PRESS_MS);
    g.up(pt(10, 10, { touch: true, down: false }));
    expect(log).toEqual(['touchStart', 'long 10,10']);
  });

  it('si la pulsacion larga no tiene efecto, soltar sigue siendo un toque', () => {
    const { g, log, wait } = fake({ longPressOk: false });
    g.down(pt(10, 10, { touch: true }));
    wait(LONG_PRESS_MS);
    g.up(pt(10, 10, { touch: true, down: false }));
    expect(log).toEqual(['touchStart', 'long 10,10', 'tap 10,10 dedo']);
  });

  it('dos dedos son un pellizco: zoom, y ni toque ni arrastre al soltar', () => {
    const { g, log } = fake();
    g.down(pt(100, 100, { id: 1, touch: true }));
    g.down(pt(140, 100, { id: 2, touch: true }));
    g.move(pt(170, 100, { id: 2, touch: true }));
    g.up(pt(170, 100, { id: 2, touch: true, down: false }));
    g.up(pt(100, 100, { id: 1, touch: true, down: false }));
    expect(log).toEqual(['touchStart', 'touchStart', 'zoom 1']);
  });

  it('el segundo dedo suelta la unidad cogida', () => {
    const { g, log } = fake({ unitAt: (x) => (x < 50 ? 5 : null) });
    g.down(pt(10, 10, { id: 1, touch: true }));
    g.move(pt(30, 10, { id: 1, touch: true }));
    g.down(pt(200, 10, { id: 2, touch: true }));
    expect(log).toEqual(['touchStart', 'carry 5 dedo arrastrada', 'carryTo 30,10', 'touchStart', 'cancelCarry']);
  });

  it('Mayusculas + arrastrar con el raton dibuja un recuadro', () => {
    const { g, log } = fake();
    g.down(pt(10, 10, { shift: true }));
    g.move(pt(50, 40, { shift: true }));
    g.up(pt(50, 40, { shift: true, down: false }));
    expect(log).toEqual(['box 50,40', 'boxEnd 10,10-50,40']);
  });

  it('sin recuadro posible, Mayusculas + arrastrar mueve el mapa', () => {
    const { g, log } = fake({ canBox: false });
    g.down(pt(10, 10, { shift: true }));
    g.move(pt(50, 10, { shift: true }));
    expect(log).toEqual(['pan -40,0']);
  });

  it('boton derecho, turno enemigo y rueda', () => {
    const { g, log } = fake();
    g.down(pt(10, 10, { right: true }));
    g.up(pt(10, 10, { right: true, down: false }));
    g.wheel(-100, 0, 0);
    g.wheel(100, 0, 0);
    expect(log).toEqual(['right', 'zoom 1 rueda', 'zoom -1 rueda']);
    const busy = fake({ busy: true });
    busy.g.down(pt(10, 10));
    busy.g.up(pt(10, 10, { down: false }));
    expect(busy.log).toEqual(['fastForward']);
  });
});
