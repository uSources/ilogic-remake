import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/util/random';
import { endRound, hitChance, newUnit, unhealable } from '@core/rules';
import { blankState, buildingTypeNamed, diceFrom, unitTypeNamed, fight } from './helpers';
import { teamState } from '@core/teams';

/**
 * [CAMBIO] Reglas para que atacar salga a cuenta: botin, flanqueo y sin cura bajo fuego
 * (la veteranía mas fuerte esta en modern.test.ts).
 */
const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  CITY = 'City';

describe('botin', () => {
  it('quien destruye cobra parte del precio de lo destruido', () => {
    const s = blankState({ bounty: 0.25 });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    defender.life = 1;
    const before = teamState(s, 0).funds;
    const event = fight(s, attacker, defender, diceFrom(seededRng(1)));
    expect(event.killed).toBe(true);
    expect(event.bounty).toBe(Math.round(SOLDIER.cost * 0.25));
    expect(teamState(s, 0).funds).toBe(before + event.bounty!);
    expect(teamState(s, 1).funds).toBe(5000);
  });

  it('si cae el atacante en el contraataque, cobra el defensor', () => {
    const s = blankState({ bounty: 0.25 });
    const attacker = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    attacker.life = 1;
    const result = fight(s, attacker, defender, diceFrom(seededRng(1)));
    expect(result.attackerKilled).toBe(true);
    expect(teamState(s, 1).funds).toBe(5000 + Math.round(SOLDIER.cost * 0.25));
  });

  it('sin la regla, ni dinero ni campo en el evento', () => {
    const s = blankState({ bounty: 0 });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const defender = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    defender.life = 1;
    const event = fight(s, attacker, defender, diceFrom(seededRng(1)));
    expect(event.bounty).toBeUndefined();
    expect(s.teams.map((team) => team.funds)).toEqual([5000, 5000]);
  });
});

describe('flanqueo', () => {
  it('la segunda unidad que ataca a la misma ese dia acierta mas', () => {
    const s = blankState({ flankBonus: 0.15, counterattack: false });
    const attacker = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const secondAttacker = newUnit(s, TANK, 0, { x: 11, y: 11 });
    const defender = newUnit(s, TANK, 1, { x: 10, y: 11 });
    const fresh = hitChance(s, secondAttacker, defender);
    fight(s, attacker, defender, diceFrom(seededRng(1)));
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
    expect(SOLDIER.repairedAt).toContain('City');
    return { s, attacker, defender };
  };

  it('quien recibe un ataque ese dia no se cura en su ciudad', () => {
    const { s, attacker, defender } = setup();
    s.rules = rulesWith(defaultContent(), { noHealUnderFire: true });
    fight(s, attacker, defender, diceFrom(seededRng(1)));
    const hurt = defender.life;
    expect(hurt).toBeLessThan(100);
    expect(unhealable(s, defender)).toBe(true);
    endRound(s);
    expect(defender.life).toBe(hurt);
    // La noche siguiente, si nadie le ataca, si se cura.
    expect(unhealable(s, defender)).toBe(false);
    endRound(s);
    expect(defender.life).toBe(Math.min(100, hurt + buildingTypeNamed('City').heals));
  });

  it('sin la regla se cura como siempre', () => {
    const { s, attacker, defender } = setup();
    s.rules = rulesWith(defaultContent(), { noHealUnderFire: false });
    fight(s, attacker, defender, diceFrom(seededRng(1)));
    const hurt = defender.life;
    endRound(s);
    expect(defender.life).toBe(Math.min(100, hurt + buildingTypeNamed('City').heals));
  });
});
