import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING, DEFAULT_RULES, HEALER, RULES, UNIT, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { attackEvent, attackFull, endRound, hitChance, newUnit, unhealable } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { blankState } from './helpers';

/**
 * [CAMBIO] Reglas para que atacar salga a cuenta: botin, flanqueo y sin cura bajo fuego
 * (la veteranía mas fuerte esta en modern.test.ts).
 */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0;

beforeEach(() => useRules(DEFAULT_RULES));

describe('botin', () => {
  it('quien destruye cobra parte del precio de lo destruido', () => {
    useRules({ bounty: 0.25 });
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const d = newUnit(s, SOLDIER, 1, 10, 11);
    d.life = 1;
    const before = s.funds[0];
    const ev = attackEvent(s, a, d, seededRng(1));
    expect(ev.killed).toBe(true);
    expect(ev.bounty).toBe(Math.round(UNIT.cost[SOLDIER]! * 0.25));
    expect(s.funds[0]).toBe(before + ev.bounty!);
    expect(s.funds[1]).toBe(5000);
  });

  it('si cae el atacante en el contraataque, cobra el defensor', () => {
    useRules({ bounty: 0.25 });
    const s = blankState();
    const a = newUnit(s, SOLDIER, 0, 10, 10);
    const d = newUnit(s, TANK, 1, 10, 11);
    a.life = 1;
    const r = attackFull(s, a, d, seededRng(1));
    expect(r.attackerKilled).toBe(true);
    expect(s.funds[1]).toBe(5000 + Math.round(UNIT.cost[SOLDIER]! * 0.25));
  });

  it('sin la regla, ni dinero ni campo en el evento', () => {
    useRules({ bounty: 0 });
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const d = newUnit(s, SOLDIER, 1, 10, 11);
    d.life = 1;
    const ev = attackEvent(s, a, d, seededRng(1));
    expect(ev.bounty).toBeUndefined();
    expect(s.funds).toEqual([5000, 5000]);
  });
});

describe('flanqueo', () => {
  it('la segunda unidad que ataca a la misma ese dia acierta mas', () => {
    useRules({ flankBonus: 0.15, counterattack: false });
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const b = newUnit(s, TANK, 0, 11, 11);
    const d = newUnit(s, TANK, 1, 10, 11);
    const fresh = hitChance(s, b, d);
    attackFull(s, a, d, seededRng(1));
    expect(hitChance(s, b, d)).toBeCloseTo(fresh * 1.15);
    // Al dia siguiente ya no cuenta.
    endRound(s);
    expect(hitChance(s, b, d)).toBeCloseTo(fresh);
  });

  it('sin la regla no cambia nada', () => {
    useRules({ flankBonus: 0 });
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const d = newUnit(s, TANK, 1, 10, 11);
    const fresh = hitChance(s, a, d);
    d.hitDay = s.day;
    expect(hitChance(s, a, d)).toBe(fresh);
  });
});

describe('sin cura bajo fuego', () => {
  const setup = () => {
    const s = blankState();
    s.buildings.push({ type: CITY, owner: 1, x: 10, y: 11 });
    const a = newUnit(s, SOLDIER, 0, 10, 10);
    const d = newUnit(s, SOLDIER, 1, 10, 11);
    // Un soldado se cura en una ciudad propia.
    expect(HEALER[SOLDIER]![CITY]).toBe(true);
    return { s, a, d };
  };

  it('quien recibe un ataque ese dia no se cura en su ciudad', () => {
    useRules({ noHealUnderFire: true });
    const { s, a, d } = setup();
    attackFull(s, a, d, seededRng(1));
    const hurt = d.life;
    expect(hurt).toBeLessThan(100);
    expect(unhealable(s, d)).toBe(true);
    endRound(s);
    expect(d.life).toBe(hurt);
    // La noche siguiente, si nadie le ataca, si se cura.
    expect(unhealable(s, d)).toBe(false);
    endRound(s);
    expect(d.life).toBe(Math.min(100, hurt + BUILDING.heals[CITY]!));
  });

  it('sin la regla se cura como siempre', () => {
    useRules({ noHealUnderFire: false });
    const { s, a, d } = setup();
    attackFull(s, a, d, seededRng(1));
    const hurt = d.life;
    endRound(s);
    expect(d.life).toBe(Math.min(100, hurt + BUILDING.heals[CITY]!));
  });
});

describe('partidas guardadas', () => {
  it('las de antes de estas reglas se cargan como se jugaban', () => {
    const s = blankState();
    s.rules = { ...RULES };
    const old = JSON.parse(serialize(s)) as { rules: Record<string, unknown> };
    for (const k of ['vetBonus', 'bounty', 'flankBonus', 'noHealUnderFire']) delete old.rules[k];
    const back = deserialize(JSON.stringify(old));
    expect(back?.rules).toMatchObject({ vetBonus: 0.05, bounty: 0, flankBonus: 0, noHealUnderFire: false });
  });
});
