import { defaultContent } from '@core/content/default';
import { describe, expect, it } from 'vitest';

import { seededRng } from '@core/util/random';
import { captureProgress, combatForecast, newUnit, visibility } from '@core/rules';
import { dropStaleCaptures } from '@core/rules/capture';
import type { GameState, Unit } from '@core/model';
import { act, blankState, diceFrom, unitTypeNamed, fight } from './helpers';

/** Captura con la unidad (por dispatch) y da lo que dice su suceso: puntos que quedan y totales. */
function capture(s: GameState, unit: Unit) {
  const [event] = act(s, unit.team, { kind: 'capture', uid: unit.uid });
  if (event?.kind !== 'capture') throw new Error('no ha capturado');
  return { done: event.left === 0, left: event.left, total: event.total };
}

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  ARTILLERY = unitTypeNamed('Artillery');

describe('reglas nuevas: combate', () => {
  it('el defensor que sobrevive contraataca y gasta municion', () => {
    const s = blankState();
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    const result = fight(s, attacker, defender, diceFrom(seededRng(2)));
    expect(result.damage).toBeGreaterThan(0);
    expect(result.killed).toBe(false);
    expect(result.counter).toBeGreaterThan(0);
    expect(attacker.life).toBe(100 - (result.counter ?? 0));
    // Responde con la vida que le queda: menos de lo que recibio.
    expect(result.counter).toBeLessThan(result.damage);
  });

  it('la artilleria ni contraataca ni recibe contraataque', () => {
    const s = blankState();
    const art = newUnit(s, ARTILLERY, 0, { x: 10, y: 10 });
    const tank = newUnit(s, TANK, 1, { x: 10, y: 13 });
    expect(fight(s, art, tank, diceFrom(seededRng(1))).counter).toBe(0);
    const other = blankState();
    const t2 = newUnit(other, TANK, 0, { x: 10, y: 10 });
    const art2 = newUnit(other, ARTILLERY, 1, { x: 10, y: 11 });
    expect(fight(other, t2, art2, diceFrom(seededRng(1))).counter).toBe(0);
  });

  it('el evento de ataque guarda como estaban las unidades antes del combate', () => {
    const s = blankState();
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    defender.life = 80;
    const event = fight(s, attacker, defender, diceFrom(seededRng(2)));
    expect(event.combat).toMatchObject({
      attackerType: attacker.type,
      defenderType: defender.type,
      attackerTeam: 0,
      attackerLife: 100,
      defenderLife: 80,
    });
    expect(event.target).toEqual({ x: 10, y: 11 });
    expect(event.combat!.hit).toBeGreaterThan(0);
    expect(event.combat!.counterHit).not.toBeNull();
    // Las vidas de despues salen de las de antes menos el daño.
    expect(defender.life).toBe(80 - event.damage);
    expect(attacker.life).toBe(100 - event.counter!);
  });

  it('sin contraataque si el defensor cae o es de distancia', () => {
    const s = blankState();
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    defender.life = 1;
    const event = fight(s, attacker, defender, diceFrom(seededRng(1)));
    expect(event.killed).toBe(true);
    expect(event.combat!.counterHit).toBeNull();
    const other = blankState();
    const art = newUnit(other, ARTILLERY, 0, { x: 10, y: 10 });
    const tank = newUnit(other, TANK, 1, { x: 10, y: 13 });
    expect(fight(other, art, tank, diceFrom(seededRng(1))).combat!.counterHit).toBeNull();
  });

  it('daño = esperado +-10 %', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = blankState();
      const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
      const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
      defender.life = 100;
      const forecast = combatForecast(s, attacker, defender);
      const result = fight(s, attacker, defender, diceFrom(seededRng(seed)));
      expect(result.damage).toBeGreaterThanOrEqual(forecast.low - 1);
      expect(result.damage).toBeLessThanOrEqual(Math.max(forecast.high, 0) + 1);
    }
  });

  it('la prevision incluye el contraataque', () => {
    const s = blankState();
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    const forecast = combatForecast(s, attacker, defender);
    expect(forecast.counter).not.toBeNull();
    expect(forecast.counter!.expected).toBeGreaterThan(0);
    expect(forecast.counter!.expected).toBeLessThan(forecast.expected);
    defender.life = 1;
    expect(combatForecast(s, attacker, defender).counter!.expected).toBe(0);
  });

  it('sin niebla se ve todo el mapa', () => {
    const s = blankState();
    s.rules.fog = false;
    expect([...visibility(s, 0).cells()].every((cell) => cell.value)).toBe(true);
  });
});

describe('reglas nuevas: captura por puntos', () => {
  const HQ = defaultContent().hq.id;
  it('una ciudad cuesta 2 turnos a una unidad entera y pasa directamente a ser tuya', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: 1, x: 3, y: 3 });
    const unit = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    const r1 = capture(s, unit);
    expect(r1).toEqual({ done: false, left: 10, total: 20 });
    expect(s.buildings[0]!.owner).toBe(1);
    unit.turnState = 'ready';
    const r2 = capture(s, unit);
    expect(r2.done).toBe(true);
    expect(s.buildings[0]!.owner).toBe(0);
    expect(s.buildings[0]!.capture).toBeNull();
  });

  it('una unidad herida captura mas despacio; la Base tiene 30 puntos', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 1, x: 3, y: 3 });
    const unit = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    unit.life = 45;
    expect(capture(s, unit).left).toBe(25);
  });

  it('si la unidad se va, se pierde lo avanzado', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: null, x: 3, y: 3 });
    const unit = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    capture(s, unit);
    expect(captureProgress(s, s.buildings[0]!)?.left).toBe(10);
    unit.x = 4;
    expect(captureProgress(s, s.buildings[0]!)).toBeNull();
    expect(s.buildings[0]!.capture).not.toBeNull(); // consultar no la borra...
    dropStaleCaptures(s); // ...la borra la invariante que repasa dispatch tras cada accion
    expect(s.buildings[0]!.capture).toBeNull();
    unit.x = 3;
    unit.turnState = 'ready';
    expect(capture(s, unit).left).toBe(10);
  });
});

describe('reglas nuevas: veterania', () => {
  it('sube de rango al destruir y mejora acierto y defensa', async () => {
    const { hitChance, rank } = await import('@core/rules');
    const s = blankState();
    const attacker = newUnit(s, TANK, 0, { x: 3, y: 3 });
    const defender = newUnit(s, TANK, 1, { x: 4, y: 3 });
    const base = hitChance(s, attacker, defender);
    expect(rank(attacker)).toBe(0);
    defender.life = 1;
    const result = fight(s, attacker, defender, diceFrom(seededRng(1)));
    expect(result.killed).toBe(true);
    expect(attacker.kills).toBe(1);
    expect(rank(attacker)).toBe(1);
    const newDefender = newUnit(s, TANK, 1, { x: 4, y: 3 });
    expect(hitChance(s, attacker, newDefender)).toBeCloseTo(base * (1 + s.rules.vetBonus));
    expect(hitChance(s, newDefender, attacker)).toBeCloseTo(base * (1 - s.rules.vetBonus));
    attacker.kills = 6;
    expect(rank(attacker)).toBe(3);
    const ally = newUnit(s, TANK, 0, { x: 2, y: 3 });
    act(s, 0, { kind: 'merge', uid: ally.uid, into: attacker.uid });
    expect(attacker.kills).toBe(6);
  });

  it('sin veterania las bajas no cuentan', async () => {
    const { hitChance } = await import('@core/rules');
    const s = blankState({ veterancy: false });
    const attacker = newUnit(s, TANK, 0, { x: 3, y: 3 });
    const defender = newUnit(s, TANK, 1, { x: 4, y: 3 });
    const base = hitChance(s, attacker, defender);
    attacker.kills = 6;
    expect(hitChance(s, attacker, defender)).toBe(base);
  });
});
