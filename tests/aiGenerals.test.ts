import { describe, expect, it } from 'vitest';
import { aiGeneral, bestAreaTarget, choosePower } from '@core/aiGenerals';
import { aiCtx } from '@core/ai/context';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { appointGeneral, generalDef } from '@core/generals';
import { newUnit } from '@core/rules';
import type { GameState } from '@core/model';
import { blankState, unitTypeNamed } from './helpers';
import { teamState } from '@core/teams';

const AI = defaultContent().ai;

const unitType = unitTypeNamed;

/** La IA (equipo 1) con Brisa y la carga dada; una unidad suya para ver algo. */
function aiBrisa(charge: number, fog = false): GameState {
  const s = blankState(rulesWith(defaultContent(), { fog, weather: false }));
  appointGeneral(s, 1, 'Brisa');
  teamState(s, 1).general!.charge = charge;
  newUnit(s, unitType('Soldier'), 1, { x: 10, y: 10 });
  return s;
}

describe('la IA usa a su general', () => {
  it('ataque aereo donde mas valor quita (dos tanques juntos mejor que uno solo)', () => {
    const s = aiBrisa(6);
    newUnit(s, unitType('Tank'), 0, { x: 3, y: 3 });
    newUnit(s, unitType('Tank'), 0, { x: 14, y: 14 });
    newUnit(s, unitType('Tank'), 0, { x: 15, y: 15 });
    const best = bestAreaTarget(s, 1, 1, 30, 10)!;
    expect(best.value).toBeGreaterThan(7000);
    expect(Math.abs(best.target.x - 14.5)).toBeLessThanOrEqual(1);
    const choice = choosePower(s, 1)!;
    expect(choice.power).toBe('airstrike');
    const evs = [...aiGeneral(s, aiCtx(1))];
    expect(evs).toHaveLength(1);
    const event = evs[0]!;
    expect(event.kind === 'power' ? event.hits.length : 0).toBe(2);
  });

  it('no gasta la carga en algo que vale poco', () => {
    // Con Roca: su reparacion no gasta la barra entera, asi que puede esperar a que valga la pena.
    const s = blankState(rulesWith(defaultContent(), { weather: false }));
    appointGeneral(s, 1, 'Roca');
    teamState(s, 1).general!.charge = generalDef(s, 'Roca')!.powers[0]!.cost;
    newUnit(s, unitType('Tank'), 1, { x: 3, y: 3 }).life = 98; // 2 de vida de un tanque: poco valor
    expect(choosePower(s, 1)).toBeNull();
  });

  it('con la barra llena usa lo que valga algo (reconocimiento con niebla)', () => {
    const s = aiBrisa(6, true);
    const choice = choosePower(s, 1)!;
    expect(choice.power).toBe('recon');
    expect(choice.value).toBe(AI.REVEALVALUE);
  });

  it('no bombardea a ciegas: solo enemigos que ve', () => {
    const s = aiBrisa(5, true);
    newUnit(s, unitType('Tank'), 0, { x: 25, y: 25 }); // lejos, en la niebla
    newUnit(s, unitType('Tank'), 0, { x: 26, y: 25 });
    expect(bestAreaTarget(s, 1, 1, 30, 10)).toBeNull();
  });

  it('sin general, o ya usada este turno, no hace nada', () => {
    const s = aiBrisa(6);
    newUnit(s, unitType('Tank'), 0, { x: 11, y: 11 });
    teamState(s, 1).general!.used = true;
    expect([...aiGeneral(s, aiCtx(1))]).toEqual([]);
    teamState(s, 1).general = null;
    expect([...aiGeneral(s, aiCtx(1))]).toEqual([]);
  });
});
