import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { GameSession, humanController, passiveController } from '@core/session';
import type { IntentLook, IntentMarks } from '../src/view3d/ports/orders';
import { anyStandingOrder, intentsToShow, OrderIntents } from '../src/view3d/systems/orders/orderIntents';
import { act, blankState, PLAYER, unitTypeNamed } from './helpers';

/** Las flechas de lo que haran las ordenes, sin navegador: cuales se enseñan y cuando. */

class FakeIntents implements IntentMarks {
  shown: readonly IntentLook[] = [];
  show(intents: readonly IntentLook[]): void {
    this.shown = intents;
  }
}

/** Mi turno, con un soldado que tiene orden de defender lejos y otro sin orden. */
async function withOrder() {
  const s = blankState({ fog: false });
  const ordered = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 5, y: 5 });
  const idle = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 5, y: 9 });
  act(s, PLAYER, { kind: 'giveStandingOrder', uids: [ordered.uid], order: { kind: 'defend', at: { x: 12, y: 5 } } });
  const session = new GameSession(s, [humanController(), passiveController()]);
  session.step();
  const marks = new FakeIntents();
  return { s, ordered, idle, marks, intents: new OrderIntents({ session, viewer: PLAYER, marks }) };
}

describe('lo que haran las ordenes', () => {
  it('cuales enseñar: todas, o solo la de la señalada', () => {
    const intents = new Map([
      [1, { path: [] }],
      [2, { path: [] }],
    ]);
    expect(intentsToShow(intents, true, null)).toHaveLength(2);
    expect(intentsToShow(intents, false, 2)).toEqual([{ path: [] }]);
    expect(intentsToShow(intents, false, null)).toEqual([]);
  });

  it('al señalar una unidad con orden, su camino hacia alli', async () => {
    const { ordered, marks, intents } = await withOrder();
    intents.hover(ordered);
    expect(marks.shown).toHaveLength(1);
    expect(marks.shown[0]!.path[0]).toEqual({ x: 5, y: 5 });
    expect(marks.shown[0]!.path.at(-1)!.x).toBeGreaterThan(5);
  });

  it('una sin orden, o una casilla vacia, no enseñan nada', async () => {
    const { idle, marks, intents } = await withOrder();
    intents.hover(idle);
    expect(marks.shown).toEqual([]);
    intents.hover({ x: 20, y: 20 });
    expect(marks.shown).toEqual([]);
  });

  it('«Ver órdenes» las enseña todas; otra vez, las quita', async () => {
    const { marks, intents } = await withOrder();
    intents.toggleAll();
    expect(intents.isShowingAll).toBe(true);
    expect(marks.shown).toHaveLength(1);
    intents.toggleAll();
    expect(marks.shown).toEqual([]);
  });

  it('la bandeja sabe si hay alguna orden', async () => {
    const { s } = await withOrder();
    expect(anyStandingOrder(s, PLAYER)).toBe(true);
    expect(anyStandingOrder(blankState(), PLAYER)).toBe(false);
  });
});
