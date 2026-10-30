import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, Pinch, movedFar } from '../src/controls/pointer';

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
