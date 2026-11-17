import { describe, expect, it } from 'vitest';
import type { ForecastVM } from '../src/hud/vm/combat';
import { counterBadge, damageBadge } from '../src/ui/models/forecastBadges';

/** Las chapas de la prevision: el daño encima del enemigo y el contraataque encima de tu unidad. */

const TILE = { x: 0, y: 0, w: 10, h: 10 };

function forecast(change: Partial<ForecastVM> = {}): ForecastVM {
  return {
    attackerIcon: null,
    defenderIcon: null,
    low: 20,
    high: 40,
    expected: 30.4,
    lifeBefore: 100,
    lifeAfter: 70,
    killChance: 0,
    anchor: TILE,
    attackerAnchor: TILE,
    flank: 0,
    bounty: 0,
    counter: null,
    ...change,
  };
}

describe('la chapa del daño', () => {
  it('dice lo que se le quitaria (redondeado), sin color si no lo mata', () => {
    expect(damageBadge(forecast())).toMatchObject({ text: '−30', tone: 'plain' });
  });

  it('en dorado cuando lo mas probable es matarlo', () => {
    expect(damageBadge(forecast({ killChance: 0.6 })).tone).toBe('gold');
  });

  it('con la probabilidad de destruirlo solo si no es casi nula', () => {
    expect(damageBadge(forecast({ killChance: 0.3 })).death).toBe(0.3);
    expect(damageBadge(forecast({ killChance: 0.001 })).death).toBeNull();
  });
});

describe('la chapa del contraataque', () => {
  it('no sale si no habra contraataque', () => {
    expect(counterBadge(forecast())).toBeNull();
  });

  it('no sale si lo esperado no llega a 1 (casi seguro que el enemigo cae antes)', () => {
    const counter = { low: 0, high: 12, lifeBefore: 40, lifeAfter: 39.7, killChance: 0 };
    expect(counterBadge(forecast({ counter }))).toBeNull();
  });

  it('dice lo que perderia tu unidad; en rojo si puede morir', () => {
    const counter = { low: 5, high: 15, lifeBefore: 40, lifeAfter: 30, killChance: 0 };
    expect(counterBadge(forecast({ counter }))).toMatchObject({ text: '↩ −10', tone: 'plain' });
    expect(counterBadge(forecast({ counter: { ...counter, killChance: 0.3 } }))?.tone).toBe('danger');
  });
});
