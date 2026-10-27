import { beforeEach, describe, expect, it } from 'vitest';
import { CLASSIC_RULES, MODERN_RULES, useRules } from '../src/core/data';
import { load, merge, moveRange, moveUnit, validPath, visibility } from '../src/core/rules';
import { newUnit } from '../src/core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  TRANSPORT = 7;

beforeEach(() => useRules(MODERN_RULES));

describe('movimiento: pasar entre aliados', () => {
  it('se atraviesa a un aliado pero no se puede terminar encima', () => {
    const s = blankState();
    // Pasillo de agua: solo se puede ir en linea recta.
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 1;
    const a = newUnit(s, TANK, 0, 2, 5);
    newUnit(s, TANK, 0, 3, 5);
    const r = moveRange(s, a);
    expect(r.steps[3]![5]).toBe(0); // ocupada por el aliado
    expect(r.steps[4]![5]).toBe(2); // pero se llega a la siguiente
  });

  it('con las reglas clasicas el aliado bloquea', () => {
    useRules(CLASSIC_RULES);
    const s = blankState();
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 1;
    const a = newUnit(s, TANK, 0, 2, 5);
    newUnit(s, TANK, 0, 3, 5);
    expect(moveRange(s, a).steps[4]![5]).toBe(0);
  });
});

describe('movimiento: emboscadas en la niebla', () => {
  /** Pasillo horizontal en y=5 con un bosque en x=6 donde se esconde un soldado enemigo. */
  function corridor() {
    const s = blankState();
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 1;
    s.map[6]![5] = 2;
    return s;
  }

  it('el bosque esconde a quien esta dentro salvo desde al lado', () => {
    const s = corridor();
    newUnit(s, TANK, 0, 2, 5);
    const e = newUnit(s, SOLDIER, 1, 6, 5);
    expect(visibility(s, 0)[e.x]![e.y]).toBe(false);
    newUnit(s, SOLDIER, 0, 5, 5);
    expect(visibility(s, 0)[e.x]![e.y]).toBe(true);
  });

  it('el alcance no delata a un enemigo escondido', () => {
    const s = corridor();
    const a = newUnit(s, TANK, 0, 2, 5);
    newUnit(s, SOLDIER, 1, 6, 5);
    const r = moveRange(s, a);
    expect(r.steps[6]![5]).toBe(4);
    expect(r.steps[7]![5]).toBe(5);
  });

  it('al chocar con el enemigo escondido, se para antes y pierde el turno', () => {
    const s = corridor();
    const a = newUnit(s, TANK, 0, 2, 5);
    newUnit(s, SOLDIER, 1, 6, 5);
    const path = moveUnit(s, a, { x: 7, y: 5 }, moveRange(s, a))!;
    expect(path.ambush).toEqual({ x: 6, y: 5 });
    expect(a.x).toBe(5);
    expect(a.active).toBe(false);
    expect(a.canFire).toBe(false);
    expect(a.fuel).toBe(50 - 3);
  });

  it('si la casilla anterior a la emboscada es de un aliado, se para en la de antes', () => {
    const s = corridor();
    const a = newUnit(s, TANK, 0, 2, 5);
    newUnit(s, SOLDIER, 0, 4, 5);
    newUnit(s, SOLDIER, 1, 6, 5);
    // Con el soldado propio en (4,5) el bosque de (6,5) sigue sin verse desde (4,5): distancia 2.
    const path = moveUnit(s, a, { x: 7, y: 5 }, moveRange(s, a))!;
    expect(path.ambush).toEqual({ x: 6, y: 5 });
    expect(a.x).toBe(5);
    s.units.find((u) => u.team === 0 && u.type === SOLDIER)!.x = 5;
    a.x = 2;
    a.active = a.canMove = true;
    const p2 = moveUnit(s, a, { x: 7, y: 5 }, moveRange(s, a));
    // Ahora el soldado propio esta al lado del bosque: el enemigo se ve y bloquea, no hay camino.
    expect(p2).toBeNull();
  });

  it('unirse tambien puede acabar en emboscada', () => {
    const s = corridor();
    s.map[6]![5] = 0;
    s.map[4]![5] = 2;
    const a = newUnit(s, TANK, 0, 1, 5);
    newUnit(s, SOLDIER, 1, 4, 5);
    const target = newUnit(s, TANK, 0, 6, 5);
    a.life = 40;
    target.life = 50;
    const p = merge(s, a, target);
    expect(p?.ambush).toEqual({ x: 4, y: 5 });
    expect(s.units.includes(a)).toBe(true);
    expect(a.x).toBe(3);
    expect(target.life).toBe(50);
    void load;
    void TRANSPORT;
  });

  it('con las reglas clasicas no hay bosque que esconda ni emboscadas', () => {
    useRules(CLASSIC_RULES);
    const s = corridor();
    newUnit(s, TANK, 0, 2, 5);
    const e = newUnit(s, SOLDIER, 1, 6, 5);
    expect(visibility(s, 0)[e.x]![e.y]).toBe(true);
  });
});

describe('movimiento: camino trazado a mano', () => {
  it('se acepta un camino valido distinto del mas corto y se gasta su longitud', () => {
    const s = blankState();
    const a = newUnit(s, TANK, 0, 5, 5);
    const r = moveRange(s, a);
    const via = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 7, y: 6 },
      { x: 7, y: 5 },
    ];
    expect(validPath(s, a, via, r)).toBe(true);
    const path = moveUnit(s, a, { x: 7, y: 5 }, r, via)!;
    expect(path).toEqual(via);
    expect(a.fuel).toBe(50 - 4);
  });

  it('caminos no validos: saltos, repetir casilla o pasarse de movimiento', () => {
    const s = blankState();
    const a = newUnit(s, TANK, 0, 5, 5);
    const r = moveRange(s, a);
    expect(validPath(s, a, [{ x: 5, y: 5 }, { x: 7, y: 5 }], r)).toBe(false);
    expect(validPath(s, a, [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 6 }], r)).toBe(false);
    const long = Array.from({ length: 7 }, (_, i) => ({ x: 5 + i, y: 5 }));
    expect(validPath(s, a, long, r)).toBe(false);
  });
});
