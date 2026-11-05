import { describe, expect, it } from 'vitest';
import { PLAIN_RULES } from './plainRules';
import { seededRng } from '@core/util/random';
import {
  attackTargets,
  endRound,
  moveRange,
  newUnit,
  outcome,
  unitActions,
  combatForecast,
  threatMap,
  canStillFire,
  canStillMove,
} from '@core/rules';
import { dispatch } from '@core/actions';
import { teamState } from '@core/teams';
import { act, blankState, diceFrom, hqId, unitTypeNamed, fight, endRoundReport } from './helpers';

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  ARTILLERY = unitTypeNamed('Artillery'),
  TRANSPORT = unitTypeNamed('Transport'),
  LFIGHTER = unitTypeNamed('LFighter'),
  SUPPLIER = unitTypeNamed('Supplier');

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
    s.map[11]![10] = 'Water'; // Water
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    expect(moveRange(s, tank).steps.at({ x: 11, y: 10 })).toBe(0);
    act(s, 0, { kind: 'move', uid: tank.uid, to: { x: 10, y: 14 } });
    expect(canStillMove(tank)).toBe(false);
  });
  it('la artilleria no puede disparar despues de moverse', () => {
    const s = blankState(TEST_RULES);
    const artillery = newUnit(s, ARTILLERY, 0, { x: 10, y: 10 });
    act(s, 0, { kind: 'move', uid: artillery.uid, to: { x: 10, y: 11 } });
    expect(canStillFire(s, artillery)).toBe(false);
  });
});

describe('combate', () => {
  it('el dano es binomial y no hay contraataque', () => {
    const s = blankState(TEST_RULES);
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const enemy = newUnit(s, TANK, 1, { x: 10, y: 11 });
    expect(attackTargets(s, tank).map((unit) => unit.uid)).toEqual([enemy.uid]);
    const dmg = fight(s, tank, enemy, diceFrom(seededRng(1))).damage;
    expect(dmg).toBeGreaterThan(30);
    expect(dmg).toBeLessThan(70); // esperado 50
    expect(enemy.life).toBe(100 - dmg);
    expect(tank.life).toBe(100);
    expect(tank.turnState).toBe('done');
  });
  it('los soldados ya no matan tanques ligeros de un golpe (tabla corregida)', () => {
    const s = blankState(TEST_RULES);
    const so = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const lightTank = newUnit(s, unitTypeNamed('LTank'), 1, { x: 10, y: 11 });
    fight(s, so, lightTank, diceFrom(seededRng(3)));
    expect(lightTank.life).toBeGreaterThan(60);
  });
  it('una unidad muerta desaparece con su carga', () => {
    const s = blankState(TEST_RULES);
    const transport = newUnit(s, TRANSPORT, 1, { x: 10, y: 11 });
    const passenger = newUnit(s, SOLDIER, 1, { x: 10, y: 12 });
    act(s, 1, { kind: 'load', uid: passenger.uid, into: transport.uid });
    transport.life = 1;
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    fight(
      s,
      tank,
      transport,
      diceFrom(() => 0),
    );
    expect(s.units.map((unit) => unit.uid)).toEqual([tank.uid]);
  });
});

describe('captura y victoria', () => {
  it('capturar por puntos en dos turnos; capturar la Base enemiga gana', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 });
    s.buildings.push({ type: HQ, owner: 1, x: 5, y: 5 });
    s.buildings.push({ type: 'City', owner: null, x: 3, y: 3 });
    const soldier = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    const capture = (uid: number) => act(s, 0, { kind: 'capture', uid })[0];
    expect(capture(soldier.uid)).toMatchObject({ kind: 'capture', left: 10 });
    soldier.turnState = 'ready';
    expect(capture(soldier.uid)).toMatchObject({ kind: 'capture', left: 0 });
    expect(s.buildings[2]!.owner).toBe(0);
    expect(outcome(s, 0)).toBe('playing');
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    capture(otherSoldier.uid);
    otherSoldier.turnState = 'ready';
    capture(otherSoldier.uid);
    expect(s.buildings[1]!.owner).toBe(0);
    expect(outcome(s, 0)).toBe('won');
  });
});

describe('union y transporte', () => {
  it('unir suma vidas (tope 100) y la unidad se mueve hasta la otra', () => {
    const s = blankState(TEST_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 12, y: 10 });
    soldier.life = 40;
    otherSoldier.life = 30;
    const [merged] = act(s, 0, { kind: 'merge', uid: soldier.uid, into: otherSoldier.uid });
    expect(merged?.kind === 'merge' && merged.path.at(-1)).toEqual({ x: 12, y: 10 });
    expect(otherSoldier.life).toBe(70);
    expect(s.units).toHaveLength(1);
  });
  it('subir y bajar del transporte', () => {
    const s = blankState(TEST_RULES);
    const transport = newUnit(s, TRANSPORT, 0, { x: 10, y: 10 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 12, y: 10 });
    act(s, 0, { kind: 'load', uid: passenger.uid, into: transport.uid });
    expect(passenger.carrier).toBe(transport.uid);
    expect(unitActions(s, transport).unload).toBe(true);
    act(s, 0, { kind: 'unload', uid: transport.uid, passenger: passenger.uid, to: { x: 10, y: 11 } });
    expect(passenger.carrier).toBeNull();
    expect(passenger.x).toBe(10);
    expect(passenger.y).toBe(11);
  });
});

describe('compra y fin de ronda', () => {
  it('fondos insuficientes: no compra', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: 'Factory', owner: 0, x: 4, y: 4 });
    expect(dispatch(s, 0, { kind: 'buy', at: { x: 4, y: 4 }, unitType: TANK.id })).toEqual({ ok: false, reason: 'funds' });
    expect(teamState(s, 0).funds).toBe(5000);
    const [bought] = act(s, 0, { kind: 'buy', at: { x: 4, y: 4 }, unitType: 'Car' });
    const car = s.units.find((unit) => bought?.kind === 'spawn' && unit.uid === bought.uid)!;
    expect(car.turnState).toBe('done');
    expect(teamState(s, 0).funds).toBe(5000 - unitTypeNamed('Car').cost); // el Jeep: lo que cueste ahora
  });
  it('ingresos y curacion; los aviones ya no caen', () => {
    const s = blankState(TEST_RULES);
    s.buildings.push({ type: 'City', owner: 0, x: 1, y: 1 }); // City
    const so = newUnit(s, SOLDIER, 0, { x: 1, y: 1 });
    so.life = 50;
    const flying = newUnit(s, LFIGHTER, 0, { x: 8, y: 8 });
    for (let i = 0; i < 60; i++) endRound(s);
    expect(s.units).toContain(flying);
    expect(so.life).toBe(100);
    const round = endRoundReport(s);
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
    act(s, 0, { kind: 'supply', uid: sup.uid });
    expect(tank.life).toBe(70);
    expect(so.life).toBe(40);
    expect(sup.turnState).toBe('done');
  });
});

const HQ = hqId();

describe('prevision y amenaza', () => {
  it('prevision de tanque contra tanque coherente', () => {
    const s = blankState(TEST_RULES);
    const attacker = newUnit(s, unitTypeNamed('Tank'), 0, { x: 10, y: 10 });
    attacker.life = 80;
    const defender = newUnit(s, unitTypeNamed('Tank'), 1, { x: 10, y: 12 });
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
    const attacker = newUnit(s, unitTypeNamed('Tank'), 0, { x: 10, y: 10 });
    const defender = newUnit(s, unitTypeNamed('Soldier'), 1, { x: 10, y: 11 });
    defender.life = 10;
    expect(combatForecast(s, attacker, defender).killChance).toBeGreaterThan(0.99);
  });
  it('amenaza: tanque enemigo visible cubre mover + alcance; invisible no cuenta', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, unitTypeNamed('Soldier'), 0, { x: 10, y: 10 }); // vision 4 del jugador
    newUnit(s, unitTypeNamed('Tank'), 1, { x: 12, y: 10 }); // tanque enemigo visible: mover 5 + alcance 2
    const th = threatMap(s, 0);
    expect(th.at({ x: 12, y: 17 })).toBe(true); // 7 abajo
    expect(th.at({ x: 12, y: 18 })).toBe(false);
    const other = blankState(TEST_RULES);
    newUnit(other, unitTypeNamed('Soldier'), 0, { x: 0, y: 0 });
    newUnit(other, unitTypeNamed('Tank'), 1, { x: 20, y: 20 }); // fuera de vision
    expect([...threatMap(other, 0).cells()].some((cell) => cell.value)).toBe(false);
  });
});
