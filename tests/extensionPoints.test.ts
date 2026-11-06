import { describe, expect, it } from 'vitest';
import { settingsWith } from '@core/matchSettings';
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
  engagement,
  hitModifiersOf,
  hooksOf,
  roundPhasesOf,
  SHOT_BY_SHOT,
  DAMAGE_MODELS,
  spreadAround,
  damageModelOf,
  canCounter,
  MELEE_COUNTER,
  ROUND_REPORT_PARTS,
} from '@core/rules';
import { COMBAT_RESOLUTION, combatResolutionOf } from '@core/actions';
import type { UnitType } from '@core/content';
import { blankState, endRoundReport, unitTypeNamed, withoutHeadquarters } from './helpers';

const UNIT_TYPES = defaultContent().units.list;
const power = (attacker: UnitType, defender: UnitType) => attacker.attack?.hitChance[defender.id] ?? 0;

/** Puntos de extension y ayudas compartidas del nucleo: modificadores del acierto, pasos del fin de ronda, origenes de tiro. */
/** Reglas de las partidas de estos tests. */
const TEST_SETTINGS = settingsWith(defaultContent(), { fog: false });

const fighter = (): UnitType => UNIT_TYPES.find((unitType) => UNIT_TYPES.some((target) => power(unitType, target) > 0))!;

describe('modificadores del acierto (HIT_MODIFIERS y los de los modulos)', () => {
  it('tienen nombres distintos', () => {
    const ids = hitModifiersOf(blankState(TEST_SETTINGS)).map((hitModifier) => hitModifier.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hitChance es el poder, por la proteccion, por cada modificador de los modulos, en orden', () => {
    const s = blankState(TEST_SETTINGS);
    const fighterType = fighter();
    const defenderType = UNIT_TYPES.find((target) => power(fighterType, target) > 0)!;
    const attacker = newUnit(s, fighterType, 0, { x: 2, y: 2 });
    const defender = newUnit(s, defenderType, 1, { x: 3, y: 2 });
    defender.hitDay = s.day; // flanqueado
    attacker.kills = 3; // veterano
    const fight = engagement(attacker, defender);
    const ids = hitModifiersOf(s).map((modifier) => modifier.id);
    expect(ids.slice(0, HIT_MODIFIERS.length)).toEqual(['power', 'cover']);
    expect(ids).toEqual(['power', 'cover', 'guard', 'aura', 'veterancy', 'flank', 'generals', 'weather']);
    let chance = power(fighterType, defenderType) * tileProtection(s, defender);
    for (const modifier of hooksOf(s, 'hitModifiers')) chance *= modifier.factor(s, fight);
    expect(hitChance(s, fight)).toBe(chance);
  });

  it('sin los modulos solo quedan el poder y la proteccion', () => {
    const s = blankState(settingsWith(defaultContent(), { fog: false, veterancy: false, flankBonus: 0, abilities: false, weather: false }));
    const fighterType = fighter();
    const attacker = newUnit(s, fighterType, 0, { x: 2, y: 2 });
    const defender = newUnit(s, fighterType, 1, { x: 3, y: 2 });
    expect(hitModifiersOf(s).map((modifier) => modifier.id)).toEqual(['power', 'cover', 'generals']);
    expect(hitChance(s, engagement(attacker, defender))).toBe(power(fighterType, fighterType) * tileProtection(s, defender));
  });
});

describe('pasos del fin de ronda (ROUND_PHASES y los de los modulos)', () => {
  it('tienen nombres distintos y van por momentos: el dia cambia antes que el clima', () => {
    const ids = roundPhasesOf(blankState(TEST_SETTINGS)).map((roundPhase) => roundPhase.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['refresh', 'generals', 'buildings', 'control', 'upkeep', 'day', 'weather', 'army']);
  });

  it('sin los modulos solo quedan los de siempre', () => {
    const s = blankState(settingsWith(defaultContent(), { weather: false, upkeep: 0, controlPoints: 0 }));
    expect(roundPhasesOf(s).map((roundPhase) => roundPhase.id)).toEqual(['refresh', 'generals', 'buildings', 'day', 'army']);
    expect(ROUND_PHASES.map((roundPhase) => roundPhase.stage)).toEqual(['start', 'income', 'newDay', 'record']);
  });

  it('endRound los recorre todos: reactiva unidades y pasa el dia', () => {
    const s = withoutHeadquarters(blankState(TEST_SETTINGS));
    const unit = newUnit(s, fighter(), 0, { x: 1, y: 1 }, 'done');
    const round = endRoundReport(s);
    expect(s.day).toBe(2);
    expect(unit.turnState).toBe('ready');
    expect(round.income).toEqual([0, 0]);
  });
});

describe('ayudas de combate compartidas', () => {
  it('fireOrigins: donde esta y, si puede mover y disparar, lo que alcanza', () => {
    const s = blankState(TEST_SETTINGS);
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
    const s = blankState(TEST_SETTINGS);
    const fighterType = fighter();
    const attacker = newUnit(s, fighterType, 0, { x: 1, y: 1 });
    for (const defenderType of UNIT_TYPES)
      expect(canDamage(s, attacker, newUnit(s, defenderType, 1, { x: 2, y: 1 }))).toBe(power(fighterType, defenderType) > 0);
    const pacifist = UNIT_TYPES.find((unitType) => unitType.attack === null);
    if (pacifist) expect(canDamage(s, newUnit(s, pacifist, 0, { x: 3, y: 3 }), attacker)).toBe(false);
  });
});

describe('modelos de daño (DamageModel)', () => {
  const always = { roll: () => 0 };
  const never = { roll: () => 0.999 };

  it('disparo a disparo: la tirada y el reparto dicen lo mismo (binomial)', () => {
    expect(SHOT_BY_SHOT.roll(10, 0.5, always)).toBe(10);
    expect(SHOT_BY_SHOT.roll(10, 0.5, never)).toBe(0);
    const distribution = SHOT_BY_SHOT.distribution(2, 0.5);
    expect(distribution).toEqual([0.25, 0.5, 0.25]);
  });

  it('esperado +- un tanto: la tirada cae dentro del reparto y el reparto suma 1', () => {
    const model = spreadAround(0.2);
    const distribution = model.distribution(50, 0.5);
    expect(distribution.reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1);
    for (const roll of [0, 0.5, 0.999]) expect(distribution[model.roll(50, 0.5, { roll: () => roll })]).toBeGreaterThan(0);
  });

  it('la partida elige el suyo con damageModel (DAMAGE_MODELS), construido una vez con sus modulos', () => {
    expect(Object.keys(DAMAGE_MODELS)).toEqual(['shotByShot', 'spread']);
    expect(damageModelOf(blankState(settingsWith(defaultContent(), { damageModel: 'shotByShot' })))).toBe(SHOT_BY_SHOT);
    const s = blankState(TEST_SETTINGS);
    expect(damageModelOf(s)).not.toBe(SHOT_BY_SHOT);
    expect(damageModelOf(s)).toBe(damageModelOf(s));
  });
});

describe('lo que pasa en un ataque (COMBAT_RESOLUTION y los pasos de los modulos)', () => {
  it('por momentos: golpe, contraataque, lo de herir (generales) y lo de caer (bajas, botin)', () => {
    expect(combatResolutionOf(blankState(TEST_SETTINGS)).map((step) => step.id)).toEqual([
      'strike',
      'counter',
      'charge',
      'kills',
      'bounty',
    ]);
    expect(COMBAT_RESOLUTION.map((step) => step.stage)).toEqual(['strike', 'counter', 'kill']);
    const noBounty = blankState(settingsWith(defaultContent(), { fog: false, bounty: 0 }));
    expect(combatResolutionOf(noBounty).map((step) => step.id)).toEqual(['strike', 'counter', 'charge', 'kills']);
  });

  it('el contraataque lo deciden las reglas de los modulos: sin el modulo nadie responde', () => {
    const s = blankState(TEST_SETTINGS);
    const attacker = newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    const defender = newUnit(s, unitTypeNamed('Tank'), 1, { x: 3, y: 2 });
    expect(hooksOf(s, 'counterRules')).toEqual([MELEE_COUNTER]);
    expect(canCounter(s, engagement(attacker, defender))).toBe(true);
    expect(canCounter(s, engagement(attacker, defender, { defenderLife: 0 }))).toBe(false);
    expect(canCounter(s, engagement(attacker, defender, { from: { x: 2, y: 9 } }))).toBe(false);
    const plain = blankState(settingsWith(defaultContent(), { fog: false, counterattack: false }));
    const lone = newUnit(plain, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    expect(canCounter(plain, engagement(lone, newUnit(plain, unitTypeNamed('Tank'), 1, { x: 3, y: 2 })))).toBe(false);
  });
});

describe('partes del resumen de la ronda (ROUND_REPORT_PARTS y las de los modulos)', () => {
  it('lo de siempre (cobrado y curado) y lo de cada modulo puesto (mantenimiento, puntos de control, clima)', () => {
    expect(ROUND_REPORT_PARTS.map((part) => part.id)).toEqual(['income', 'healed']);
    expect(hooksOf(blankState(TEST_SETTINGS), 'roundReportParts').map((part) => part.id)).toEqual(['weather', 'control', 'upkeep']);
    const plain = blankState(settingsWith(defaultContent(), { weather: false, upkeep: 0, controlPoints: 0 }));
    expect(hooksOf(plain, 'roundReportParts')).toEqual([]);
  });
});
