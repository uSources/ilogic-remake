import { describe, expect, it } from 'vitest';
import { defaultAiProfile } from '@core/ai';
import { planFire } from '@core/ai/fire';
import { playCtx } from '@core/autopilot/context';
import { defaultContent } from '@core/content/default';
import { newUnit } from '@core/measure';
import { engagement, expectedDamage } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');
const FLANK = 0.15;

/**
 * Fuego concentrado (ai/fire.ts) con un enemigo al que otro ya le ha dado hoy (un aliado, un tercer
 * equipo o una unidad propia de antes): el flanqueo ya va en el daño esperado de todos los que le
 * disparan. Antes la IA lo volvia a multiplicar a mano (daño x (1 + flanqueo)) para los que van
 * despues del primero, asi que veia rematable a quien no lo era (ronda 1 de la revision: partida 23
 * de la sonda, 4 equipos con flanqueo, cambia en a85574c).
 */
describe('fuego concentrado: el flanqueo, una sola vez', () => {
  function setUp() {
    const s = blankState({ fog: false, flankBonus: FLANK, veterancy: false, weather: false, abilities: false });
    const foe = newUnit(s, SOLDIER, 1, { x: 10, y: 10 });
    const shooters = [newUnit(s, SOLDIER, 0, { x: 9, y: 10 }), newUnit(s, SOLDIER, 0, { x: 11, y: 10 })];
    foe.hitDay = s.day;
    const [first, second] = shooters.map((shooter) => expectedDamage(s, engagement(shooter, foe)));
    return { s, foe, shooters, first: first!, second: second! };
  }

  it('si entre los dos no lo destruyen de verdad, no se planea, aunque la cuenta de antes dijera que si', () => {
    const { s, foe, first, second } = setUp();
    const real = first + second;
    const doubleCounted = first + second * (1 + FLANK);
    foe.life = Math.floor((real + doubleCounted) / 2);
    expect(foe.life).toBeGreaterThan(real);
    expect(foe.life).toBeLessThanOrEqual(doubleCounted);
    expect(planFire(s, playCtx(0, defaultAiProfile(defaultContent()))).plan.size).toBe(0);
  });

  it('si entre los dos si lo destruyen, se planea con los dos', () => {
    const { s, foe, shooters, first, second } = setUp();
    foe.life = Math.floor(first + second);
    expect(foe.life).toBeGreaterThan(Math.max(first, second));
    const { plan } = planFire(s, playCtx(0, defaultAiProfile(defaultContent())));
    expect([...plan.keys()].sort()).toEqual(shooters.map((shooter) => shooter.uid).sort());
    expect(new Set(plan.values())).toEqual(new Set([foe.uid]));
  });
});
