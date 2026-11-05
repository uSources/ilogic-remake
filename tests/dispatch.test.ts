import { describe, expect, it } from 'vitest';
import { ACTIONS, INVARIANTS, availableActions, canGiveStandingOrder, dispatch, isValidAction } from '@core/actions';
import { endRound, newUnit, roundReport } from '@core/rules';
import { serialize } from '@core/save';
import { loadGame } from '@core/defaultGames';
import { formSquad } from '@core/squads/membership';
import type { GameAction, GameState } from '@core/model';
import { act, blankState, unitTypeNamed } from './helpers';
import { PLAIN_RULES } from './plainRules';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');
const TRANSPORT = unitTypeNamed('Transport');
const SUPPLIER = unitTypeNamed('Supplier');

/** La accion no vale por `reason` y la partida no cambia. */
function expectRejected(s: GameState, team: number, action: GameAction, reason: string): void {
  const before = serialize(s);
  expect(dispatch(s, team, action)).toEqual({ ok: false, reason });
  expect(serialize(s)).toBe(before);
}

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
    expect(s.buildings[0]!.capture).not.toBeNull();
    endRound(s);
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 6 } });
    expect(s.buildings[0]!.capture).toBeNull();

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
    const squad = formSquad(s, 0, units)!;
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

  it('cualquier otra accion o el fin de ronda lo olvidan', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const other = newUnit(s, SOLDIER, 0, { x: 9, y: 9 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    act(s, 0, { kind: 'wait', uid: other.uid });
    expectRejected(s, 0, { kind: 'undoMove', uid: soldier.uid }, 'nothingToUndo');
    endRound(s);
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 9 } });
    endRound(s);
    expect(s.lastMove).toBeUndefined();
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
    const progress = s.buildings[0]!.capture;
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    expect(s.buildings[0]!.capture).toBeNull();
    act(s, 0, { kind: 'undoMove', uid: soldier.uid });
    expect(s.buildings[0]!.capture).toEqual(progress);
    // Y se puede guardar y cargar a mitad de deshacer.
    expect(loadGame(serialize(s))!.buildings[0]!.capture).toEqual(progress);
  });

  it('un ultimo movimiento roto en una partida guardada se quita', () => {
    const s = blankState(PLAIN_RULES);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    act(s, 0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } });
    const raw = JSON.parse(serialize(s)) as { lastMove: { from: unknown } };
    expect(loadGame(JSON.stringify(raw))!.lastMove).toEqual({ uid: soldier.uid, from: { x: 5, y: 5 }, capture: null });
    raw.lastMove.from = { x: -1, y: 0 };
    expect(loadGame(JSON.stringify(raw))!.lastMove).toBeUndefined();
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
    expect(canGiveStandingOrder(s, 0, [transport], 'defend', null)).toBe(false);
    expect(canGiveStandingOrder(s, 0, [transport, passenger], 'defend', null)).toBe(true);
  });
});
