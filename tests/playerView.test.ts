import { describe, expect, it } from 'vitest';
import { aiTurn, defaultAiProfile } from '@core/ai';
import { dispatch, TURN_END_PHASES } from '@core/actions';
import { previewStandingOrders } from '@core/autopilot';
import { playerView, seeing, unitsKnownTo } from '@core/playerView';
import { unitById } from '@core/rules';
import { newUnit } from '@core/measure';
import type { ActionPlan, Building, GameAction, GameState } from '@core/model';
import { turnSeedOf } from '@core/turnSeeds';
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
    expect(known.find((unit) => unit.uid === transport.uid)?.cargo).toEqual(transport.cargo.map(() => null));
    // Su propio equipo lo sabe todo de lo suyo.
    expect(unitsKnownTo(s, 1).find((unit) => unit.uid === seen.uid)?.standingOrder).toEqual({ kind: 'defend', at: { x: 3, y: 2 } });
  });

  it('las escuadras de los enemigos y las semillas no se ven; su azar del turno, si', () => {
    const { s, seen } = fogged();
    const other = newUnit(s, SOLDIER, 1, { x: 4, y: 2 });
    act(giveTurn(s, 1), 1, { kind: 'formSquad', uids: [seen.uid, other.uid] });
    s.dice = 12345;
    s.setup = { seed: 77, size: 32, theme: null };
    const view = playerView(s, 0);
    expect(view.state.squads).toEqual([]);
    expect(playerView(s, 1).state.squads).toHaveLength(1);
    expect([view.state.dice, view.state.decisionSeed, view.state.setup]).toEqual([0, 0, undefined]);
    expect(view.turnSeed).toBe(turnSeedOf(s, 0));
    expect(playerView(s, 1).turnSeed).not.toBe(view.turnSeed);
  });

  it('quien captura un edificio que no ve no se sabe; lo que se ve, si', () => {
    const { s } = fogged();
    const far: Building = { type: 'City', owner: null, x: 25, y: 25, capture: { team: 1, uid: 3, left: 10 } };
    const near: Building = { type: 'City', owner: 0, x: 2, y: 3, capture: { team: 1, uid: 2, left: 10 } };
    s.buildings.push(far, near);
    const shown = playerView(s, 0).state.buildings;
    expect(shown.find((building) => building.x === 25)?.capture).toBeNull();
    expect(shown.find((building) => building.x === 2 && building.y === 3)?.capture).toEqual(near.capture);
    expect(far.capture).not.toBeNull();
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

  it('no se puede cambiar, ni nada de lo que se lee de ella: quien decide propone acciones', () => {
    const { s, mine, seen } = fogged();
    const view = playerView(s, 0);
    const funds = s.teams[0]!.funds;
    expect(() => Object.assign(view.state, { day: 5 })).toThrow(/no se cambia/);
    expect(() => Object.assign(view.state.teams[0]!, { funds: 99999 })).toThrow(/no se cambia/);
    expect(() => Object.assign(unitById(view.state, mine.uid)!, { life: 1 })).toThrow(/no se cambia/);
    expect(() => Object.assign(unitById(view.state, seen.uid)!, { x: 9 })).toThrow(/no se cambia/);
    expect(() => view.state.units.push(mine)).toThrow();
    expect(() => Object.assign(view.state.map[0]!, { 0: 'Water' })).toThrow();
    expect(() => Object.assign(view.state.buildings[0]!, { owner: 1 })).toThrow(/no se cambia/);
    expect([s.day, s.teams[0]!.funds, mine.life, s.units.length]).toEqual([1, funds, 100, 3]);
    // Lo mismo se ve igual: dos lecturas de una unidad son la misma.
    expect(unitById(view.state, mine.uid)).toBe(unitById(view.state, mine.uid));
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

describe('las ordenes que cumple la partida deciden con lo que sabe el equipo', () => {
  /** Un pasillo entre agua, un soldado propio con orden de defender al fondo y, si se pide, un enemigo escondido en el camino. */
  function corridor(withHidden: boolean) {
    const s = giveTurn(blankState({ fog: true, forestHides: true, terrainCost: false }), 0);
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    s.map[15]![5] = 'Woods';
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    if (withHidden) newUnit(s, SOLDIER, 1, { x: 15, y: 5 });
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 25, y: 5 } } });
    return { s, soldier };
  }
  const standingOrderPhase = TURN_END_PHASES.find((phase) => phase.id === 'standingOrders')!;
  const runPhase = (s: GameState) => standingOrderPhase.run(s, 0, (state, team, action) => dispatch(state, team, action));

  it('un enemigo escondido que corta el unico camino no cambia lo que hacen', () => {
    const without = corridor(false);
    const withHidden = corridor(true);
    expect(playerView(withHidden.s, 0).state.units).toHaveLength(1);
    expect(runPhase(withHidden.s)).toEqual(runPhase(without.s));
    expect(withHidden.soldier.x).toBeGreaterThan(2);
  });

  it('la prevision es lo que despues hacen', () => {
    const { s, soldier } = corridor(true);
    const preview = previewStandingOrders(s, 0, dispatch).get(soldier.uid);
    const moved = runPhase(s).find((event) => event.kind === 'move');
    expect(moved?.kind === 'move' ? moved.path : null).toEqual(preview?.path);
  });
});
