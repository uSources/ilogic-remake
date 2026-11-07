import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { cloneState } from '@core/gameContent';
import { skirmishConfig } from '@core/match';
import { newUnit } from '@core/measure';
import type { GameEvent } from '@core/model';
import {
  CLIENT_MESSAGE_SHAPES,
  CURRENT_PROTOCOL,
  isCurrentProtocol,
  isValidMessage,
  loadView,
  PROTOCOL_VERSION,
  viewSnapshotOf,
  type ClientMessage,
  type ServerMessage,
} from '@core/net';
import { readSave, serialize } from '@core/save';
import { SAVE_VERSION } from '@core/saveVersion';
import { duel } from '@core/teams';
import { blankState, unitTypeNamed } from './helpers';
import { expectFoggedView } from './sim/viewChecks';

const hello = (): ClientMessage => ({ kind: 'hello', token: 'una-ficha', ...CURRENT_PROTOCOL });

describe('el protocolo: version y forma de los mensajes', () => {
  it('la version va atada a la del formato de las partidas', () => {
    expect(CURRENT_PROTOCOL).toEqual({ protocol: PROTOCOL_VERSION, save: SAVE_VERSION });
    expect(isCurrentProtocol(CURRENT_PROTOCOL)).toBe(true);
    expect(isCurrentProtocol({ protocol: PROTOCOL_VERSION, save: SAVE_VERSION + 1 })).toBe(false);
    expect(isCurrentProtocol({ protocol: PROTOCOL_VERSION + 1, save: SAVE_VERSION })).toBe(false);
  });

  it('hay una forma por cada tipo de mensaje del cliente', () => {
    expect(Object.keys(CLIENT_MESSAGE_SHAPES).sort()).toEqual(['act', 'endTurn', 'hello', 'resync', 'surrender']);
  });

  it.each<[string, unknown]>([
    ['un saludo', hello()],
    ['una accion', { kind: 'act', action: { kind: 'move', uid: 3, to: { x: 1, y: 2 } } }],
    ['rendirse como accion', { kind: 'act', action: { kind: 'surrender' } }],
    ['fin de turno', { kind: 'endTurn' }],
    ['rendirse', { kind: 'surrender' }],
    ['pedir la vista', { kind: 'resync' }],
    ['con campos de mas (se ignoran)', { kind: 'resync', extra: 1 }],
  ])('acepta %s', (_name, message) => expect(isValidMessage(message)).toBe(true));

  it.each<[string, unknown]>([
    ['nada', null],
    ['un texto', 'hello'],
    ['una lista', [{ kind: 'resync' }]],
    ['sin tipo', { token: 'x' }],
    ['un tipo que no existe', { kind: 'cheat', units: [] }],
    ['un tipo que es un metodo de los objetos', { kind: 'constructor' }],
    ['un tipo que es el prototipo', { kind: '__proto__' }],
    ['un saludo sin ficha', { kind: 'hello', ...CURRENT_PROTOCOL }],
    ['un saludo con la ficha vacia', { kind: 'hello', token: '', ...CURRENT_PROTOCOL }],
    ['un saludo con una ficha kilometrica', { kind: 'hello', token: 'x'.repeat(10_000), ...CURRENT_PROTOCOL }],
    ['un saludo con la ficha como objeto', { kind: 'hello', token: { toString: () => 'x' }, ...CURRENT_PROTOCOL }],
    ['un saludo con la version en texto', { kind: 'hello', token: 'x', protocol: '1', save: SAVE_VERSION }],
    ['un saludo con la version rota', { kind: 'hello', token: 'x', protocol: 1.5, save: SAVE_VERSION }],
    ['una accion sin accion', { kind: 'act' }],
    ['una accion que no es una accion', { kind: 'act', action: { kind: 'teleport', uid: 1 } }],
    ['una accion con un uid que no lo es', { kind: 'act', action: { kind: 'wait', uid: '1' } }],
    ['una accion con una casilla rota', { kind: 'act', action: { kind: 'move', uid: 1, to: { x: 1 } } }],
    ['una accion con uids infinitos', { kind: 'act', action: { kind: 'formSquad', uids: [1, Infinity] } }],
    ['empezar el turno (eso es de la sesion, pero ni siquiera tiene forma de mensaje del cliente)', { kind: 'startTurn' }],
  ])('rechaza %s', (_name, message) => expect(isValidMessage(message)).toBe(false));
});

describe('todo lo que viaja es JSON', () => {
  const s = createMatch(skirmishConfig({ seed: 3, size: 16, teams: duel('human', 'ai'), settingChanges: { fog: true } }));
  const view = viewSnapshotOf(s, 0);
  const events: GameEvent[] = [
    { kind: 'turnStart', actor: 0, day: 1 },
    { kind: 'move', actor: 1, uid: 7, path: [{ x: 1, y: 1 }] },
  ];
  const samples: readonly ServerMessage[] = [
    { kind: 'welcome', seat: 0, team: 0, ...CURRENT_PROTOCOL, status: 'waiting' },
    { kind: 'view', view },
    { kind: 'events', actor: 1, events, view },
    { kind: 'result', result: { ok: true, events } },
    { kind: 'result', result: { ok: false, reason: 'notYourTurn' } },
    { kind: 'turn', team: 1, day: 2 },
    { kind: 'ended', result: { status: 'decided', winners: [0], reason: 'hq' } },
    { kind: 'error', error: 'badToken' },
  ];

  it.each(samples.map((message) => [message.kind, message] as const))('el mensaje %s del servidor va y vuelve igual', (_kind, message) => {
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });

  it.each<ClientMessage>([hello(), { kind: 'act', action: { kind: 'buy', at: { x: 2, y: 3 }, unitType: 'Tank' } }, { kind: 'endTurn' }])(
    'el mensaje $kind del cliente va y vuelve igual, y sigue valiendo',
    (message) => {
      const back: unknown = JSON.parse(JSON.stringify(message));
      expect(back).toEqual(message);
      expect(isValidMessage(back)).toBe(true);
    },
  );
});

describe('la vista de un equipo como partida del cliente', () => {
  const SOLDIER = unitTypeNamed('Soldier');

  it('pasa por el mismo comprobador que una partida guardada y se lee con loadView, sin lo que el equipo no sabe', () => {
    const s = createMatch(skirmishConfig({ seed: 9, size: 16, teams: duel('human', 'ai'), settingChanges: { fog: true } }));
    const snapshot = viewSnapshotOf(s, 0);
    expect(snapshot).not.toHaveProperty('content');
    expect([snapshot.dice, snapshot.decisionSeed, snapshot.setup]).toEqual([0, 0, undefined]);
    const loaded = loadView(JSON.parse(JSON.stringify(snapshot)), defaultContent());
    if (!loaded.ok) throw new Error(loaded.error);
    expectFoggedView(loaded.state, 0);
    expect(loaded.state.units.length).toBeLessThan(s.units.length);
    // Lo que la pantalla hace con una partida: copiarla y guardarla.
    expect(serialize(cloneState(loaded.state))).toBe(serialize(loaded.state));
    expect(JSON.parse(serialize(loaded.state))).toEqual(JSON.parse(JSON.stringify(snapshot)));
    // Como partida guardada tambien vale (aqui no hay caidas que no cuadren).
    expect(readSave(serialize(loaded.state), defaultContent()).ok).toBe(true);
  });

  it('las caidas de una vista son las apuntadas, no las que se deducen de lo que se ve', () => {
    const s = blankState({ fog: true });
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    newUnit(s, SOLDIER, 1, { x: 20, y: 20 });
    // Una vista en la que al enemigo no se le ve nada, ni su Base (hoy no pasa: los edificios son
    // publicos; es el contrato para una regla o un modo que no los enseñe): sigue en pie, porque
    // la partida no ha anunciado su caida.
    const snapshot = viewSnapshotOf(s, 0);
    snapshot.buildings = snapshot.buildings.filter((building) => building.owner !== 1);
    expect(snapshot.units.map((unit) => unit.team)).toEqual([0]);
    expect(snapshot.teams[1]!.fell).toBeNull();
    // Como partida guardada no cuadra (parece que el 1 ha caido); como vista, manda lo apuntado.
    expect(readSave(JSON.stringify(snapshot), defaultContent())).toEqual({ ok: false, error: 'badTeams' });
    const loaded = loadView(snapshot, defaultContent());
    expect(loaded.ok && loaded.state.teams[1]!.fell).toBeNull();
  });

  it('lo que no es una vista se rechaza como una partida rota', () => {
    expect(loadView(undefined, defaultContent())).toEqual({ ok: false, error: 'notJson' });
    expect(loadView('texto', defaultContent())).toEqual({ ok: false, error: 'notJson' });
    expect(loadView({ version: SAVE_VERSION }, defaultContent())).toEqual({ ok: false, error: 'badShape' });
    expect(loadView({ version: SAVE_VERSION - 1 }, defaultContent())).toEqual({ ok: false, error: 'badVersion' });
  });
});
