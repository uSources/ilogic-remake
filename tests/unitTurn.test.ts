import { describe, expect, it } from 'vitest';
import { canStillAct, canStillFire, canStillMove, isUnitTurnState, newUnit } from '@core/rules';
import { markMoved, readyUnit, spendUnit } from '@core/rules/unitTurn';
import { act, blankState, unitTypeNamed } from './helpers';

describe('el turno de cada unidad', () => {
  it('sin usar puede moverse, disparar y actuar; gastada, nada', () => {
    const s = blankState();
    const tank = newUnit(s, unitTypeNamed('Tank'), 0, { x: 5, y: 5 });
    expect([canStillMove(tank), canStillFire(s, tank), canStillAct(tank)]).toEqual([true, true, true]);
    spendUnit(tank);
    expect([canStillMove(tank), canStillFire(s, tank), canStillAct(tank)]).toEqual([false, false, false]);
    readyUnit(tank);
    expect(tank.turnState).toBe('ready');
  });

  it('movida: actua y dispara, salvo las de distancia, que no pueden mover y disparar', () => {
    const s = blankState();
    const tank = newUnit(s, unitTypeNamed('Tank'), 0, { x: 5, y: 5 });
    const artillery = newUnit(s, unitTypeNamed('Artillery'), 0, { x: 9, y: 9 });
    markMoved(tank);
    act(s, 0, { kind: 'move', uid: artillery.uid, to: { x: 9, y: 10 } });
    expect(artillery.turnState).toBe('moved');
    expect([canStillAct(tank), canStillFire(s, tank), canStillMove(tank)]).toEqual([true, true, false]);
    expect([canStillAct(artillery), canStillFire(s, artillery)]).toEqual([true, false]);
  });

  it('las compradas nacen gastadas', () => {
    const s = blankState();
    expect(newUnit(s, unitTypeNamed('Soldier'), 0, { x: 1, y: 1 }, 'done').turnState).toBe('done');
    expect(isUnitTurnState('moved')).toBe(true);
    expect(isUnitTurnState('active')).toBe(false);
  });
});
