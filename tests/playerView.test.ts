import { describe, expect, it } from 'vitest';
import { aiTurn, defaultAiProfile } from '@core/ai';
import { carryOut, dispatch, TURN_END_PHASES } from '@core/actions';
import { previewStandingOrders, startStandingOrder } from '@core/autopilot';
import { decidingAs, foggedCopy, knownFoes, playerView, seeing, sightIn } from '@core/playerView';
import { sightOf, unitById, visibleFoes } from '@core/rules';
import { newUnit } from '@core/measure';
import type { ActionPlan, Building, GameAction, GameState } from '@core/model';
import { turnSeedOf } from '@core/turnSeeds';
import { act, blankHeadquarters, blankState, giveTurn, unitTypeNamed } from './helpers';
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
    const known = foggedCopy(s, 0).units;
    expect(known.find((unit) => unit.uid === seen.uid)?.standingOrder).toBeUndefined();
    expect(known.some((unit) => unit.uid === passenger.uid)).toBe(false);
    expect(known.find((unit) => unit.uid === transport.uid)?.cargo).toEqual(transport.cargo.map(() => null));
    // Su propio equipo lo sabe todo de lo suyo.
    expect(foggedCopy(s, 1).units.find((unit) => unit.uid === seen.uid)?.standingOrder).toEqual({ kind: 'defend', at: { x: 3, y: 2 } });
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

  it('por la puerta de atras tampoco: el descriptor de una propiedad da lo mismo que leerla', () => {
    const { s, mine, hidden } = fogged();
    s.setup = { seed: 1234, size: 32, theme: null };
    const view = playerView(s, 0);
    const descriptorOf = (holder: object, key: string): unknown => Object.getOwnPropertyDescriptor(holder, key)?.value;
    const units = descriptorOf(view.state, 'units') as GameState['units'];
    expect(units.map((unit) => unit.uid)).not.toContain(hidden.uid);
    expect([descriptorOf(view.state, 'dice'), descriptorOf(view.state, 'decisionSeed'), descriptorOf(view.state, 'setup')]).toEqual([
      0,
      0,
      undefined,
    ]);
    expect({ ...view.state }.setup).toBeUndefined();
    const transport = newUnit(s, TRANSPORT, 0, { x: 4, y: 4 });
    view.refresh();
    const cargo = descriptorOf(unitById(view.state, transport.uid)!, 'cargo') as (number | null)[];
    expect(() => cargo.push(mine.uid)).toThrow();
    expect(transport.cargo).not.toContain(mine.uid);
    expect(() => Object.setPrototypeOf(view.state, null)).toThrow(/no se cambia/);
    expect(() => Object.preventExtensions(view.state)).toThrow(/no se cambia/);
    expect(() => Object.freeze(unitById(view.state, mine.uid))).toThrow(/no se cambia/);
  });

  it('ni por el prototipo: __proto__ y constructor no llevan al Object.prototype de verdad', () => {
    const { s } = fogged();
    const view = playerView(s, 0).state;
    const unit = view.units[0]! as unknown as Record<string, unknown>;
    expect(unit.__proto__).toBeUndefined();
    expect(unit.constructor).toBeUndefined();
    expect((view as unknown as Record<string, unknown>).__proto__).toBeUndefined();
    expect((unit.cargo as unknown[]).map((passenger) => passenger)).toEqual([]);
  });

  it('las reglas de la partida tampoco se cambian desde la vista (ni desde la partida: estan congeladas)', () => {
    const { s } = fogged();
    const view = playerView(s, 0);
    const rules = view.state.ruleset;
    expect(() => (rules.modules as unknown[]).push(rules.modules[0])).toThrow();
    expect(() => (rules.hooks.hitModifiers as unknown[]).push(rules.hooks.hitModifiers[0])).toThrow();
    expect(() => Object.assign(rules.modules[0]!, { id: 'otro' })).toThrow();
    expect(Object.isFrozen(s.ruleset.modules[0]!.hooks)).toBe(true);
  });

  it('de los enemigos no se ven sus estadisticas ni cuantas unidades y escuadras llevan hechas', () => {
    const { s, mine, seen } = fogged();
    s.teams[1]!.stats = { built: 7, spent: 9000, lost: 2, captured: 3, army: [11000, 15000] };
    s.teams[0]!.stats = { built: 1, spent: 1500, lost: 0, captured: 1, army: [11000] };
    const view = playerView(s, 0).state;
    expect(view.teams[1]!.stats).toEqual({ built: 0, spent: 0, lost: 0, captured: 0, army: [] });
    expect(view.teams[0]!.stats).toEqual(s.teams[0]!.stats);
    expect(view.teams[1]!.funds).toBe(s.teams[1]!.funds);
    // El escondido tiene el uid mas alto: la vista da el siguiente a los que conoce, no el de verdad.
    expect(s.nextUid).toBeGreaterThan(seen.uid + 1);
    expect(view.nextUid).toBe(Math.max(mine.uid, seen.uid) + 1);
    s.squads = [{ id: 4, team: 1, name: 'Ellos' }];
    s.nextSquadId = 5;
    expect(playerView(s, 0).state.nextSquadId).toBe(1);
    // La partida de verdad no cambia.
    expect(s.teams[1]!.stats.built).toBe(7);
  });

  it('lo que puede deshacer otro equipo no se ve', () => {
    const { s, mine } = fogged();
    s.undoableMoves = [{ uid: mine.uid, from: { x: 1, y: 2 }, capture: null, revealed: false }];
    expect(playerView(s, 0).state.undoableMoves).toHaveLength(1);
    expect(playerView(s, 1).state.undoableMoves).toEqual([]);
  });

  it('knownFoes y sightIn: en la vista, lo que ya ve (sin volver a calcularlo); en otra partida, lo que ve en ella', () => {
    const { s, seen, hidden } = fogged();
    const view = playerView(s, 0);
    expect(knownFoes(view.state, 0)).toEqual(visibleFoes(view.state, 0));
    expect(knownFoes(view.state, 0).map((unit) => unit.uid)).toEqual([seen.uid]);
    expect(sightIn(view.state, 0)(hidden)).toBe(false);
    expect(sightIn(view.state, 0)(seen)).toBe(true);
    // Fuera de una vista (o con la vista de otro equipo) se mira de nuevo: nunca da lo que no ve.
    expect(knownFoes(s, 0)).toEqual(visibleFoes(s, 0));
    expect(knownFoes(view.state, 1)).toEqual(visibleFoes(view.state, 1));
    expect(sightIn(s, 0)(hidden)).toBe(sightOf(s, 0)(hidden));
  });

  it('se pone al dia al mirarla despues de refresh, no antes', () => {
    const { s, mine, hidden } = fogged();
    const view = playerView(s, 0);
    expect(unitById(view.state, hidden.uid)).toBeUndefined();
    mine.x = 24;
    mine.y = 25;
    // Sin refresh sigue como estaba; despues, ve al que tiene al lado.
    expect(knownFoes(view.state, 0).map((unit) => unit.uid)).not.toContain(hidden.uid);
    view.refresh();
    expect(knownFoes(view.state, 0).map((unit) => unit.uid)).toContain(hidden.uid);
    expect(sightIn(view.state, 0)(hidden)).toBe(true);
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
    expect(last).toEqual({ done: true, value: foggedCopy(s, 0).units.map((unit) => unit.uid) });
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

describe('la vision de los edificios propios', () => {
  it('[CAMBIO] con niebla, un equipo con solo su Base ve un rombo de 3 a su alrededor', () => {
    const s = blankState({ fog: true });
    const hq = blankHeadquarters(0);
    const atThree = newUnit(s, TANK, 1, { x: hq.x - 3, y: hq.y });
    const atFour = newUnit(s, TANK, 1, { x: hq.x - 4, y: hq.y });
    const diagonal = newUnit(s, TANK, 1, { x: hq.x - 2, y: hq.y - 1 });
    const sees = sightOf(s, 0);
    expect(sees(atThree)).toBe(true);
    expect(sees(diagonal)).toBe(true);
    expect(sees(atFour)).toBe(false);
    expect(visibleFoes(s, 0)).toEqual([atThree, diagonal]);
  });

  it('un edificio sin dueño no da vision a nadie', () => {
    const s = blankState({ fog: true });
    const city: Building = { type: 'City', owner: null, x: 10, y: 10, capture: null };
    s.buildings.push(city);
    const foe = newUnit(s, TANK, 1, { x: 11, y: 10 });
    expect(sightOf(s, 0)(foe)).toBe(false);
    city.owner = 0;
    expect(sightOf(s, 0)(foe)).toBe(true);
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

  it('la escena empieza una orden recien dada con lo que sabe el equipo (decidingAs), como al cumplirse sola', () => {
    // Lo que hace scenes/game/orders.ts al dar una orden a una unidad que aun puede moverse.
    const startNow = (s: GameState, uid: number) =>
      carryOut(
        decidingAs(s, 0, (known) => startStandingOrder(known, uid, 0)),
        (action) => dispatch(s, 0, action),
      ).events;
    const without = corridor(false);
    const withHidden = corridor(true);
    expect(startNow(withHidden.s, withHidden.soldier.uid)).toEqual(startNow(without.s, without.soldier.uid));
    // Con la partida de verdad (sin su vista), el escondido le cortaria el camino y no avanzaria igual.
    const cheating = corridor(true);
    const decidedOnTruth = carryOut(startStandingOrder(cheating.s, cheating.soldier.uid, 0), (action) => dispatch(cheating.s, 0, action));
    expect(decidedOnTruth.events).not.toEqual(startNow(corridor(false).s, corridor(false).soldier.uid));
  });

  it('la copia de la prevision lleva toda la niebla del equipo y no toca la partida (foggedCopy)', () => {
    const { s } = corridor(true);
    const copy = foggedCopy(s, 0);
    const view = playerView(s, 0).state;
    expect(copy).not.toBe(s);
    expect(copy.units.map((unit) => unit.uid)).toEqual(view.units.map((unit) => unit.uid));
    expect([copy.dice, copy.decisionSeed, copy.setup]).toEqual([view.dice, view.decisionSeed, view.setup]);
    copy.units[0]!.x = 0;
    expect(s.units[0]!.x).not.toBe(0);
  });

  it('con un enemigo escondido la prevision es la misma que sin el', () => {
    const without = corridor(false);
    const withHidden = corridor(true);
    expect(previewStandingOrders(withHidden.s, 0, dispatch)).toEqual(previewStandingOrders(without.s, 0, dispatch));
  });

  it('la prevision es lo que despues hacen', () => {
    const { s, soldier } = corridor(true);
    const preview = previewStandingOrders(s, 0, dispatch).get(soldier.uid);
    const moved = runPhase(s).find((event) => event.kind === 'move');
    expect(moved?.kind === 'move' ? moved.path : null).toEqual(preview?.path);
  });
});
