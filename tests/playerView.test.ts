import { describe, expect, it } from 'vitest';
import { aiTurn, defaultAiProfile } from '@core/ai';
import { dispatch } from '@core/actions';
import { playerView, seeing, unitsKnownTo } from '@core/playerView';
import { newUnit, unitById } from '@core/rules';
import type { ActionPlan, GameAction, GameState } from '@core/model';
import { act, blankState, giveTurn, unitTypeNamed } from './helpers';
import { seededRng } from '@core/util/random';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');
const TRANSPORT = unitTypeNamed('Transport');

/** Con niebla: un soldado propio (equipo 0), un enemigo a la vista y otro lejos, escondido. */
function fogged() {
  const s = blankState({ fog: true });
  const mine = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
  const seen = newUnit(s, SOLDIER, 1, { x: 3, y: 2 });
  const hidden = newUnit(s, TANK, 1, { x: 25, y: 25 });
  return { s, mine, seen, hidden };
}

/** Las acciones que propone un plan si todas salen bien (sin cambiar la partida). */
function proposals(plan: ActionPlan, limit = 200): GameAction[] {
  const proposed: GameAction[] = [];
  for (let step = plan.next(); !step.done && proposed.length < limit; step = plan.next({ ok: true, events: [] })) proposed.push(step.value);
  return proposed;
}

describe('PlayerView: lo que sabe un equipo', () => {
  it('no estan los enemigos que no ve; los suyos y los que ve, si', () => {
    const { s, mine, seen, hidden } = fogged();
    const view = playerView(s, 0);
    expect(view.state.units.map((unit) => unit.uid)).toEqual([mine.uid, seen.uid]);
    expect(unitById(view.state, hidden.uid)).toBeUndefined();
    // La partida de verdad no cambia.
    expect(s.units).toHaveLength(3);
  });

  it('de los enemigos que ve, ni sus ordenes ni su escuadra; tampoco lo que llevan dentro', () => {
    const { s, seen } = fogged();
    act(giveTurn(s, 1), 1, { kind: 'giveStandingOrder', uids: [seen.uid], order: { kind: 'defend', at: { x: 3, y: 2 } } });
    const transport = newUnit(s, TRANSPORT, 1, { x: 2, y: 3 });
    const passenger = newUnit(s, SOLDIER, 1, { x: 2, y: 4 });
    act(s, 1, { kind: 'load', uid: passenger.uid, into: transport.uid });
    const known = unitsKnownTo(s, 0);
    expect(known.find((unit) => unit.uid === seen.uid)?.standingOrder).toBeUndefined();
    expect(known.some((unit) => unit.uid === passenger.uid)).toBe(false);
    expect(known.some((unit) => unit.uid === transport.uid)).toBe(true);
    // Su propio equipo lo sabe todo de lo suyo.
    expect(unitsKnownTo(s, 1).find((unit) => unit.uid === seen.uid)?.standingOrder).toEqual({ kind: 'defend', at: { x: 3, y: 2 } });
  });

  it('las escuadras de los enemigos y los dados no se ven', () => {
    const { s, seen } = fogged();
    const other = newUnit(s, SOLDIER, 1, { x: 4, y: 2 });
    act(giveTurn(s, 1), 1, { kind: 'formSquad', uids: [seen.uid, other.uid] });
    s.dice = 12345;
    expect(playerView(s, 0).state.squads).toEqual([]);
    expect(playerView(s, 1).state.squads).toHaveLength(1);
    expect(playerView(s, 0).state.dice).not.toBe(12345);
  });

  it('sin niebla lo ve todo (menos lo que es solo de su dueño)', () => {
    const s = blankState({ fog: false });
    newUnit(s, TANK, 1, { x: 25, y: 25 });
    expect(playerView(s, 0).state.units).toHaveLength(1);
  });

  it('las caidas son publicas: un enemigo sin unidades a la vista no ha caido por eso', () => {
    const { s } = fogged();
    const view = playerView(s, 0);
    expect(view.state.teams[1]!.fell).toBeNull();
    act(giveTurn(s, 1), 1, { kind: 'surrender' });
    view.refresh();
    expect(view.state.teams[1]!.fell).toEqual(s.teams[1]!.fell);
  });

  it('no se puede cambiar: quien decide propone acciones', () => {
    const { s } = fogged();
    const view = playerView(s, 0);
    expect(() => Object.assign(view.state, { day: 5 })).toThrow(/no se cambia/);
    expect(s.day).toBe(1);
  });

  it('es el mismo objeto todo el turno y se pone al dia tras cada accion (seeing)', () => {
    const { s, mine } = fogged();
    giveTurn(s, 0);
    const view = playerView(s, 0);
    const state = view.state;
    function* plan(): ActionPlan<number[]> {
      yield { kind: 'move', uid: mine.uid, to: { x: 2, y: 5 } };
      return state.units.map((unit) => unit.uid);
    }
    const steps = seeing(view, plan());
    const first = steps.next();
    expect(first.done).toBe(false);
    if (first.done) return;
    const last = steps.next(dispatch(s, 0, first.value));
    expect(view.state).toBe(state);
    expect(unitById(state, mine.uid)).toMatchObject({ x: 2, y: 5 });
    expect(last).toEqual({ done: true, value: unitsKnownTo(s, 0).map((unit) => unit.uid) });
  });

  it('la IA decide igual haya o no enemigos que no ve (I2: ya no los esquiva)', () => {
    const make = (withHidden: boolean): GameState => {
      const s = giveTurn(blankState({ fog: true }), 1);
      newUnit(s, TANK, 1, { x: 10, y: 10 });
      newUnit(s, SOLDIER, 1, { x: 11, y: 10 });
      newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
      if (withHidden) newUnit(s, TANK, 0, { x: 10, y: 17 });
      return s;
    };
    expect(playerView(make(true), 1).state.units).toHaveLength(2);
    const decide = (s: GameState) => {
      const view = playerView(s, 1);
      return proposals(aiTurn(view, defaultAiProfile(s.content), seededRng(4)));
    };
    const without = decide(make(false));
    expect(without.length).toBeGreaterThan(0);
    expect(decide(make(true))).toEqual(without);
  });
});
