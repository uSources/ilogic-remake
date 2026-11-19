import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { GameAction, Pos, StandingOrderKind } from '@core/model';
import { orderDestinations } from '../src/view3d/systems/orders/destinationFlags';
import { act, blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** Las banderas de destino, sin navegador: donde salen. */

const FAR: Pos = { x: 2, y: 25 };
const order = (uids: number[], kind: StandingOrderKind, at: Pos): GameAction => ({ kind: 'giveStandingOrder', uids, order: { kind, at } });

/** Un soldado de cada equipo. */
function soldiers() {
  const s = blankState({ fog: false });
  const mine = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 2, y: 2 });
  const theirs = newUnit(s, unitTypeNamed('Soldier'), ENEMY, { x: 2, y: 4 });
  return { s, mine, theirs };
}

describe('banderas de destino', () => {
  it('una en el destino de cada unidad propia con orden: de viaje o de pelear', () => {
    for (const kind of ['goto', 'defend', 'attack'] as const) {
      const { s, mine } = soldiers();
      act(s, PLAYER, order([mine.uid], kind, FAR));
      expect(orderDestinations(s, PLAYER), kind).toEqual([FAR]);
    }
  });

  it('las del rival no salen', () => {
    const { s, theirs } = soldiers();
    theirs.standingOrder = { kind: 'goto', at: FAR };
    expect(orderDestinations(s, PLAYER)).toEqual([]);
  });

  it('la que ya esta en su casilla no lleva bandera', () => {
    const { s, mine } = soldiers();
    act(s, PLAYER, order([mine.uid], 'defend', { x: 2, y: 2 }));
    expect(orderDestinations(s, PLAYER)).toEqual([]);
  });

  it('varias al mismo sitio: una sola bandera', () => {
    const { s, mine } = soldiers();
    const other = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 3, y: 2 });
    act(s, PLAYER, order([mine.uid, other.uid], 'defend', FAR));
    expect(orderDestinations(s, PLAYER)).toEqual([FAR]);
  });
});
