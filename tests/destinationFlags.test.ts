import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { GameAction, Pos, StandingOrderKind } from '@core/model';
import { unitIconKey } from '../src/ui/sprites';
import { destinationFlagsOf, MAX_EMBLEMS } from '../src/view3d/systems/orders/destinationFlags';
import { act, blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** Las banderas de destino, sin navegador: donde salen y quien va en cada una. */

const FAR: Pos = { x: 2, y: 25 };
const order = (uids: number[], kind: StandingOrderKind, at: Pos): GameAction => ({ kind: 'giveStandingOrder', uids, order: { kind, at } });
/** El parche de una unidad que va por su cuenta: la imagen de su tipo. */
const unitEmblem = (type: string) => ({ kind: 'unit', image: unitIconKey(unitTypeNamed(type), true) });

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
      expect(destinationFlagsOf(s, PLAYER), kind).toEqual([{ at: FAR, emblems: [unitEmblem('Soldier')] }]);
    }
  });

  it('las del rival no salen', () => {
    const { s, theirs } = soldiers();
    theirs.standingOrder = { kind: 'goto', at: FAR };
    expect(destinationFlagsOf(s, PLAYER)).toEqual([]);
  });

  it('la que ya esta en su casilla no lleva bandera', () => {
    const { s, mine } = soldiers();
    act(s, PLAYER, order([mine.uid], 'defend', { x: 2, y: 2 }));
    expect(destinationFlagsOf(s, PLAYER)).toEqual([]);
  });

  it('varias del mismo tipo al mismo sitio: una bandera con su imagen una vez', () => {
    const { s, mine } = soldiers();
    const other = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 3, y: 2 });
    act(s, PLAYER, order([mine.uid, other.uid], 'defend', FAR));
    expect(destinationFlagsOf(s, PLAYER)).toEqual([{ at: FAR, emblems: [unitEmblem('Soldier')] }]);
  });

  it('de tipos distintos al mismo sitio: una imagen de cada tipo', () => {
    const { s, mine } = soldiers();
    const tank = newUnit(s, unitTypeNamed('Tank'), PLAYER, { x: 3, y: 2 });
    act(s, PLAYER, order([mine.uid, tank.uid], 'defend', FAR));
    expect(destinationFlagsOf(s, PLAYER)).toEqual([{ at: FAR, emblems: [unitEmblem('Soldier'), unitEmblem('Tank')] }]);
  });

  it('si no caben todos: los primeros y, en el ultimo hueco, cuantos mas van', () => {
    const { s, mine } = soldiers();
    const types = ['Tank', 'Artillery', 'Car', 'Antiair'];
    const others = types.map((type, index) => newUnit(s, unitTypeNamed(type), PLAYER, { x: 3 + index, y: 2 }));
    act(s, PLAYER, order([mine.uid, ...others.map((unit) => unit.uid)], 'defend', FAR));
    const shown = ['Soldier', ...types].slice(0, MAX_EMBLEMS - 1).map(unitEmblem);
    const more = { kind: 'more', count: types.length + 1 - shown.length };
    expect(destinationFlagsOf(s, PLAYER)).toEqual([{ at: FAR, emblems: [...shown, more] }]);
  });

  it('dos escuadras sin tecla con la misma inicial: dos dibujos, aunque se vean igual', () => {
    const { s, mine } = soldiers();
    const other = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 3, y: 2 });
    act(s, PLAYER, { kind: 'formSquad', uids: [mine.uid], name: 'Alfa' });
    act(s, PLAYER, { kind: 'formSquad', uids: [other.uid], name: 'Atlas' });
    for (const squad of s.squads ?? []) squad.key = undefined;
    act(s, PLAYER, order([mine.uid], 'attack', FAR));
    act(s, PLAYER, order([other.uid], 'attack', FAR));
    const initial = { kind: 'squad', label: 'A' };
    expect(destinationFlagsOf(s, PLAYER)).toEqual([{ at: FAR, emblems: [initial, initial] }]);
  });

  it('una escuadra con orden: su tecla; la que va por su cuenta, su imagen', () => {
    const { s, mine } = soldiers();
    const tank = newUnit(s, unitTypeNamed('Tank'), PLAYER, { x: 3, y: 2 });
    act(s, PLAYER, { kind: 'formSquad', uids: [mine.uid, tank.uid], key: 2 });
    act(s, PLAYER, order([mine.uid, tank.uid], 'attack', FAR));
    expect(destinationFlagsOf(s, PLAYER)).toEqual([{ at: FAR, emblems: [{ kind: 'squad', label: '2' }] }]);
    const elsewhere: Pos = { x: 10, y: 10 };
    act(s, PLAYER, order([tank.uid], 'defend', elsewhere));
    expect(destinationFlagsOf(s, PLAYER)).toEqual([
      { at: FAR, emblems: [{ kind: 'squad', label: '2' }] },
      { at: elsewhere, emblems: [unitEmblem('Tank')] },
    ]);
  });
});
