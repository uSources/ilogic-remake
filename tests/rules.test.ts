import { beforeEach, describe, expect, it } from 'vitest';
import { HQ, UNIT, useRules } from '../src/core/data';
import { PLAIN_RULES } from './plainRules';
import { seededRng } from '../src/core/geom';
import {
  attack,
  attackTargets,
  capture,
  endRound,
  load,
  merge,
  moveRange,
  moveUnit,
  newUnit,
  outcome,
  spawn,
  unitActions,
  unload,
} from '../src/core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  ARTILLERY = 2,
  TRANSPORT = 7,
  LFIGHTER = 10,
  SUPPLIER = 13;

// Estas pruebas son de las reglas de 2013; las nuevas estan en tests/modern.test.ts.
beforeEach(() => useRules(PLAIN_RULES));

describe('movimiento', () => {
  it('un soldado mueve 3 casillas en rombo y las unidades bloquean', () => {
    const s = blankState();
    const u = newUnit(s, SOLDIER, 0, 10, 10);
    newUnit(s, SOLDIER, 1, 11, 10); // bloquea a la derecha
    const r = moveRange(s, u);
    expect(r.steps[10]![13]).toBe(3);
    expect(r.steps[11]![10]).toBe(0); // ocupada
    expect(r.steps[12]![11]).toBe(3); // rodeando por abajo
    expect(r.steps[12]![10]).toBe(0); // necesitaria 4 pasos
    expect(r.steps[10]![14]).toBe(0);
  });
  it('el agua no se pisa a pie y los vehiculos gastan combustible', () => {
    const s = blankState();
    s.map[11]![10] = 1; // Water
    const t = newUnit(s, TANK, 0, 10, 10);
    expect(moveRange(s, t).steps[11]![10]).toBe(0);
    moveUnit(s, t, { x: 10, y: 14 });
    expect(t.fuel).toBe(UNIT.maxfuel[TANK]! - 4);
    expect(t.canMove).toBe(false);
  });
  it('la artilleria no puede disparar despues de moverse', () => {
    const s = blankState();
    const a = newUnit(s, ARTILLERY, 0, 10, 10);
    moveUnit(s, a, { x: 10, y: 11 });
    expect(a.canFire).toBe(false);
  });
});

describe('combate', () => {
  it('el dano es binomial, gasta municion y no hay contraataque', () => {
    const s = blankState();
    const t = newUnit(s, TANK, 0, 10, 10);
    const e = newUnit(s, TANK, 1, 10, 11);
    expect(attackTargets(s, t).map((u) => u.uid)).toEqual([e.uid]);
    const dmg = attack(s, t, e, seededRng(1));
    expect(dmg).toBeGreaterThan(30);
    expect(dmg).toBeLessThan(70); // esperado 50
    expect(e.life).toBe(100 - dmg);
    expect(t.life).toBe(100);
    expect(t.ammo).toBe(UNIT.maxammo[TANK]! - 1);
    expect(t.active).toBe(false);
  });
  it('los soldados ya no matan tanques ligeros de un golpe (tabla corregida)', () => {
    const s = blankState();
    const so = newUnit(s, SOLDIER, 0, 10, 10);
    const lt = newUnit(s, 4, 1, 10, 11);
    attack(s, so, lt, seededRng(3));
    expect(lt.life).toBeGreaterThan(60);
  });
  it('una unidad muerta desaparece con su carga', () => {
    const s = blankState();
    const tr = newUnit(s, TRANSPORT, 1, 10, 11);
    const p = newUnit(s, SOLDIER, 1, 10, 12);
    load(s, p, tr);
    tr.life = 1;
    const t = newUnit(s, TANK, 0, 10, 10);
    attack(s, t, tr, () => 0);
    expect(s.units.map((u) => u.uid)).toEqual([t.uid]);
  });
});

describe('captura y victoria', () => {
  it('capturar por puntos en dos turnos; capturar la Base enemiga gana', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 });
    s.buildings.push({ type: HQ, owner: 1, x: 5, y: 5 });
    s.buildings.push({ type: 0, owner: null, x: 3, y: 3 });
    const a = newUnit(s, SOLDIER, 0, 3, 3);
    expect(capture(s, a)?.done).toBe(false);
    a.active = true;
    expect(capture(s, a)?.done).toBe(true);
    expect(s.buildings[2]!.owner).toBe(0);
    expect(outcome(s)).toBe('playing');
    const b = newUnit(s, SOLDIER, 0, 5, 5);
    capture(s, b);
    b.active = true;
    capture(s, b);
    expect(s.buildings[1]!.owner).toBe(0);
    expect(outcome(s)).toBe('won');
  });
});

describe('union y transporte', () => {
  it('unir suma vidas (tope 100) y la unidad se mueve hasta la otra', () => {
    const s = blankState();
    const a = newUnit(s, SOLDIER, 0, 10, 10);
    const b = newUnit(s, SOLDIER, 0, 12, 10);
    a.life = 40;
    b.life = 30;
    const path = merge(s, a, b)!;
    expect(path.at(-1)).toEqual({ x: 12, y: 10 });
    expect(b.life).toBe(70);
    expect(s.units).toHaveLength(1);
  });
  it('subir y bajar del transporte', () => {
    const s = blankState();
    const tr = newUnit(s, TRANSPORT, 0, 10, 10);
    const p = newUnit(s, SOLDIER, 0, 12, 10);
    expect(load(s, p, tr)).not.toBeNull();
    expect(p.carrier).toBe(tr.uid);
    tr.active = true;
    expect(unitActions(s, tr).unload).toBe(true);
    expect(unload(s, tr, p, { x: 10, y: 11 })).toBe(true);
    expect(p.carrier).toBeNull();
    expect(p.x).toBe(10);
    expect(p.y).toBe(11);
  });
});

describe('compra y fin de ronda', () => {
  it('fondos insuficientes: no compra', () => {
    const s = blankState();
    s.buildings.push({ type: 2, owner: 0, x: 4, y: 4 });
    expect(spawn(s, s.buildings[0]!, TANK)).toBeNull();
    expect(s.funds[0]).toBe(5000);
    const car = spawn(s, s.buildings[0]!, 3)!;
    expect(car.active).toBe(false);
    expect(s.funds[0]).toBe(0);
  });
  it('ingresos, curacion y combustible de los aviones', () => {
    const s = blankState();
    s.buildings.push({ type: 0, owner: 0, x: 1, y: 1 }); // City
    s.buildings.push({ type: 4, owner: 0, x: 2, y: 2 }); // Airport
    const so = newUnit(s, SOLDIER, 0, 1, 1);
    so.life = 50;
    const onAirport = newUnit(s, LFIGHTER, 0, 2, 2);
    onAirport.fuel = 1;
    const flying = newUnit(s, LFIGHTER, 0, 8, 8);
    flying.fuel = 2;
    const r = endRound(s);
    expect(r.income[0]).toBe(2000);
    expect(s.funds[0]).toBe(7000);
    expect(so.life).toBe(80);
    expect(onAirport.fuel).toBe(UNIT.maxfuel[LFIGHTER]); // ya no se estrella en su aeropuerto
    expect(s.units.find((u) => u.uid === flying.uid)).toBeUndefined();
    expect(s.day).toBe(2);
  });
  it('el abastecedor rellena combustible y municion a las vecinas', () => {
    const s = blankState();
    const sup = newUnit(s, SUPPLIER, 0, 5, 5);
    const t = newUnit(s, TANK, 0, 5, 6);
    t.fuel = 3;
    t.ammo = 0;
    expect(unitActions(s, sup).supply).toBe(true);
  });
});

import { combatForecast, threatMap } from '../src/core/rules';

describe('prevision y amenaza', () => {
  it('prevision de tanque contra tanque coherente', () => {
    const s = blankState();
    const a = newUnit(s, 1, 0, 10, 10);
    a.life = 80;
    const d = newUnit(s, 1, 1, 10, 12);
    d.life = 60;
    const f = combatForecast(s, a, d);
    expect(f.expected).toBe(40);
    expect(f.low).toBeGreaterThanOrEqual(30);
    expect(f.high).toBeLessThanOrEqual(50);
    expect(f.killChance).toBeLessThan(0.01);
    expect(f.lifeAfter).toBe(20);
  });
  it('probabilidad de destruir alta si el defensor esta casi muerto', () => {
    const s = blankState();
    const a = newUnit(s, 1, 0, 10, 10);
    const d = newUnit(s, 0, 1, 10, 11);
    d.life = 10;
    expect(combatForecast(s, a, d).killChance).toBeGreaterThan(0.99);
  });
  it('amenaza: tanque enemigo visible cubre mover + alcance; invisible no cuenta', () => {
    const s = blankState();
    newUnit(s, 0, 0, 10, 10); // vision 4 del jugador
    newUnit(s, 1, 1, 12, 10); // tanque enemigo visible: mover 5 + alcance 2
    const th = threatMap(s, 1, 0);
    expect(th[12]![17]).toBe(true); // 7 abajo
    expect(th[12]![18]).toBe(false);
    const s2 = blankState();
    newUnit(s2, 0, 0, 0, 0);
    newUnit(s2, 1, 1, 20, 20); // fuera de vision
    expect(threatMap(s2, 1, 0).flat().some(Boolean)).toBe(false);
  });
});
