import { describe, expect, it } from 'vitest';
import { defaultAiProfile } from '@core/ai';
import { planChanges } from '@core/ai/plans';
import { playCtx } from '@core/autopilot/context';
import { newUnit } from '@core/measure';
import { blankHeadquarters, blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');

/** Una partida sin niebla con dos ciudades libres: una cerca de (2, 2) y otra lejos. */
function twoCities() {
  const s = blankState({ fog: false, weather: false });
  s.buildings.push({ type: 'City', owner: null, x: 4, y: 2, capture: null }, { type: 'City', owner: null, x: 20, y: 20, capture: null });
  return s;
}

const planOf = (s: ReturnType<typeof blankState>) => planChanges(s, playCtx(PLAYER, defaultAiProfile(s.content), { paths: 'army' }));

describe('planes que duran (docs/PLAN-IA.md, fase 2)', () => {
  it('una que captura sin plan va al edificio libre que menos le cuesta', () => {
    const s = twoCities();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    expect(planOf(s).get(soldier.uid)).toEqual({ kind: 'capture', at: { x: 4, y: 2 } });
  });

  it('un plan que sigue valiendo se queda, aunque haya algo mas cerca', () => {
    const s = twoCities();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    soldier.standingOrder = { kind: 'capture', at: { x: 20, y: 20 } };
    expect(planOf(s).has(soldier.uid)).toBe(false);
  });

  it('un plan que ya no vale (el edificio ya es suyo) cambia', () => {
    const s = twoCities();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    soldier.standingOrder = { kind: 'capture', at: { x: 20, y: 20 } };
    s.buildings.find((building) => building.x === 20)!.owner = PLAYER;
    // El rival tiene tantos edificios: sin esto, con el doble, se lanzaria a por su Base (rematar).
    s.buildings.push({ type: 'City', owner: ENEMY, x: 28, y: 5, capture: null });
    expect(planOf(s).get(soldier.uid)).toEqual({ kind: 'capture', at: { x: 4, y: 2 } });
  });

  it('con enemigos junto a su Base, la que lucha mas cerca va a defenderla', () => {
    const s = twoCities();
    const hq = blankHeadquarters(PLAYER);
    newUnit(s, TANK, ENEMY, { x: hq.x, y: hq.y - 3 });
    const near = newUnit(s, TANK, PLAYER, { x: hq.x - 4, y: hq.y - 6 });
    const far = newUnit(s, TANK, PLAYER, { x: 2, y: 2 });
    const plan = planOf(s);
    expect(plan.get(near.uid)).toEqual({ kind: 'defend', at: hq });
    expect(plan.get(far.uid)?.kind).not.toBe('defend');
  });

  it('con el doble de edificios que el rival y sin ver a su ejercito, todas a su Base (rematar)', () => {
    const s = twoCities();
    s.buildings.find((building) => building.x === 4)!.owner = PLAYER;
    const tank = newUnit(s, TANK, PLAYER, { x: 2, y: 2 });
    expect(planOf(s).get(tank.uid)).toEqual({ kind: 'attack', at: blankHeadquarters(ENEMY) });
  });
});
