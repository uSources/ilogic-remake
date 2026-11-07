import { describe, expect, it } from 'vitest';
import { aiGeneral, choosePower, defaultAiProfile } from '@core/ai';
import { bestAreaTarget, powerValue } from '@core/generalPowers';
import { playCtx } from '@core/autopilot/context';
import { settingsWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import { appointGeneral, generalDef } from '@core/generals';
import { newUnit } from '@core/measure';
import type { GameState } from '@core/model';
import { blankState, giveTurn, unitTypeNamed, playPlan } from './helpers';
import { teamState } from '@core/teams';

const AI = defaultContent().ai;

const unitType = unitTypeNamed;

/** La IA (equipo 1) con Brisa y la carga dada; una unidad suya para ver algo. */
function aiBrisa(charge: number, fog = false): GameState {
  const s = blankState(settingsWith(defaultContent(), { fog, weather: false }));
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
    const best = bestAreaTarget(s, 1, { kind: 'areaDamage', radius: 1, damage: 30, minLife: 10 })!;
    expect(best.value).toBeGreaterThan(7000);
    expect(Math.abs(best.target.x - 14.5)).toBeLessThanOrEqual(1);
    const choice = choosePower(s, 1, AI)!;
    expect(choice.power).toBe('airstrike');
    const evs = playPlan(giveTurn(s, 1), 1, aiGeneral(s, playCtx(1, defaultAiProfile(defaultContent()))));
    expect(evs).toHaveLength(1);
    const event = evs[0]!;
    expect(event.kind === 'power' ? event.hits.length : 0).toBe(2);
  });

  it('no gasta la carga en algo que vale poco', () => {
    // Con Roca: su reparacion no gasta la barra entera, asi que puede esperar a que valga la pena.
    const s = blankState(settingsWith(defaultContent(), { weather: false }));
    appointGeneral(s, 1, 'Roca');
    teamState(s, 1).general!.charge = generalDef(s, 'Roca')!.powers[0]!.cost;
    newUnit(s, unitType('Tank'), 1, { x: 3, y: 3 }).life = 98; // 2 de vida de un tanque: poco valor
    expect(choosePower(s, 1, AI)).toBeNull();
  });

  it('con la barra llena usa lo que valga algo (reconocimiento con niebla)', () => {
    const s = aiBrisa(6, true);
    const choice = choosePower(s, 1, AI)!;
    expect(choice.power).toBe('recon');
    expect(choice.value).toBe(AI.revealValue);
  });

  it('el reconocimiento no vale nada si ya lo ve todo: sin niebla o con uno de la alianza puesto', () => {
    const recon = generalDef(aiBrisa(6), 'Brisa')!.powers.find((power) => power.effect.kind === 'reveal')!;
    expect(powerValue(aiBrisa(6, false), 1, recon, AI)).toBeNull();
    const fogged = aiBrisa(6, true);
    expect(powerValue(fogged, 1, recon, AI)).toEqual({ target: null, value: AI.revealValue });
    teamState(fogged, 1).general!.reveal = true;
    expect(powerValue(fogged, 1, recon, AI)).toBeNull();

    const withAlly = blankState(settingsWith(defaultContent(), { fog: true, weather: false }), [
      { controller: 'human', alliance: 0 },
      { controller: 'ai', alliance: 1 },
      { controller: 'ai', alliance: 1 },
    ]);
    appointGeneral(withAlly, 1, 'Brisa');
    appointGeneral(withAlly, 2, 'Brisa');
    expect(powerValue(withAlly, 1, recon, AI)).not.toBeNull();
    teamState(withAlly, 2).general!.reveal = true;
    expect(powerValue(withAlly, 1, recon, AI)).toBeNull();
  });

  it('no bombardea a ciegas: solo enemigos que ve', () => {
    const s = aiBrisa(5, true);
    newUnit(s, unitType('Tank'), 0, { x: 25, y: 25 }); // lejos, en la niebla
    newUnit(s, unitType('Tank'), 0, { x: 26, y: 25 });
    expect(bestAreaTarget(s, 1, { kind: 'areaDamage', radius: 1, damage: 30, minLife: 10 })).toBeNull();
  });

  it('sin general, o ya usada este turno, no hace nada', () => {
    const s = aiBrisa(6);
    newUnit(s, unitType('Tank'), 0, { x: 11, y: 11 });
    teamState(s, 1).general!.used = true;
    expect(playPlan(giveTurn(s, 1), 1, aiGeneral(s, playCtx(1, defaultAiProfile(defaultContent()))))).toEqual([]);
    teamState(s, 1).general = null;
    expect(playPlan(giveTurn(s, 1), 1, aiGeneral(s, playCtx(1, defaultAiProfile(defaultContent()))))).toEqual([]);
  });
});
