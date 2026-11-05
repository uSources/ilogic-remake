import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { PLAIN_RULES } from './plainRules';
import { seededRng } from '@core/geom';
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
  supply,
  unitActions,
  unload,
  combatForecast,
  threatMap,
} from '@core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  ARTILLERY = 2,
  TRANSPORT = 7,
  LFIGHTER = 10,
  SUPPLIER = 13;

// Estas pruebas son de las reglas de 2013; las nuevas estan en tests/modern.test.ts.
/** Reglas de las partidas de estos tests. */
const TEST_RULES = PLAIN_RULES;

describe('movimiento', () => {
  it('un soldado mueve 3 casillas en rombo y las unidades bloquean', () => {
    const s = blankState(TEST_RULES);
    const unit = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    newUnit(s, SOLDIER, 1, { x: 11, y: 10 }); // bloquea a la derecha
    const range = moveRange(s, unit);
    expect(range.steps.at({ x: 10, y: 13 })).toBe(3);
    expect(range.steps.at({ x: 11, y: 10 })).toBe(0); // ocupada
    expect(range.steps.at({ x: 12, y: 11 })).toBe(3); // rodeando por abajo
    expect(range.steps.at({ x: 12, y: 10 })).toBe(0); // necesitaria 4 pasos
    expect(range.steps.at({ x: 10, y: 14 })).toBe(0);
  });
  it('el agua no la pisan los vehiculos', () => {
    const s = blankState(TEST_RULES);
    s.map[11]![10] = 1; // Water
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    expect(moveRange(s, tank).steps.at({ x: 11, y: 10 })).toBe(0);
    moveUnit(s, tank, { x: 10, y: 14 });
    expect(tank.canMove).toBe(false);
  });
  it('la artilleria no puede disparar despues de moverse', () => {
    const s = blankState(TEST_RULES);
    const artillery = newUnit(s, ARTILLERY, 0, { x: 10, y: 10 });
    moveUnit(s, artillery, { x: 10, y: 11 });
    expect(artillery.canFire).toBe(false);
  });
});

describe('combate', () => {
  it('el dano es binomial y no hay contraataque', () => {
    const s = blankState(TEST_RULES);
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const enemy = newUnit(s, TANK, 1, { x: 10, y: 11 });
    expect(attackTargets(s, tank).map((unit) => unit.uid)).toEqual([enemy.uid]);
    const dmg = attack(s, tank, enemy, seededRng(1));
    expect(dmg).toBeGreaterThan(30);
    expect(dmg).toBeLessThan(70); // esperado 50
    expect(enemy.life).toBe(100 - dmg);
    expect(tank.life).toBe(100);
    expect(tank.active).toBe(false);
  });
  it('los soldados ya no matan tanques ligeros de un golpe (tabla corregida)', () => {
    const s = blankState(TEST_RULES);
    const so = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const lt = newUnit(s, 4, 1, { x: 10, y: 11 });
    attack(s, so, lt, seededRng(3));
    expect(lt.life).toBeGreaterThan(60);
  });
  it('una unidad muerta desaparece con su carga', () => {
    const s = blankState(TEST_RULES);
    const tr = newUnit(s, TRANSPORT, 1, { x: 10, y: 11 });
    const passenger = newUnit(s, SOLDIER, 1, { x: 10, y: 12 });
    load(s, passenger, tr);
    tr.life = 1;
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    attack(s, tank, tr, () => 0);
    expect(s.units.map((unit) => unit.uid)).toEqual([tank.uid]);
  });
});

describe('captura y victoria', () => {
  it('capturar por puntos en dos turnos; capturar la Base enemiga gana', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 });
    s.buildings.push({ type: HQ, owner: 1, x: 5, y: 5 });
    s.buildings.push({ type: 0, owner: null, x: 3, y: 3 });
    const soldier = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    expect(capture(s, soldier)?.done).toBe(false);
    soldier.active = true;
    expect(capture(s, soldier)?.done).toBe(true);
    expect(s.buildings[2]!.owner).toBe(0);
    expect(outcome(s)).toBe('playing');
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    capture(s, otherSoldier);
    otherSoldier.active = true;
    capture(s, otherSoldier);
    expect(s.buildings[1]!.owner).toBe(0);
    expect(outcome(s)).toBe('won');
  });
});

describe('union y transporte', () => {
  it('unir suma vidas (tope 100) y la unidad se mueve hasta la otra', () => {
    const s = blankState(TEST_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 12, y: 10 });
    soldier.life = 40;
    otherSoldier.life = 30;
    const path = merge(s, soldier, otherSoldier)!;
    expect(path.at(-1)).toEqual({ x: 12, y: 10 });
    expect(otherSoldier.life).toBe(70);
    expect(s.units).toHaveLength(1);
  });
  it('subir y bajar del transporte', () => {
    const s = blankState(TEST_RULES);
    const tr = newUnit(s, TRANSPORT, 0, { x: 10, y: 10 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 12, y: 10 });
    expect(load(s, passenger, tr)).not.toBeNull();
    expect(passenger.carrier).toBe(tr.uid);
    tr.active = true;
    expect(unitActions(s, tr).unload).toBe(true);
    expect(unload(s, tr, passenger, { x: 10, y: 11 })).toBe(true);
    expect(passenger.carrier).toBeNull();
    expect(passenger.x).toBe(10);
    expect(passenger.y).toBe(11);
  });
});

describe('compra y fin de ronda', () => {
  it('fondos insuficientes: no compra', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: 2, owner: 0, x: 4, y: 4 });
    expect(spawn(s, s.buildings[0]!, TANK)).toBeNull();
    expect(s.funds[0]).toBe(5000);
    const car = spawn(s, s.buildings[0]!, 3)!;
    expect(car.active).toBe(false);
    expect(s.funds[0]).toBe(5000 - UNIT.cost[3]!); // el Jeep: lo que cueste ahora
  });
  it('ingresos y curacion; los aviones ya no caen', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: 0, owner: 0, x: 1, y: 1 }); // City
    const so = newUnit(s, SOLDIER, 0, { x: 1, y: 1 });
    so.life = 50;
    const flying = newUnit(s, LFIGHTER, 0, { x: 8, y: 8 });
    for (let i = 0; i < 60; i++) endRound(s);
    expect(s.units).toContain(flying);
    expect(so.life).toBe(100);
    const round = endRound(s);
    expect(round.income[0]).toBe(1000);
    expect(s.day).toBe(62);
  });
  it('Suministros repara a los vehiculos de al lado, no a la infanteria', () => {
    const s = blankState(TEST_RULES);
    const sup = newUnit(s, SUPPLIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 6 });
    const so = newUnit(s, SOLDIER, 0, { x: 4, y: 5 });
    so.life = 40;
    expect(unitActions(s, sup).supply).toBe(false); // el tanque esta entero y al soldado no le cura
    tank.life = 50;
    expect(unitActions(s, sup).supply).toBe(true);
    expect(supply(s, sup)).toBe(1);
    expect(tank.life).toBe(70);
    expect(so.life).toBe(40);
    expect(sup.active).toBe(false);
  });
});

const { UNIT, HQ } = defaultContent().tables;

describe('prevision y amenaza', () => {
  it('prevision de tanque contra tanque coherente', () => {
    const s = blankState(TEST_RULES);
    const attacker = newUnit(s, 1, 0, { x: 10, y: 10 });
    attacker.life = 80;
    const defender = newUnit(s, 1, 1, { x: 10, y: 12 });
    defender.life = 60;
    const forecast = combatForecast(s, attacker, defender);
    expect(forecast.expected).toBe(40);
    expect(forecast.low).toBeGreaterThanOrEqual(30);
    expect(forecast.high).toBeLessThanOrEqual(50);
    expect(forecast.killChance).toBeLessThan(0.01);
    expect(forecast.lifeAfter).toBe(20);
  });
  it('probabilidad de destruir alta si el defensor esta casi muerto', () => {
    const s = blankState(TEST_RULES);
    const attacker = newUnit(s, 1, 0, { x: 10, y: 10 });
    const defender = newUnit(s, 0, 1, { x: 10, y: 11 });
    defender.life = 10;
    expect(combatForecast(s, attacker, defender).killChance).toBeGreaterThan(0.99);
  });
  it('amenaza: tanque enemigo visible cubre mover + alcance; invisible no cuenta', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, 0, 0, { x: 10, y: 10 }); // vision 4 del jugador
    newUnit(s, 1, 1, { x: 12, y: 10 }); // tanque enemigo visible: mover 5 + alcance 2
    const th = threatMap(s, 1, 0);
    expect(th.at({ x: 12, y: 17 })).toBe(true); // 7 abajo
    expect(th.at({ x: 12, y: 18 })).toBe(false);
    const s2 = blankState(TEST_RULES);
    newUnit(s2, 0, 0, { x: 0, y: 0 });
    newUnit(s2, 1, 1, { x: 20, y: 20 }); // fuera de vision
    expect([...threatMap(s2, 1, 0).cells()].some((cell) => cell.value)).toBe(false);
  });
});
