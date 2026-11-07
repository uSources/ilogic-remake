import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { skirmishConfig, type MatchTeam } from '@core/match';
import type { MatchSettings, TeamId } from '@core/model';
import { CURRENT_PROTOCOL, Room, type Outgoing, type RoomContext, type ServerMessage } from '@core/net';
import { serialize } from '@core/save';
import { areAllied } from '@core/teams';
import { NetClient, Table, tokenCounter } from './sim/netClient';

/** Dos personas y la IA, todos contra todos. */
const TWO_PEOPLE_AND_AI: MatchTeam[] = [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }];

const context = (): RoomContext => ({ content: defaultContent(), newToken: tokenCounter() });

/** Una sala de prueba: mapa pequeño con niebla (si no se dice otra cosa). */
function newRoom(teams: readonly MatchTeam[] = TWO_PEOPLE_AND_AI, seed = 21, settingChanges: Partial<MatchSettings> = { fog: true }): Room {
  return Room.create({ match: skirmishConfig({ seed, size: 16, teams, settingChanges }) }, context());
}

const tokensOf = (room: Room): string[] => room.people().map((seat) => seat.token);

/** Los mensajes de `outgoing` para el asiento `seat`. */
const toSeat = (outgoing: readonly Outgoing[], seat: TeamId): ServerMessage[] =>
  outgoing.filter((message) => message.seat === seat).map((message) => message.message);

const kindsTo = (outgoing: readonly Outgoing[], seat: TeamId): string[] => toSeat(outgoing, seat).map((message) => message.kind);

describe('la sala: una partida por la red como logica pura', () => {
  it('nace esperando, con una ficha distinta por persona y ninguna para la IA', () => {
    const room = newRoom();
    expect(room.status).toBe('waiting');
    expect(room.seats.map((seat) => seat.kind)).toEqual(['person', 'person', 'ai']);
    const tokens = tokensOf(room);
    expect(new Set(tokens).size).toBe(2);
    expect(tokens.every((token) => token.startsWith('ficha-24-'))).toBe(true);
  });

  it('al entrar cada persona recibe su asiento y su vista; con todos dentro, la partida empieza y se anuncia el turno', () => {
    const room = newRoom();
    const [first, second] = tokensOf(room);
    const one = room.join({ kind: 'hello', token: first!, ...CURRENT_PROTOCOL });
    expect(one.ok && kindsTo(one.messages, 0)).toEqual(['welcome', 'view']);
    expect(room.status).toBe('waiting');
    const two = room.join({ kind: 'hello', token: second!, ...CURRENT_PROTOCOL });
    expect(room.status).toBe('playing');
    // El primero recibe lo que ha pasado (empieza su turno) y a quien se espera; el segundo, su saludo, su vista y el turno.
    expect(two.ok && kindsTo(two.messages, 0)).toEqual(['events', 'turn']);
    expect(two.ok && kindsTo(two.messages, 1)).toEqual(['welcome', 'view', 'events', 'turn']);
    const turn = two.ok ? toSeat(two.messages, 1).find((message) => message.kind === 'turn') : undefined;
    expect(turn).toEqual({ kind: 'turn', team: 0, day: 1 });
  });

  it('una ficha inventada o robada no entra; otra version tampoco; lo que no es un mensaje, menos', () => {
    const room = newRoom();
    const [first] = tokensOf(room);
    expect(room.join({ kind: 'hello', token: 'ficha-24-9', ...CURRENT_PROTOCOL })).toEqual({ ok: false, error: 'badToken' });
    expect(room.join({ kind: 'hello', token: first!, protocol: CURRENT_PROTOCOL.protocol + 1, save: CURRENT_PROTOCOL.save })).toEqual({
      ok: false,
      error: 'badVersion',
    });
    expect(room.join({ kind: 'hello', token: 42, ...CURRENT_PROTOCOL })).toEqual({ ok: false, error: 'badMessage' });
    expect(room.join({ kind: 'act', action: { kind: 'surrender' } })).toEqual({ ok: false, error: 'badMessage' });
    expect(room.join(null)).toEqual({ ok: false, error: 'badMessage' });
    // Un saludo con la ficha de otro desde un asiento no cambia de asiento.
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(kindsTo(room.handle(0, { kind: 'hello', token: tokensOf(room)[1], ...CURRENT_PROTOCOL }), 0)).toEqual(['error']);
    expect(toSeat(room.handle(0, { kind: 'act', action: { kind: 'attack', uid: 'x', target: 1 } }), 0)).toEqual([
      { kind: 'error', error: 'badMessage' },
    ]);
    expect(toSeat(room.handle(0, 'hola'), 0)).toEqual([{ kind: 'error', error: 'badMessage' }]);
    expect(() => room.handle(2, { kind: 'resync' })).toThrow(/no es de una persona/);
  });

  it('un mensaje fuera de turno se rechaza con un error; rendirse vale siempre', () => {
    const room = newRoom();
    const [first] = tokensOf(room);
    room.join({ kind: 'hello', token: first!, ...CURRENT_PROTOCOL });
    // Esperando a los demas: nada se juega.
    expect(toSeat(room.handle(0, { kind: 'act', action: { kind: 'wait', uid: 1 } }), 0)).toEqual([{ kind: 'error', error: 'notPlaying' }]);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(room.state.turn).toBe(0);
    expect(toSeat(room.handle(1, { kind: 'act', action: { kind: 'wait', uid: 1 } }), 1)).toEqual([{ kind: 'error', error: 'notYourTurn' }]);
    expect(toSeat(room.handle(1, { kind: 'endTurn' }), 1)).toEqual([{ kind: 'error', error: 'notYourTurn' }]);
    // Lo que la partida rechaza llega como resultado, no como error de la sala.
    expect(toSeat(room.handle(0, { kind: 'act', action: { kind: 'wait', uid: 9999 } }), 0)).toEqual([
      { kind: 'result', result: { ok: false, reason: 'missing' } },
    ]);
    const surrender = room.handle(1, { kind: 'surrender' });
    expect(kindsTo(surrender, 1)).toEqual(['result', 'events']);
    expect(kindsTo(surrender, 0)).toEqual(['events']);
    expect(room.state.teams[1]!.resigned).toBe(true);
    // Quien no ha entrado no juega.
    room.leave(0);
    expect(toSeat(room.handle(0, { kind: 'endTurn' }), 0)).toEqual([{ kind: 'error', error: 'notJoined' }]);
  });

  it('dos personas y una IA juegan una partida con niebla solo por mensajes, y ningun cliente sabe de una unidad escondida', () => {
    const room = newRoom();
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    let hiddenMoments = 0;
    const watching = table.clients[0]!;
    table.play((current) => {
      const known = new Set(watching.state!.units.map((unit) => unit.uid));
      const hidden = current.state.units.filter((unit) => !areAllied(current.state, unit.team, watching.team!) && !known.has(unit.uid));
      if (hidden.length) hiddenMoments++;
      return current.state.day > 8;
    });
    expect(room.status).toBe('playing');
    expect(room.state.day).toBeGreaterThan(8);
    // Ha habido enemigos escondidos de verdad (si no, la comprobacion de las vistas no diria nada).
    expect(hiddenMoments).toBeGreaterThan(0);
    for (const client of table.clients) {
      expect(client.received.get('events')).toBeGreaterThan(20);
      expect(client.received.get('turn')).toBeGreaterThan(8);
      expect(serialize(client.state!)).not.toBe(serialize(room.state));
    }
    // Las dos personas se rinden: gana la IA y todos se enteran.
    table.exchange(table.clients[0]!.seat!, { kind: 'surrender' });
    table.exchange(table.clients[1]!.seat!, { kind: 'surrender' });
    expect(room.status).toBe('ended');
    for (const client of table.clients) expect(client.ended).toEqual({ status: 'decided', winners: [2], reason: 'surrender' });
    expect(toSeat(room.handle(0, { kind: 'endTurn' }), 0)).toEqual([{ kind: 'error', error: 'notPlaying' }]);
  }, 120_000);

  it('quien se va vuelve con su ficha y recibe su vista al dia y el turno; pedirla otra vez (resync) da lo mismo', () => {
    const room = newRoom();
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    table.play((current) => current.state.day > 2);
    room.leave(1);
    const back = room.join(table.clients[1]!.hello());
    expect(back.ok && kindsTo(back.messages, 1)).toEqual(['welcome', 'view', 'turn']);
    const again = room.handle(1, { kind: 'resync' });
    expect(kindsTo(again, 1)).toEqual(['view', 'turn']);
    expect(toSeat(again, 1)[0]).toEqual(back.ok ? toSeat(back.messages, 1)[1] : null);
  }, 60_000);

  it('abandonar es rendirse: los demas se enteran, y si solo queda uno la partida acaba', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'human' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const gone = room.abandon(1);
    expect(gone.every((message) => message.seat === 0)).toBe(true);
    expect(kindsTo(gone, 0)).toEqual(['events', 'ended']);
    expect(room.status).toBe('ended');
    expect(room.seats[1]).toMatchObject({ kind: 'person', joined: false });
  });

  it('guardar y recuperar la sala a mitad de partida sigue igual (la partida decide igual)', () => {
    const play = (room: Room, tokens: readonly string[], until: number): Table => {
      const table = new Table(room, tokens);
      table.joinAll();
      table.play((current) => current.state.day > until);
      return table;
    };
    const straight = play(newRoom(TWO_PEOPLE_AND_AI, 33), tokensOf(newRoom(TWO_PEOPLE_AND_AI, 33)), 7);

    const halfway = newRoom(TWO_PEOPLE_AND_AI, 33);
    const tokens = tokensOf(halfway);
    play(halfway, tokens, 4);
    const saved = JSON.parse(JSON.stringify(halfway.snapshot())) as unknown;
    const restored = Room.restore(saved, context());
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.room.status).toBe('playing');
    expect(serialize(restored.room.state)).toBe(serialize(halfway.state));
    const resumed = play(restored.room, tokens, 7);
    expect(serialize(resumed.room.state)).toBe(serialize(straight.room.state));
  }, 120_000);

  it('una sala guardada rota no se recupera', () => {
    const room = newRoom();
    const snapshot = room.snapshot();
    expect(Room.restore(null, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, version: snapshot.version + 1 }, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, seats: snapshot.seats.slice(1) }, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, seats: [{ kind: 'ai', team: 0 }, ...snapshot.seats.slice(1)] }, context())).toEqual({
      ok: false,
      error: 'badSnapshot',
    });
    expect(Room.restore({ ...snapshot, state: { ...snapshot.state, units: 'ninguna' } }, context())).toEqual({
      ok: false,
      error: 'badShape',
    });
    const ok = Room.restore(snapshot, context());
    expect(ok.ok && ok.room.snapshot()).toEqual(snapshot);
  });
});

describe('el cliente simulado', () => {
  it('se queja si el servidor le manda un error', () => {
    const client = new NetClient('x');
    expect(() => client.receive({ kind: 'error', error: 'badToken' })).toThrow(/badToken/);
  });
});
