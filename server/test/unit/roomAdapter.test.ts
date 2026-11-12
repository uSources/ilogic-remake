import { describe, expect, it } from 'vitest';
import { CURRENT_PROTOCOL, type Outgoing, type SeatId } from '@core/net';
import { RoomAdapter } from '../../src/roomAdapter';
import type { RoomRequest } from '../../src/roomRequest';

/** Dos personas y la IA, en un mapa pequeño con niebla. */
const request = (): RoomRequest => ({
  match: {
    seed: 21,
    size: 20,
    settingChanges: { fog: true },
    teams: [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }],
  },
});

const kindsTo = (outgoing: readonly Outgoing[], seat: SeatId): string[] =>
  outgoing.filter((message) => message.seat === seat).map((message) => message.message.kind);

const hello = (token: string) => ({ kind: 'hello', token, ...CURRENT_PROTOCOL });

/** La sala con las dos personas dentro. */
function joinedRoom(): { adapter: RoomAdapter; tokens: string[] } {
  const adapter = RoomAdapter.create(request());
  const tokens = adapter.invitations().map((seat) => seat.token);
  for (const token of tokens) expect(adapter.join(hello(token)).ok).toBe(true);
  return { adapter, tokens };
}

describe('el adaptador de la sala', () => {
  it('crea la sala esperando, con una ficha de 32 letras por persona, y el vestibulo no cuenta nada de la partida', () => {
    const adapter = RoomAdapter.create(request());
    expect(adapter.status).toBe('waiting');
    expect(adapter.invitations().map((seat) => [seat.seat, seat.team])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    for (const seat of adapter.invitations()) expect(seat.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(adapter.lobby()).toEqual({
      status: 'waiting',
      ...CURRENT_PROTOCOL,
      seats: [
        { seat: 0, team: 0, kind: 'person', joined: false },
        { seat: 1, team: 1, kind: 'person', joined: false },
        { seat: 2, team: 2, kind: 'ai', joined: false },
      ],
    });
    expect(Object.keys(adapter.lobby())).toEqual(['status', 'protocol', 'save', 'seats']);
    expect(adapter.awaiting()).toBeNull();
    expect(adapter.absentSeats()).toEqual([0, 1]);
  });

  it('con todos dentro la partida empieza y se espera al primero; irse y volver con la ficha', () => {
    const { adapter, tokens } = joinedRoom();
    expect(adapter.status).toBe('playing');
    expect(adapter.awaiting()).toEqual({ seat: 0, day: 1 });
    expect(adapter.lobby().seats.map((seat) => seat.joined)).toEqual([true, true, false]);
    const first = adapter.join(hello(tokens[0]!));
    expect(first.ok && first.connection).toBe(3);
    adapter.leave(0, 3);
    expect(adapter.absentSeats()).toEqual([0]);
    const back = adapter.rejoin(tokens[0]!);
    expect(back.ok && kindsTo(back.messages, 0)).toEqual(['welcome', 'view', 'turn']);
  });

  it('atiende los mensajes de un asiento y cuenta los rechazados; el reloj acaba el turno de quien se espera', () => {
    const { adapter } = joinedRoom();
    expect(kindsTo(adapter.handle(1, { kind: 'endTurn', seq: 1 }), 1)).toEqual(['error']);
    expect(adapter.rejectionsOf(1)).toBe(1);
    expect(adapter.timeOut(1)).toEqual([]);
    const outgoing = adapter.timeOut(0);
    expect(kindsTo(outgoing, 1)).toContain('turn');
    expect(adapter.awaiting()).toEqual({ seat: 1, day: 1 });
    // El numero de orden del mensaje rechazado ya se gasto: el siguiente.
    expect(kindsTo(adapter.handle(1, { kind: 'endTurn', seq: 2 }), 0)).toContain('turn');
    expect(adapter.awaiting()).toEqual({ seat: 0, day: 2 });
  });

  it('si la IA se queda a medias (presupuesto de pasos), lo dice y se sigue hasta que toca a una persona', () => {
    const adapter = RoomAdapter.create(request(), 1);
    for (const seat of adapter.invitations()) expect(adapter.join(hello(seat.token)).ok).toBe(true);
    const finish = (): Outgoing[] => {
      const outgoing: Outgoing[] = [];
      while (adapter.pending()) outgoing.push(...adapter.continueMatch());
      return outgoing;
    };
    finish();
    expect(adapter.awaiting()).toEqual({ seat: 0, day: 1 });
    adapter.timeOut(0);
    finish();
    adapter.timeOut(1);
    expect(adapter.pending()).toBe(true);
    expect(adapter.awaiting()).toBeNull();
    const outgoing = finish();
    expect(adapter.awaiting()).toEqual({ seat: 0, day: 2 });
    // Lo que paso en el turno de la IA llega a las personas al seguir, no se pierde.
    expect(kindsTo(outgoing, 0)).toContain('turn');
  });

  it('un asiento que no llega pasa a la IA y la partida empieza sin el', () => {
    const adapter = RoomAdapter.create(request());
    const [first] = adapter.invitations();
    adapter.join(hello(first!.token));
    for (const seat of adapter.absentSeats()) adapter.replaceWithAi(seat);
    expect(adapter.status).toBe('playing');
    expect(adapter.lobby().seats.map((seat) => seat.kind)).toEqual(['person', 'ai', 'ai']);
  });

  it('guardada y recuperada es la misma sala, con nadie dentro; lo que no es una sala no se recupera', () => {
    const { adapter, tokens } = joinedRoom();
    const restored = RoomAdapter.restore(JSON.parse(JSON.stringify(adapter.snapshot())));
    expect(restored).not.toBeNull();
    expect(restored!.status).toBe('playing');
    expect(restored!.absentSeats()).toEqual([0, 1]);
    expect(restored!.rejoin(tokens[1]!).ok).toBe(true);
    expect(RoomAdapter.restore({ version: 999 })).toBeNull();
    expect(RoomAdapter.restore('nada')).toBeNull();
  });
});
