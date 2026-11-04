import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import {
  HIT_MODIFIERS,
  ROUND_PHASES,
  canDamage,
  endRound,
  fireOrigins,
  hitChance,
  moveRange,
  newUnit,
  reachableTiles,
  tileProtection,
} from '@core/rules';
import { coverAgainst } from '@core/abilities';
import { blankState } from './helpers';

const { UNIT, POWER } = defaultContent().tables;

/** Puntos de extension y ayudas compartidas del nucleo: modificadores del acierto, pasos del fin de ronda, origenes de tiro. */
/** Reglas de las partidas de estos tests. */
const TEST_RULES = rulesWith(defaultContent(), { fog: false });

const fighter = (): number => UNIT.canfight.findIndex((f, t) => !!f && POWER[t]!.some((p) => p > 0));

describe('modificadores del acierto (HIT_MODIFIERS)', () => {
  it('tienen nombres distintos', () => {
    const ids = HIT_MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hitChance es el poder por la proteccion por cada modificador, en orden', () => {
    const s = blankState(TEST_RULES);
    const t = fighter();
    const def = POWER[t]!.findIndex((p) => p > 0);
    const a = newUnit(s, t, 0, { x: 2, y: 2 });
    const d = newUnit(s, def, 1, { x: 3, y: 2 });
    d.hitDay = s.day; // flanqueado
    a.kills = 3; // veterano
    let p = POWER[t]![def]! * coverAgainst(s, t, tileProtection(s, d));
    for (const m of HIT_MODIFIERS) p *= m.factor(s, a, d);
    expect(hitChance(s, a, d)).toBe(p);
  });

  it('con las reglas apagadas cada modificador vale 1', () => {
    const s = blankState(rulesWith(defaultContent(), { fog: false, veterancy: false, flankBonus: 0, abilities: false, weather: false }));
    const t = fighter();
    const a = newUnit(s, t, 0, { x: 2, y: 2 });
    const d = newUnit(s, t, 1, { x: 3, y: 2 });
    for (const m of HIT_MODIFIERS) expect(m.factor(s, a, d), m.id).toBe(1);
  });
});

describe('pasos del fin de ronda (ROUND_PHASES)', () => {
  it('tienen nombres distintos y el dia cambia antes que el clima', () => {
    const ids = ROUND_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf('day')).toBeLessThan(ids.indexOf('weather'));
    expect(ids.indexOf('buildings')).toBeLessThan(ids.indexOf('upkeep'));
  });

  it('endRound los recorre todos: reactiva unidades y pasa el dia', () => {
    const s = blankState(TEST_RULES);
    const u = newUnit(s, fighter(), 0, { x: 1, y: 1 }, false);
    const r = endRound(s);
    expect(s.day).toBe(2);
    expect(u.active && u.canMove && u.canFire).toBe(true);
    expect(r.income).toEqual([0, 0]);
  });
});

describe('ayudas de combate compartidas', () => {
  it('fireOrigins: donde esta y, si puede mover y disparar, lo que alcanza', () => {
    const s = blankState(TEST_RULES);
    const melee = UNIT.canfight.findIndex((f, t) => !!f && UNIT.minalc[t] === 0 && UNIT.mover[t]! > 0);
    const ranged = UNIT.canfight.findIndex((f, t) => !!f && UNIT.minalc[t]! > 0);
    const m = newUnit(s, melee, 0, { x: 5, y: 5 });
    const r = newUnit(s, ranged, 0, { x: 9, y: 9 });
    const range = moveRange(s, m);
    expect(fireOrigins(s, m, range)).toEqual([{ x: 5, y: 5 }, ...reachableTiles(range)]);
    expect(fireOrigins(s, m, null)).toEqual([{ x: 5, y: 5 }]);
    expect(fireOrigins(s, m, range, () => false)).toEqual([{ x: 5, y: 5 }]);
    expect(fireOrigins(s, r, moveRange(s, r))).toEqual([{ x: 9, y: 9 }]);
  });

  it('canDamage: lucha y su poder contra ese tipo es mayor que 0', () => {
    const s = blankState(TEST_RULES);
    const t = fighter();
    const a = newUnit(s, t, 0, { x: 1, y: 1 });
    for (let d = 0; d < POWER[t]!.length; d++) expect(canDamage(s, a, newUnit(s, d, 1, { x: 2, y: 1 }))).toBe(POWER[t]![d]! > 0);
    const pacifist = UNIT.canfight.findIndex((f) => !f);
    if (pacifist >= 0) expect(canDamage(s, newUnit(s, pacifist, 0, { x: 3, y: 3 }), a)).toBe(false);
  });
});
