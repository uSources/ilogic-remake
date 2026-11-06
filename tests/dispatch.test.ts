import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  ACTION_GUARDS,
  availableActions,
  canDoWithSelection,
  groupMoveOrder,
  groupMoveStep,
  isGameAction,
  isValidAction,
  ORDER_OPTIONS,
} from '@core/actions';
import { canCaptureAt, endRound, INVARIANTS, newUnit, roundReport, targetProblem, unitById } from '@core/rules';
import { appointGeneral } from '@core/generals';
import { teamState } from '@core/teams';
import { manhattan } from '@core/geom';
import { serialize } from '@core/save';
import { loadGame } from '@core/defaultGames';
import { formSquad } from '@core/squads/membership';
import type { GameAction, GameActionKind } from '@core/model';
import { act, BLANK_SIZE, blankState, expectRejected, giveTurn, unitTypeNamed, placedBuildings, someUnits } from './helpers';
import { PLAIN_RULES } from './plainRules';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');
const TRANSPORT = unitTypeNamed('Transport');
const SUPPLIER = unitTypeNamed('Supplier');

describe('dispatch: la unica via para cambiar la partida', () => {
  it('el registro tiene una entrada por accion y las invariantes no se repiten', () => {
    for (const definition of Object.values(ACTIONS)) {
      expect(typeof definition.validate).toBe('function');
      expect(typeof definition.apply).toBe('function');
    }
    const ids = INVARIANTS.map((invariant) => invariant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('una unidad que no existe, de otro equipo, dentro de un transporte o ya gastada no actua', () => {
    const s = blankState(PLAIN_RULES);
    const mine = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const theirs = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    const transport = newUnit(s, TRANSPORT, 0, { x: 6, y: 5 });
    expectRejected(s, 0, { kind: 'wait', uid: 999 }, 'missing');
    expectRejected(s, 0, { kind: 'wait', uid: theirs.uid }, 'notYours');
    act(s, 0, { kind: 'load', uid: mine.uid, into: transport.uid });
    expectRejected(s, 0, { kind: 'move', uid: mine.uid, to: { x: 5, y: 7 } }, 'transported');
    act(s, 0, { kind: 'wait', uid: transport.uid });
    expectRejected(s, 0, { kind: 'wait', uid: transport.uid }, 'spent');
  });

  it('mover comprueba el alcance de la partida: lo que traiga la accion no cuenta', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    expectRejected(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 15 } }, 'unreachable');
    // Un camino trazado que no vale se cambia por el mas corto.
    const drawn = [
      { x: 5, y: 5 },
      { x: 9, y: 9 },
      { x: 5, y: 7 },
    ];
    const [moved] = act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 }, path: drawn });
    expect(moved?.kind === 'move' && moved.path).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
    ]);
  });

  it('atacar: tiene que ser un enemigo vivo a tiro', () => {
    const s = blankState(PLAIN_RULES);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const friend = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    const far = newUnit(s, SOLDIER, 1, { x: 15, y: 15 });
    expectRejected(s, 0, { kind: 'attack', uid: tank.uid, target: friend.uid }, 'notTarget');
    expectRejected(s, 0, { kind: 'attack', uid: tank.uid, target: far.uid }, 'notTarget');
    expectRejected(s, 0, { kind: 'attack', uid: tank.uid, target: 999 }, 'missing');
  });

  it('atacar: solo a lo que se ve y a lo que se le hace daño', () => {
    const s = blankState({ ...PLAIN_RULES, fog: true, forestHides: true });
    // El tanque llega a 2 casillas, pero el bosque solo se ve desde al lado.
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const hidden = newUnit(s, SOLDIER, 1, { x: 7, y: 5 });
    s.map[7]![5] = 'Woods';
    expectRejected(s, 0, { kind: 'attack', uid: tank.uid, target: hidden.uid }, 'notTarget');
    const fighter = newUnit(s, unitTypeNamed('Fighter'), 0, { x: 12, y: 12 });
    const soldier = newUnit(s, SOLDIER, 1, { x: 12, y: 13 });
    expectRejected(s, 0, { kind: 'attack', uid: fighter.uid, target: soldier.uid }, 'notTarget');
  });

  it('lo que pasaria en otra casilla tambien lo dice el nucleo: objetivo y captura', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 9, y: 9, capture: null }, { type: 'City', owner: 0, x: 9, y: 8, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 1, y: 1 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 12, y: 12 });
    const fighter = newUnit(s, unitTypeNamed('Fighter'), 0, { x: 2, y: 2 });
    const seesAll = () => true;
    expect(targetProblem(s, soldier, enemy, seesAll)).toBeNull();
    expect(targetProblem(s, soldier, enemy, () => false)).toBe('notTarget');
    expect(targetProblem(s, fighter, enemy, seesAll)).toBe('notTarget');
    expect(targetProblem(s, soldier, tank, seesAll)).toBe('notTarget');
    expect(canCaptureAt(s, soldier, { x: 9, y: 9 })).toBe(true);
    expect(canCaptureAt(s, soldier, { x: 9, y: 8 })).toBe(false);
    expect(canCaptureAt(s, tank, { x: 9, y: 9 })).toBe(false);
  });

  it('un viaje avanza con travelStep: se acerca y acaba si ya llega este turno', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    expectRejected(s, 0, { kind: 'travelStep', uid: soldier.uid }, 'noTravel');
    act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 2, y: 20 } });
    const [step] = act(s, 0, { kind: 'travelStep', uid: soldier.uid });
    expect(step?.kind).toBe('move');
    expect(soldier.y).toBeGreaterThan(2);
    expect(soldier.travelTo).toEqual({ x: 2, y: 20 });
    // Ya movida: este turno no puede dar otro paso.
    expectRejected(s, 0, { kind: 'travelStep', uid: soldier.uid }, 'unreachable');
    // Si ya llega este turno, el viaje acaba sin moverla: el ultimo trozo lo hace quien juega.
    endRound(s);
    soldier.y = 19;
    expect(act(s, 0, { kind: 'travelStep', uid: soldier.uid })).toEqual([
      { kind: 'travel', actor: 0, uid: soldier.uid, to: null, end: 'withinReach' },
    ]);
    expect([soldier.y, soldier.travelTo]).toEqual([19, undefined]);
    // Y si ya esta en el destino al empezar el turno, acaba sin mas.
    soldier.travelTo = { x: 2, y: 19 };
    expect(act(s, 0, { kind: 'travelStep', uid: soldier.uid })).toEqual([
      { kind: 'travel', actor: 0, uid: soldier.uid, to: null, end: 'arrived' },
    ]);
  });

  it('capturar a mano con otra orden la cambia a capturar ese edificio, y lo cuenta', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 9, y: 9 } } });
    const events = act(s, 0, { kind: 'capture', uid: soldier.uid });
    expect(events.map((event) => event.kind)).toEqual(['capture', 'standingOrder']);
    expect(events[1]).toEqual({ kind: 'standingOrder', actor: 0, uids: [soldier.uid], order: { kind: 'capture', at: { x: 5, y: 5 } } });
    // Sin orden, o ya capturando este edificio, no cambia nada: solo la captura.
    endRound(s);
    expect(act(s, 0, { kind: 'capture', uid: soldier.uid }).map((event) => event.kind)).toEqual(['capture']);
  });

  it('un viaje y una orden permanente se quitan el uno al otro, cada uno con su suceso', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    const order = { kind: 'defend', at: { x: 2, y: 4 } } as const;
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order });
    expect(act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 2, y: 20 } })).toEqual([
      { kind: 'standingOrder', actor: 0, uids: [soldier.uid], order: null },
      { kind: 'travel', actor: 0, uid: soldier.uid, to: { x: 2, y: 20 } },
    ]);
    expect(soldier.standingOrder).toBeUndefined();
    expect(act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order })).toEqual([
      { kind: 'travel', actor: 0, uid: soldier.uid, to: null, end: 'ordered' },
      { kind: 'standingOrder', actor: 0, uids: [soldier.uid], order },
    ]);
    expect(soldier.travelTo).toBeUndefined();
  });

  it('el paso de un viaje no se deshace (seria un movimiento gratis)', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 2, y: 20 } });
    act(s, 0, { kind: 'travelStep', uid: soldier.uid });
    expect(s.undoableMoves).toBeUndefined();
    expectRejected(s, 0, { kind: 'undoMove', uid: soldier.uid }, 'nothingToUndo');
  });

  it('una emboscada por el camino acaba el viaje', () => {
    // Un pasillo entre agua con un enemigo escondido en el bosque (reglas de siempre: niebla y emboscadas).
    const s = blankState({ terrainCost: false });
    for (let x = 0; x < BLANK_SIZE; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    s.map[6]![5] = 'Woods';
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    act(s, 0, { kind: 'travel', uid: tank.uid, to: { x: 25, y: 5 } });
    const events = act(s, 0, { kind: 'travelStep', uid: tank.uid });
    expect(events[0]).toMatchObject({ kind: 'move', ambush: { x: 6, y: 5 } });
    expect(events[1]).toEqual({ kind: 'travel', actor: 0, uid: tank.uid, to: null, end: 'ambush' });
    expect(tank.travelTo).toBeUndefined();
  });

  it('a mano (mover, subir, unirse, atacar sin moverse) se acaba el viaje', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const transport = newUnit(s, TRANSPORT, 0, { x: 5, y: 6 });
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    const cancelled = (uid: number) => ({ kind: 'travel', actor: 0, uid, to: null, end: 'cancelled' });
    act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 5, y: 25 } });
    expect(act(s, 0, { kind: 'load', uid: soldier.uid, into: transport.uid })[0]).toEqual(cancelled(soldier.uid));
    expect(soldier.travelTo).toBeUndefined();
    act(s, 0, { kind: 'travel', uid: tank.uid, to: { x: 25, y: 10 } });
    expect(act(s, 0, { kind: 'attack', uid: tank.uid, target: enemy.uid })[0]).toEqual(cancelled(tank.uid));
    expect(tank.travelTo).toBeUndefined();
    const other = newUnit(s, SOLDIER, 0, { x: 15, y: 15 });
    act(s, 0, { kind: 'travel', uid: other.uid, to: { x: 15, y: 30 } });
    expect(act(s, 0, { kind: 'move', uid: other.uid, to: { x: 15, y: 17 } })[0]).toEqual(cancelled(other.uid));
    const [first, second] = [newUnit(s, SOLDIER, 0, { x: 20, y: 5 }), newUnit(s, SOLDIER, 0, { x: 21, y: 5 })];
    second.life = 50;
    act(s, 0, { kind: 'travel', uid: first.uid, to: { x: 20, y: 25 } });
    expect(act(s, 0, { kind: 'merge', uid: first.uid, into: second.uid })[0]).toEqual(cancelled(first.uid));
  });

  it('atacar despues del paso del viaje no lo acaba (ya se ha movido solo); sin moverse, si', () => {
    const s = blankState(PLAIN_RULES);
    const tank = newUnit(s, TANK, 0, { x: 2, y: 10 });
    act(s, 0, { kind: 'travel', uid: tank.uid, to: { x: 30, y: 10 } });
    act(s, 0, { kind: 'travelStep', uid: tank.uid });
    const enemy = newUnit(s, SOLDIER, 1, { x: tank.x + 1, y: tank.y });
    const events = act(s, 0, { kind: 'attack', uid: tank.uid, target: enemy.uid });
    expect(events.some((event) => event.kind === 'travel')).toBe(false);
    expect(tank.travelTo).toEqual({ x: 30, y: 10 });
  });

  it('un viaje: solo desde el mapa, a otra casilla que pueda pisar y hacia la que pueda ir ya', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const transport = newUnit(s, TRANSPORT, 0, { x: 6, y: 5 });
    s.map[20]![20] = 'DWater';
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 20, y: 20 } }, 'unreachable');
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 5, y: 5 } }, 'withinReach');
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 5, y: 6 } }, 'withinReach');
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 99, y: 0 } }, 'offBoard');
    act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 20, y: 21 } });
    act(s, 0, { kind: 'load', uid: soldier.uid, into: transport.uid });
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 20, y: 21 } }, 'transported');
    // Ya no viaja (subir lo acabo): no hay viaje que quitar.
    expectRejected(s, 0, { kind: 'travel', uid: soldier.uid, to: null }, 'noTravel');
  });

  it('una unidad que no lucha no ataca (noFighter), aunque le quede turno', () => {
    const s = blankState(PLAIN_RULES);
    const transport = newUnit(s, TRANSPORT, 0, { x: 5, y: 5 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 5, y: 6 });
    expectRejected(s, 0, { kind: 'attack', uid: transport.uid, target: enemy.uid }, 'noFighter');
  });

  it('un transporte con pasajeros no se une (los perderia)', () => {
    const s = blankState(PLAIN_RULES);
    const first = newUnit(s, TRANSPORT, 0, { x: 5, y: 5 });
    const second = newUnit(s, TRANSPORT, 0, { x: 7, y: 5 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    act(s, 0, { kind: 'load', uid: passenger.uid, into: first.uid });
    expectRejected(s, 0, { kind: 'merge', uid: first.uid, into: second.uid }, 'cannotMerge');
  });

  it('bajar, reparar y esperar tambien se comprueban', () => {
    const s = blankState(PLAIN_RULES);
    const transport = newUnit(s, TRANSPORT, 0, { x: 5, y: 5 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    const supplier = newUnit(s, SUPPLIER, 0, { x: 12, y: 12 });
    act(s, 0, { kind: 'load', uid: passenger.uid, into: transport.uid });
    expectRejected(s, 0, { kind: 'unload', uid: transport.uid, passenger: passenger.uid, to: { x: 8, y: 8 } }, 'cannotUnload');
    act(s, 0, { kind: 'wait', uid: transport.uid });
    expectRejected(s, 0, { kind: 'unload', uid: transport.uid, passenger: passenger.uid, to: { x: 5, y: 6 } }, 'spent');
    expectRejected(s, 0, { kind: 'supply', uid: supplier.uid }, 'nobodyToSupply');
  });

  it('comprar y retirar una unidad: solo lo propio', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'Factory', owner: 1, x: 4, y: 4 }, { type: 'City', owner: 0, x: 8, y: 8 });
    const theirs = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    newUnit(s, SOLDIER, 0, { x: 8, y: 8 });
    expectRejected(s, 0, { kind: 'buy', at: { x: 4, y: 4 }, unitType: 'Soldier' }, 'notYours');
    expectRejected(s, 0, { kind: 'buy', at: { x: 8, y: 8 }, unitType: 'Soldier' }, 'occupied');
    expectRejected(s, 0, { kind: 'buy', at: { x: 8, y: 8 }, unitType: 'Dragon' }, 'missing');
    expectRejected(s, 0, { kind: 'deleteUnit', uid: theirs.uid }, 'notYours');
  });

  it('antes de nada: la manda un equipo de la partida (ACTION_GUARDS)', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    expectRejected(s, 7, { kind: 'wait', uid: soldier.uid }, 'notATeam');
    expectRejected(s, 7, { kind: 'usePower', power: 'recon', target: null }, 'notATeam');
    expect(ACTION_GUARDS.map((guard) => guard.id)).toEqual(['shape', 'team', 'playing', 'turn', 'started', 'standing']);
  });

  it('solo juega el equipo al que le toca, y despues de empezar su turno', () => {
    const s = blankState(PLAIN_RULES);
    const enemy = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    expectRejected(s, 1, { kind: 'wait', uid: enemy.uid }, 'notYourTurn');
    giveTurn(s, 1);
    s.turnStarted = false;
    expectRejected(s, 1, { kind: 'wait', uid: enemy.uid }, 'turnNotStarted');
    act(s, 1, { kind: 'startTurn' });
    act(s, 1, { kind: 'wait', uid: enemy.uid });
  });

  it('rendirse vale en cualquier momento (anyTime: sin las comprobaciones de turno), pero no si ya ha perdido ni con la partida decidida', () => {
    const s = blankState(PLAIN_RULES, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    expectRejected(s, 2, { kind: 'wait', uid: newUnit(s, SOLDIER, 2, { x: 9, y: 9 }).uid }, 'notYourTurn');
    act(s, 2, { kind: 'surrender' });
    expectRejected(s, 2, { kind: 'surrender' }, 'defeated');
    act(s, 0, { kind: 'surrender' });
    expect(s.teams.map((team) => team.resigned)).toEqual([true, false, true, false]);
    act(s, 3, { kind: 'surrender' });
    expectRejected(s, 1, { kind: 'surrender' }, 'matchOver');
  });

  it('un equipo que ya ha perdido (sin Base) no manda acciones; si con eso acaba la partida, nadie mas', () => {
    const s = blankState(PLAIN_RULES, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    expect(isValidAction(s, 0, { kind: 'wait', uid: soldier.uid })).toBe(true);
    s.buildings = s.buildings.filter((building) => building.owner !== 0);
    expectRejected(s, 0, { kind: 'wait', uid: soldier.uid }, 'defeated');
    s.buildings = s.buildings.filter((building) => building.owner !== 1);
    expectRejected(s, 0, { kind: 'endTurn' }, 'matchOver');
  });

  it('una accion sin la forma de GameAction se rechaza con badAction, sin TypeError', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const broken: unknown[] = [
      null,
      'wait',
      { kind: 'fly', uid: soldier.uid },
      { kind: 'toString', uid: soldier.uid },
      { kind: 'wait' },
      { kind: 'wait', uid: 1.5 },
      { kind: 'wait', uid: '1' },
      { kind: 'move', uid: soldier.uid, to: { x: 5 } },
      { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 }, path: [{ x: 5, y: 6.5 }] },
      { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'patrol', at: { x: 1, y: 1 } } },
      { kind: 'cancelStandingOrder', uids: soldier.uid },
      { kind: 'usePower', power: 3, target: null },
      { kind: 'renameSquad', squad: 1 },
    ];
    for (const action of broken) expectRejected(s, 0, action as GameAction, 'badAction');
    expect(isGameAction({ kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } })).toBe(true);
    expect(isGameAction({ kind: 'travel', uid: soldier.uid, to: null })).toBe(true);
  });

  it('isValidAction pregunta lo mismo sin cambiar nada', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const before = serialize(s);
    expect(isValidAction(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } })).toBe(true);
    expect(isValidAction(s, 1, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } })).toBe(false);
    expect(serialize(s)).toBe(before);
  });
});

describe('INVARIANTS: lo que dispatch deja en orden tras cada accion', () => {
  it('la unidad que cae desaparece, y la captura a medias de una unidad que se va se pierde', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'capture', uid: soldier.uid });
    expect(placedBuildings(s)[0]!.capture).not.toBeNull();
    endRound(s);
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 6 } });
    expect(placedBuildings(s)[0]!.capture).toBeNull();

    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const victim = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    victim.life = 1;
    s.dice = 7;
    act(s, 0, { kind: 'attack', uid: tank.uid, target: victim.uid });
    expect(s.units).not.toContain(victim);
  });

  it('una escuadra que se queda sin unidades desaparece', () => {
    const s = blankState(PLAIN_RULES);
    const units = [newUnit(s, SOLDIER, 0, { x: 5, y: 5 }), newUnit(s, SOLDIER, 0, { x: 6, y: 5 })];
    const squad = formSquad(s, 0, someUnits(units)).squad;
    act(s, 0, { kind: 'leaveSquad', uids: units.map((unit) => unit.uid) });
    expect(s.squads?.some((candidate) => candidate.id === squad.id)).toBeFalsy();
  });
});

describe('deshacer el ultimo movimiento', () => {
  it('justo despues vuelve a su casilla y puede moverse otra vez', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    expect([soldier.x, soldier.y, soldier.turnState]).toEqual([5, 5, 'ready']);
  });

  it('con niebla, si el movimiento descubre enemigos no se deshace (seria mirar gratis)', () => {
    const s = blankState({ ...PLAIN_RULES, fog: true });
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 2, y: 4 + SOLDIER.vision });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 2, y: 3 } });
    expect(s.undoableMoves?.at(-1)?.revealed).toBe(false);
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 2, y: 4 } });
    expect(manhattan(soldier, enemy)).toBe(SOLDIER.vision);
    expectRejected(s, 0, { kind: 'undoMove', uid: soldier.uid }, 'revealed');
  });

  it('deshacer un movimiento que acabo un viaje lo devuelve', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    act(s, 0, { kind: 'travel', uid: soldier.uid, to: { x: 2, y: 20 } });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 3, y: 2 } });
    expect(soldier.travelTo).toBeUndefined();
    const events = act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    expect(events.at(-1)).toEqual({ kind: 'travel', actor: 0, uid: soldier.uid, to: { x: 2, y: 20 } });
    expect(soldier.travelTo).toEqual({ x: 2, y: 20 });
  });

  it('una accion que cuenta algo nuevo (retirar una unidad, atacar, comprar...) o el fin de ronda los olvidan', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const other = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    act(s, 0, { kind: 'deleteUnit', uid: other.uid });
    expectRejected(s, 0, { kind: 'undoMove', uid: soldier.uid }, 'nothingToUndo');
    endRound(s);
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 9 } });
    endRound(s);
    expect(s.undoableMoves).toBeUndefined();
  });

  it('se deshacen uno tras otro, el ultimo primero, aunque despues hayan esperado', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const other = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    act(s, 0, { kind: 'wait', uid: soldier.uid });
    act(s, 0, { kind: 'move', uid: other.uid, to: { x: 9, y: 11 } });
    expectRejected(s, 0, { kind: 'undoMove', uid: soldier.uid }, 'nothingToUndo');
    act(s, 0, { kind: 'undoMove', uid: other.uid });
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    expect([soldier.x, soldier.y, soldier.turnState, other.y, other.turnState]).toEqual([5, 5, 'ready', 9, 'ready']);
    expect(s.undoableMoves).toBeUndefined();
  });
});

describe('sucesos completos', () => {
  it('cada accion dice quien la hizo y a quien, con uids y tipos', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: 0, x: 4, y: 4 });
    const [bought] = act(s, 0, { kind: 'buy', at: { x: 4, y: 4 }, unitType: 'Soldier' });
    expect(bought).toMatchObject({ kind: 'spawn', actor: 0, unitType: 'Soldier', team: 0, at: { x: 4, y: 4 } });
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    const [fight] = act(s, 0, { kind: 'attack', uid: tank.uid, target: enemy.uid });
    expect(fight).toMatchObject({ kind: 'attack', actor: 0, attacker: tank.uid, target: enemy.uid, at: { x: 10, y: 11 } });
    const soldier = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    expect(act(s, 0, { kind: 'wait', uid: soldier.uid })).toEqual([{ kind: 'wait', actor: 0, uid: soldier.uid }]);
  });

  it('las escuadras y las ordenes tambien tienen suceso', () => {
    const s = blankState(PLAIN_RULES);
    const uids = [newUnit(s, SOLDIER, 0, { x: 5, y: 5 }).uid, newUnit(s, SOLDIER, 0, { x: 6, y: 5 }).uid];
    const [formed] = act(s, 0, { kind: 'formSquad', uids });
    expect(formed).toMatchObject({ kind: 'squad', actor: 0, change: 'formed', uids, name: 'Alfa', key: 1 });
    const order = { kind: 'defend', at: { x: 9, y: 9 } } as const;
    expect(act(s, 0, { kind: 'giveStandingOrder', uids, order })).toEqual([{ kind: 'standingOrder', actor: 0, uids, order }]);
  });

  it('el ataque cuenta la carga que gana cada general', () => {
    const s = blankState(PLAIN_RULES);
    appointGeneral(s, 0, 'Brisa');
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 10, y: 11 });
    const [attack] = act(s, 0, { kind: 'attack', uid: tank.uid, target: enemy.uid });
    expect(attack?.kind === 'attack' && attack.damage).toBeGreaterThan(0);
    expect(attack).toMatchObject({ charge: [{ team: 0, amount: teamState(s, 0).general!.charge }] });
  });

  it('los pasajeros que caen con su transporte y el dinero que pasa del maximo tienen suceso', () => {
    const s = blankState(PLAIN_RULES);
    const transport = newUnit(s, TRANSPORT, 1, { x: 5, y: 5 });
    const passenger = newUnit(s, SOLDIER, 1, { x: 5, y: 6 });
    act(s, 1, { kind: 'load', uid: passenger.uid, into: transport.uid });
    transport.life = 0;
    teamState(s, 0).funds = s.content.maxFunds + 500;
    const soldier = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    expect(act(s, 0, { kind: 'wait', uid: soldier.uid })).toEqual([
      { kind: 'wait', actor: 0, uid: soldier.uid },
      { kind: 'cargoLost', actor: null, transport: transport.uid, team: 1, passengers: [passenger.uid] },
      { kind: 'fundsCapped', actor: null, team: 0, lost: 500 },
    ]);
    expect(unitById(s, passenger.uid)).toBeUndefined();
    // Al acabar la ronda, con lo cobrado ese dia (la Base) y ya pagado el mantenimiento.
    teamState(s, 0).funds = s.content.maxFunds;
    const events = endRound(s);
    const report = roundReport(s, events);
    const lost = report.income[0]! - report.upkeep[0]!;
    expect(lost).toBeGreaterThan(0);
    expect(events).toContainEqual({ kind: 'fundsCapped', actor: null, team: 0, lost });
    expect(teamState(s, 0).funds).toBe(s.content.maxFunds);
  });

  it('retirar un transporte con pasajeros: su suceso y el mismo cargoLost que si cayera', () => {
    const s = blankState(PLAIN_RULES);
    const transport = newUnit(s, TRANSPORT, 0, { x: 5, y: 5 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    act(s, 0, { kind: 'load', uid: passenger.uid, into: transport.uid });
    expect(act(s, 0, { kind: 'deleteUnit', uid: transport.uid })).toEqual([
      { kind: 'remove', actor: 0, uid: transport.uid, unitType: 'Transport' },
      { kind: 'cargoLost', actor: null, transport: transport.uid, team: 0, passengers: [passenger.uid] },
    ]);
  });

  it('la captura a medias que se pierde y la escuadra que se queda vacia tienen suceso', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const other = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    act(s, 0, { kind: 'capture', uid: soldier.uid });
    endRound(s);
    expect(act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 6 } })).toContainEqual({
      kind: 'captureDropped',
      actor: null,
      at: { x: 5, y: 5 },
      uid: soldier.uid,
      team: 0,
    });
    act(s, 0, { kind: 'formSquad', uids: [other.uid] });
    // Volver a formarla con la unica que tenia: la vieja deja de existir (antes, en orden) y la nueva
    // lleva un numero nuevo (nextSquadId: nunca se reutiliza), con el nombre y la tecla que deja libres.
    expect(act(s, 0, { kind: 'formSquad', uids: [other.uid] })).toEqual([
      { kind: 'squad', actor: 0, squad: 1, change: 'removed', uids: [], name: 'Alfa', key: 1 },
      { kind: 'squad', actor: 0, squad: 2, change: 'formed', uids: [other.uid], name: 'Alfa', key: 1 },
    ]);
    expect(s.nextSquadId).toBe(3);
  });

  it('cada escuadra que deja de existir tiene un solo suceso: disbanded (deshacerla) o removed (vaciarla)', () => {
    const s = blankState(PLAIN_RULES);
    const [first, second] = [newUnit(s, SOLDIER, 0, { x: 5, y: 5 }), newUnit(s, SOLDIER, 0, { x: 6, y: 5 })];
    act(s, 0, { kind: 'formSquad', uids: [first.uid, second.uid] });
    expect(act(s, 0, { kind: 'disbandSquad', squad: 1 })).toEqual([
      { kind: 'squad', actor: 0, squad: 1, change: 'disbanded', uids: [], name: 'Alfa', key: 1 },
    ]);
    act(s, 0, { kind: 'formSquad', uids: [first.uid, second.uid] });
    expect(act(s, 0, { kind: 'leaveSquad', uids: [first.uid] })).toEqual([
      { kind: 'squad', actor: 0, squad: 2, change: 'left', uids: [second.uid], name: 'Alfa', key: 1 },
    ]);
    expect(act(s, 0, { kind: 'leaveSquad', uids: [second.uid] })).toEqual([
      { kind: 'squad', actor: 0, squad: 2, change: 'removed', uids: [], name: 'Alfa', key: 1 },
    ]);
  });

  it('el fin de ronda da sus sucesos sin actor, y su resumen sale de ellos', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: 0, x: 4, y: 4 });
    const soldier = newUnit(s, SOLDIER, 0, { x: 4, y: 4 });
    soldier.life = 50;
    const events = endRound(s);
    expect(events.every((event) => event.actor === null)).toBe(true);
    expect(events).toContainEqual({ kind: 'heal', actor: null, uid: soldier.uid, team: 0, amount: 30 });
    expect(events).toContainEqual({ kind: 'newDay', actor: null, day: 2 });
    const report = roundReport(s, events);
    expect(report.income[0]).toBeGreaterThan(0);
    expect(report.healed).toEqual([{ uid: soldier.uid, team: 0, amount: 30 }]);
  });
});

describe('deshacer no pierde la captura a medias (K2)', () => {
  it('al volver al edificio, la captura sigue donde estaba', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'capture', uid: soldier.uid });
    endRound(s);
    const progress = placedBuildings(s)[0]!.capture;
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    expect(placedBuildings(s)[0]!.capture).toBeNull();
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    expect(placedBuildings(s)[0]!.capture).toEqual(progress);
    // Y se puede guardar y cargar a mitad de deshacer.
    expect(placedBuildings(loadGame(serialize(s))!)[0]!.capture).toEqual(progress);
  });

  it('los movimientos para deshacer se guardan; si estan rotos, se quitan', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    const raw = JSON.parse(serialize(s)) as { undoableMoves: { from: unknown }[] };
    expect(loadGame(JSON.stringify(raw))!.undoableMoves).toEqual([
      { uid: soldier.uid, from: { x: 5, y: 5 }, capture: null, revealed: false },
    ]);
    raw.undoableMoves[0]!.from = { x: -1, y: 0 };
    expect(loadGame(JSON.stringify(raw))!.undoableMoves).toBeUndefined();
  });
});

describe('el menu de una unidad sale de las acciones que valen', () => {
  it('cada opcion se ofrece si su accion vale ahora', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 5, y: 6 });
    expect(availableActions(s, 0, soldier)).toEqual([
      'attack',
      'capture',
      'wait',
      'orderToAttack',
      'orderToCapture',
      'orderToDefend',
      'delete',
    ]);
    expect(availableActions(s, 1, soldier)).toEqual([]);
  });

  it('un transporte con alguien dentro puede bajarlo; uno que no lucha no recibe ordenes de atacar', () => {
    const s = blankState(PLAIN_RULES);
    const transport = newUnit(s, TRANSPORT, 0, { x: 5, y: 5 });
    const passenger = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    act(s, 0, { kind: 'load', uid: passenger.uid, into: transport.uid });
    const options = availableActions(s, 0, transport);
    expect(options).toContain('unload');
    expect(options).not.toContain('orderToAttack');
    expect(canDoWithSelection(s, 0, [transport], 'orderToDefend', null)).toBe(false);
    expect(canDoWithSelection(s, 0, [transport, passenger], 'orderToDefend', null)).toBe(true);
  });
});

describe('lo que se manda a unas unidades elegidas sale de las acciones que valen', () => {
  it('un grupo captura un edificio ajeno pero no uno propio, y se mueve si alguna puede acercarse', () => {
    const s = blankState(PLAIN_RULES);
    s.buildings.push({ type: 'City', owner: null, x: 9, y: 5, capture: null }, { type: 'City', owner: 0, x: 9, y: 9, capture: null });
    const group = [newUnit(s, SOLDIER, 0, { x: 5, y: 5 }), newUnit(s, TANK, 0, { x: 5, y: 6 })];
    expect(canDoWithSelection(s, 0, group, 'capture', { x: 9, y: 5 })).toBe(true);
    expect(canDoWithSelection(s, 0, group, 'capture', { x: 9, y: 9 })).toBe(false);
    expect(canDoWithSelection(s, 0, [group[1]!], 'capture', { x: 9, y: 5 })).toBe(false);
    expect(canDoWithSelection(s, 0, group, 'move', { x: 9, y: 9 })).toBe(true);
    for (const unit of group) act(s, 0, { kind: 'wait', uid: unit.uid });
    expect(canDoWithSelection(s, 0, group, 'move', { x: 9, y: 9 })).toBe(false);
  });

  it('renombrar y deshacer solo con la escuadra entera; quitar ordenes solo si tienen', () => {
    const s = blankState(PLAIN_RULES);
    const group = [newUnit(s, SOLDIER, 0, { x: 5, y: 5 }), newUnit(s, SOLDIER, 0, { x: 5, y: 6 })];
    expect(canDoWithSelection(s, 0, group, 'squadRename', null)).toBe(false);
    act(s, 0, { kind: 'formSquad', uids: group.map((unit) => unit.uid) });
    expect(canDoWithSelection(s, 0, group, 'squadRename', null)).toBe(true);
    expect(canDoWithSelection(s, 0, group, 'squadDisband', null)).toBe(true);
    expect(canDoWithSelection(s, 0, [group[0]!], 'squadDisband', null)).toBe(false);
    expect(canDoWithSelection(s, 1, group, 'squadDisband', null)).toBe(false);
    expect(canDoWithSelection(s, 0, group, 'cancelOrder', null)).toBe(false);
    act(s, 0, { kind: 'giveStandingOrder', uids: group.map((unit) => unit.uid), order: { kind: 'defend', at: { x: 5, y: 5 } } });
    expect(canDoWithSelection(s, 0, group, 'cancelOrder', null)).toBe(true);
  });
});

describe('ventana de deshacer y menus: piezas del nucleo', () => {
  it('solo las entradas con keepsUndo dejan deshacer lo de antes: las que no cuentan nada nuevo de la partida', () => {
    const keeping = (Object.keys(ACTIONS) as GameActionKind[]).filter((kind) => ACTIONS[kind].keepsUndo);
    expect(keeping.sort()).toEqual(
      [
        'move',
        'undoMove',
        'wait',
        'travel',
        'giveStandingOrder',
        'cancelStandingOrder',
        'formSquad',
        'setGroup',
        'addToGroup',
        'leaveSquad',
        'renameSquad',
        'disbandSquad',
      ].sort(),
    );
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const other = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 5, y: 7 } } });
    act(s, 0, { kind: 'move', uid: other.uid, to: { x: 9, y: 10 } });
    expect(s.undoableMoves?.map((move) => move.uid)).toEqual([soldier.uid, other.uid]);
    act(s, 0, { kind: 'deleteUnit', uid: other.uid });
    expect(s.undoableMoves).toBeUndefined();
  });

  it('mover en grupo: las mas cercanas primero, cada paso con el mapa como lo dejan las de antes', () => {
    const s = blankState(PLAIN_RULES);
    const far = newUnit(s, SOLDIER, 0, { x: 2, y: 10 });
    const near = newUnit(s, SOLDIER, 0, { x: 7, y: 10 });
    const done = newUnit(s, SOLDIER, 0, { x: 8, y: 12 }, 'done');
    const goal = { x: 9, y: 10 };
    expect(groupMoveOrder([far, done, near], goal)).toEqual([near, far]);
    const first = groupMoveStep(s, near, goal)!;
    expect(first.to).toEqual(goal);
    act(s, 0, first);
    // La casilla del destino ya esta ocupada: la siguiente se queda lo mas cerca que puede.
    const second = groupMoveStep(s, far, goal)!;
    expect(second.to).not.toEqual(goal);
    act(s, 0, second);
    expect(manhattan(far, goal)).toBeLessThan(7);
  });

  it('las ordenes del menu de una unidad son las de SELECTION_MENU con ella sola', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const options = availableActions(s, 0, soldier);
    for (const kind of ['attack', 'capture', 'defend'] as const) {
      const option = ORDER_OPTIONS[kind];
      expect(options.includes(option)).toBe(canDoWithSelection(s, 0, [soldier], option, null));
    }
    expect(options.includes('cancelOrder')).toBe(canDoWithSelection(s, 0, [soldier], 'cancelOrder', null));
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 5, y: 5 } } });
    expect(availableActions(s, 0, soldier)).toContain('cancelOrder');
  });
});
