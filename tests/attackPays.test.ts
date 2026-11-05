import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/geom';
import { attackEvent, attackFull, endRound, hitChance, newUnit, unhealable } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { blankState, savedByVersion1 } from './helpers';

const { UNIT, HEALER, BUILDING } = defaultContent().tables;

/**
 * [CAMBIO] Reglas para que atacar salga a cuenta: botin, flanqueo y sin cura bajo fuego
 * (la veteranía mas fuerte esta en modern.test.ts).
 */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0;

describe('botin', () => {
  it('quien destruye cobra parte del precio de lo destruido', () => {
    const s = blankState({ bounty: 0.25 });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    defender.life = 1;
    const before = s.funds[0];
    const ev = attackEvent(s, attacker, defender, seededRng(1));
    expect(ev.killed).toBe(true);
    expect(ev.bounty).toBe(Math.round(UNIT.cost[SOLDIER]! * 0.25));
    expect(s.funds[0]).toBe(before + ev.bounty!);
    expect(s.funds[1]).toBe(5000);
  });

  it('si cae el atacante en el contraataque, cobra el defensor', () => {
    const s = blankState({ bounty: 0.25 });
    const attacker = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    attacker.life = 1;
    const result = attackFull(s, attacker, defender, seededRng(1));
    expect(result.attackerKilled).toBe(true);
    expect(s.funds[1]).toBe(5000 + Math.round(UNIT.cost[SOLDIER]! * 0.25));
  });

  it('sin la regla, ni dinero ni campo en el evento', () => {
    const s = blankState({ bounty: 0 });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    defender.life = 1;
    const ev = attackEvent(s, attacker, defender, seededRng(1));
    expect(ev.bounty).toBeUndefined();
    expect(s.funds).toEqual([5000, 5000]);
  });
});

describe('flanqueo', () => {
  it('la segunda unidad que ataca a la misma ese dia acierta mas', () => {
    const s = blankState({ flankBonus: 0.15, counterattack: false });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const secondAttacker = newUnit(s, TANK, 0, { x: 11, y: 11 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    const fresh = hitChance(s, secondAttacker, defender);
    attackFull(s, attacker, defender, seededRng(1));
    expect(hitChance(s, secondAttacker, defender)).toBeCloseTo(fresh * 1.15);
    // Al dia siguiente ya no cuenta.
    endRound(s);
    expect(hitChance(s, secondAttacker, defender)).toBeCloseTo(fresh);
  });

  it('sin la regla no cambia nada', () => {
    const s = blankState({ flankBonus: 0 });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    const fresh = hitChance(s, attacker, defender);
    defender.hitDay = s.day;
    expect(hitChance(s, attacker, defender)).toBe(fresh);
  });
});

describe('sin cura bajo fuego', () => {
  const setup = () => {
    const s = blankState();
    s.buildings.push({ type: CITY, owner: 1, x: 10, y: 11 });
    const attacker = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    // Un soldado se cura en una ciudad propia.
    expect(HEALER[SOLDIER]![CITY]).toBe(true);
    return { s, attacker, defender };
  };

  it('quien recibe un ataque ese dia no se cura en su ciudad', () => {
    const { s, attacker, defender } = setup();
    s.rules = rulesWith(defaultContent(), { noHealUnderFire: true });
    attackFull(s, attacker, defender, seededRng(1));
    const hurt = defender.life;
    expect(hurt).toBeLessThan(100);
    expect(unhealable(s, defender)).toBe(true);
    endRound(s);
    expect(defender.life).toBe(hurt);
    // La noche siguiente, si nadie le ataca, si se cura.
    expect(unhealable(s, defender)).toBe(false);
    endRound(s);
    expect(defender.life).toBe(Math.min(100, hurt + BUILDING.heals[CITY]!));
  });

  it('sin la regla se cura como siempre', () => {
    const { s, attacker, defender } = setup();
    s.rules = rulesWith(defaultContent(), { noHealUnderFire: false });
    attackFull(s, attacker, defender, seededRng(1));
    const hurt = defender.life;
    endRound(s);
    expect(defender.life).toBe(Math.min(100, hurt + BUILDING.heals[CITY]!));
  });
});

describe('partidas guardadas', () => {
  it('las de antes de estas reglas se cargan como se jugaban', () => {
    const s = blankState();
    const old = JSON.parse(serialize(s)) as { rules: Record<string, unknown> };
    for (const rule of ['vetBonus', 'bounty', 'flankBonus', 'noHealUnderFire']) delete old.rules[rule];
    const back = deserialize(savedByVersion1(JSON.stringify(old)), saveContext(defaultContent()));
    expect(back?.rules).toMatchObject({ vetBonus: 0.05, bounty: 0, flankBonus: 0, noHealUnderFire: false });
  });
});
