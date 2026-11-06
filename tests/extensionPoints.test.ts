import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import {
  HIT_MODIFIERS,
  ROUND_PHASES,
  canDamage,
  fireOrigins,
  hitChance,
  moveRange,
  newUnit,
  reachableTiles,
  tileProtection,
} from '@core/rules';
import { coverAgainst } from '@core/abilities';
import type { UnitType } from '@core/content';
import { blankState, endRoundReport, withoutHeadquarters } from './helpers';

const UNIT_TYPES = defaultContent().units.list;
const power = (attacker: UnitType, defender: UnitType) => attacker.attack?.hitChance[defender.id] ?? 0;

/** Puntos de extension y ayudas compartidas del nucleo: modificadores del acierto, pasos del fin de ronda, origenes de tiro. */
/** Reglas de las partidas de estos tests. */
const TEST_RULES = rulesWith(defaultContent(), { fog: false });

const fighter = (): UnitType => UNIT_TYPES.find((unitType) => UNIT_TYPES.some((target) => power(unitType, target) > 0))!;

describe('modificadores del acierto (HIT_MODIFIERS)', () => {
  it('tienen nombres distintos', () => {
    const ids = HIT_MODIFIERS.map((hitModifier) => hitModifier.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hitChance es el poder por la proteccion por cada modificador, en orden', () => {
    const s = blankState(TEST_RULES);
    const fighterType = fighter();
    const defenderType = UNIT_TYPES.find((target) => power(fighterType, target) > 0)!;
    const attacker = newUnit(s, fighterType, 0, { x: 2, y: 2 });
    const defender = newUnit(s, defenderType, 1, { x: 3, y: 2 });
    defender.hitDay = s.day; // flanqueado
    attacker.kills = 3; // veterano
    let chance = power(fighterType, defenderType) * coverAgainst(s, attacker, tileProtection(s, defender));
    for (const modifier of HIT_MODIFIERS) chance *= modifier.factor(s, attacker, defender);
    expect(hitChance(s, attacker, defender)).toBe(chance);
  });

  it('con las reglas apagadas cada modificador vale 1', () => {
    const s = blankState(rulesWith(defaultContent(), { fog: false, veterancy: false, flankBonus: 0, abilities: false, weather: false }));
    const fighterType = fighter();
    const attacker = newUnit(s, fighterType, 0, { x: 2, y: 2 });
    const defender = newUnit(s, fighterType, 1, { x: 3, y: 2 });
    for (const modifier of HIT_MODIFIERS) expect(modifier.factor(s, attacker, defender), modifier.id).toBe(1);
  });
});

describe('pasos del fin de ronda (ROUND_PHASES)', () => {
  it('tienen nombres distintos y el dia cambia antes que el clima', () => {
    const ids = ROUND_PHASES.map((roundPhase) => roundPhase.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf('day')).toBeLessThan(ids.indexOf('weather'));
    expect(ids.indexOf('buildings')).toBeLessThan(ids.indexOf('upkeep'));
  });

  it('endRound los recorre todos: reactiva unidades y pasa el dia', () => {
    const s = withoutHeadquarters(blankState(TEST_RULES));
    const unit = newUnit(s, fighter(), 0, { x: 1, y: 1 }, 'done');
    const round = endRoundReport(s);
    expect(s.day).toBe(2);
    expect(unit.turnState).toBe('ready');
    expect(round.income).toEqual([0, 0]);
  });
});

describe('ayudas de combate compartidas', () => {
  it('fireOrigins: donde esta y, si puede mover y disparar, lo que alcanza', () => {
    const s = blankState(TEST_RULES);
    const melee = UNIT_TYPES.find((unitType) => unitType.attack?.minRange === 1 && unitType.move > 0)!;
    const ranged = UNIT_TYPES.find((unitType) => (unitType.attack?.minRange ?? 1) > 1)!;
    const meleeUnit = newUnit(s, melee, 0, { x: 5, y: 5 });
    const rangedUnit = newUnit(s, ranged, 0, { x: 9, y: 9 });
    const range = moveRange(s, meleeUnit);
    expect(fireOrigins(s, meleeUnit, range)).toEqual([{ x: 5, y: 5 }, ...reachableTiles(range)]);
    expect(fireOrigins(s, meleeUnit, null)).toEqual([{ x: 5, y: 5 }]);
    expect(fireOrigins(s, meleeUnit, range, () => false)).toEqual([{ x: 5, y: 5 }]);
    expect(fireOrigins(s, rangedUnit, moveRange(s, rangedUnit))).toEqual([{ x: 9, y: 9 }]);
  });

  it('canDamage: lucha y su poder contra ese tipo es mayor que 0', () => {
    const s = blankState(TEST_RULES);
    const fighterType = fighter();
    const attacker = newUnit(s, fighterType, 0, { x: 1, y: 1 });
    for (const defenderType of UNIT_TYPES)
      expect(canDamage(s, attacker, newUnit(s, defenderType, 1, { x: 2, y: 1 }))).toBe(power(fighterType, defenderType) > 0);
    const pacifist = UNIT_TYPES.find((unitType) => unitType.attack === null);
    if (pacifist) expect(canDamage(s, newUnit(s, pacifist, 0, { x: 3, y: 3 }), attacker)).toBe(false);
  });
});
