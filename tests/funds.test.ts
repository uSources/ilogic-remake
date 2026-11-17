import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { capFunds, earn, pay } from '@core/rules/funds';
import { teamState } from '@core/teams';
import { blankState, endRoundReport, unitTypeNamed } from './helpers';
import { PLAIN_SETTINGS } from './plainSettings';

describe('dinero: cobrar, pagar y el tope', () => {
  it('pagar no deja en negativo: paga lo que hay', () => {
    const s = blankState(PLAIN_SETTINGS);
    teamState(s, 0).funds = 300;
    expect(pay(s, 0, 500)).toBe(300);
    expect(teamState(s, 0).funds).toBe(0);
  });

  it('en el fin de ronda el mantenimiento se paga con lo cobrado ese dia, y despues el tope', () => {
    const s = blankState({ ...PLAIN_SETTINGS, upkeep: 0.1 });
    const max = s.content.maxFunds;
    s.buildings.push({ type: 'City', owner: 0, x: 1, y: 1 });
    newUnit(s, unitTypeNamed('Tank'), 0, { x: 5, y: 5 });
    teamState(s, 0).funds = max - 100;
    const report = endRoundReport(s);
    expect(report.upkeep?.[0]).toBeGreaterThan(0);
    expect(teamState(s, 0).funds).toBe(Math.min(max, max - 100 + report.income[0]! - (report.upkeep?.[0] ?? 0)));
  });

  it('earn suma y capFunds recorta a todos', () => {
    const s = blankState(PLAIN_SETTINGS);
    earn(s, 1, s.content.maxFunds);
    capFunds(s);
    expect(teamState(s, 1).funds).toBe(s.content.maxFunds);
  });
});
