import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { skirmishConfig, type MatchTeam } from '@core/match';
import type { GameEvent, TeamId } from '@core/model';
import { CURRENT_PROTOCOL, Room, viewChangeOf, viewSnapshotOf, type Outgoing, type RoomContext, type ServerMessage } from '@core/net';
import { unitById } from '@core/rules';
import { RoomClient, animationView, splitByTurn, type RoomPlay, type RoomReply } from '../src/net/roomClient';
import { RECONNECT_MS, ServerLink, seqStorageKey, type LinkDeps, type LinkStatus, type SocketLike } from '../src/net/serverLink';
import { parseInvite, withRoom, withoutRoom, type OnlineRoomEntry } from '../src/net/onlineRooms';
import { tokenCounter } from './sim/netClient';

// ---------------------------------------------------------------------------------------------
// Un socket falso y un reloj a mano
// ---------------------------------------------------------------------------------------------

class FakeSocket implements SocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: string[] = [];
  isClosed = false;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.isClosed = true;
  }
  /** El servidor contesta. */
  reply(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  /** Lo mandado, como mensajes. */
  get messages(): { kind: string; seq?: number }[] {
    return this.sent.map((text) => JSON.parse(text) as { kind: string; seq?: number });
  }
}

class FakeClock {
  private timers: { run: () => void; at: number }[] = [];
  now = 0;
  set(run: () => void, ms: number): unknown {
    const timer = { run, at: this.now + ms };
    this.timers.push(timer);
    return timer;
  }
  clear(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer !== handle);
  }
  /** Adelanta el reloj y dispara lo que venza. */
  advance(ms: number): void {
    this.now += ms;
    const due = this.timers.filter((timer) => timer.at <= this.now);
    this.timers = this.timers.filter((timer) => timer.at > this.now);
    for (const timer of due) timer.run();
  }
}

class FakeStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

interface Harness {
  link: ServerLink;
  sockets: FakeSocket[];
  clock: FakeClock;
  storage: FakeStorage;
  received: ServerMessage[];
  statuses: LinkStatus[];
  closed: string[];
}

function harness(storage = new FakeStorage()): Harness {
  const sockets: FakeSocket[] = [];
  const clock = new FakeClock();
  const deps: LinkDeps = {
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    setTimer: (run, ms) => clock.set(run, ms),
    clearTimer: (handle) => clock.clear(handle),
    storage,
  };
  const received: ServerMessage[] = [];
  const statuses: LinkStatus[] = [];
  const closed: string[] = [];
  const link = new ServerLink(
    'ws://servidor/rooms/ABC234/ws',
    'ABC234',
    'ficha-24-1',
    {
      onMessage: (message) => received.push(message),
      onStatus: (status) => statuses.push(status),
      onClosed: (reason) => closed.push(reason),
    },
    deps,
  );
  return { link, sockets, clock, storage, received, statuses, closed };
}

const welcome = (lastSeq: number): ServerMessage => ({
  kind: 'welcome',
  seat: 0,
  team: 0,
  ...CURRENT_PROTOCOL,
  status: 'playing',
  lastSeq,
});

/** Abre y entra (el servidor da la bienvenida). */
function opened(h: Harness, lastSeq = 0): FakeSocket {
  h.link.connect();
  const socket = h.sockets[h.sockets.length - 1]!;
  socket.onopen?.({});
  socket.reply(welcome(lastSeq));
  return socket;
}

describe('ServerLink', () => {
  it('saluda al abrirse con la ficha y la version, y numera lo que manda desde 1', () => {
    const h = harness();
    const socket = opened(h);
    expect(socket.messages[0]).toEqual({ kind: 'hello', token: 'ficha-24-1', ...CURRENT_PROTOCOL });
    expect(h.link.send({ kind: 'endTurn' })).toBe(1);
    expect(h.link.send({ kind: 'surrender' })).toBe(2);
    expect(socket.messages.slice(1)).toEqual([
      { kind: 'endTurn', seq: 1 },
      { kind: 'surrender', seq: 2 },
    ]);
    expect(h.statuses).toEqual(['online']);
  });

  it('guarda el numero de orden por sala y asiento y sigue desde el mayor entre el guardado y el del servidor', () => {
    const storage = new FakeStorage();
    const first = harness(storage);
    opened(first);
    first.link.send({ kind: 'endTurn' });
    first.link.send({ kind: 'endTurn' });
    expect(storage.getItem(seqStorageKey('ABC234', 'ficha-24-1'))).toBe('2');

    // Otra pestaña (mismo almacen) sigue desde el 2, aunque el servidor diga que atendio hasta el 1.
    const second = harness(storage);
    opened(second, 1);
    expect(second.link.send({ kind: 'endTurn' })).toBe(3);

    // Sin nada guardado, manda lo que diga el servidor.
    const third = harness(new FakeStorage());
    opened(third, 7);
    expect(third.link.send({ kind: 'endTurn' })).toBe(8);
  });

  it('tras un corte vuelve a conectar con esperas crecientes, saluda otra vez y reenvia lo que no se contesto', () => {
    const h = harness();
    const socket = opened(h);
    h.link.send({ kind: 'act', action: { kind: 'wait', uid: 3 } });
    h.link.send({ kind: 'endTurn' });
    socket.reply({ kind: 'result', seq: 1, result: { ok: true, events: [] } });
    socket.onclose?.({ code: 1006 });
    expect(h.statuses).toEqual(['online', 'reconnecting']);
    expect(h.sockets).toHaveLength(1);
    h.clock.advance(RECONNECT_MS[0]! - 1);
    expect(h.sockets).toHaveLength(1);
    h.clock.advance(1);
    expect(h.sockets).toHaveLength(2);

    // El segundo intento tambien falla: la espera siguiente es mas larga.
    h.sockets[1]!.onclose?.({ code: 1006 });
    h.clock.advance(RECONNECT_MS[0]!);
    expect(h.sockets).toHaveLength(2);
    h.clock.advance(RECONNECT_MS[1]! - RECONNECT_MS[0]!);
    expect(h.sockets).toHaveLength(3);

    const back = h.sockets[2]!;
    back.onopen?.({});
    back.reply(welcome(1));
    // Saludo y, detras, solo el mensaje 2 (el 1 ya estaba contestado).
    expect(back.messages).toEqual([
      { kind: 'hello', token: 'ficha-24-1', ...CURRENT_PROTOCOL },
      { kind: 'endTurn', seq: 2 },
    ]);
    expect(h.statuses).toEqual(['online', 'reconnecting', 'online']);
  });

  it('no reenvia lo que el servidor ya atendio (su welcome lo dice) ni reintenta un cierre sin arreglo', () => {
    const h = harness();
    const socket = opened(h);
    h.link.send({ kind: 'endTurn' });
    socket.onclose?.({ code: 1006 });
    h.clock.advance(RECONNECT_MS[0]!);
    const back = h.sockets[1]!;
    back.onopen?.({});
    back.reply(welcome(1));
    expect(back.messages).toHaveLength(1);

    back.onclose?.({ code: 4409 });
    h.clock.advance(60000);
    expect(h.sockets).toHaveLength(2);
    expect(h.closed).toEqual(['replaced']);
    expect(h.statuses.at(-1)).toBe('closed');
  });

  it('si falta un step pide la vista otra vez y no entrega el mensaje con hueco; una vista entera es un punto de partida', () => {
    const h = harness();
    const socket = opened(h);
    const view = { kind: 'view', step: 4, view: {} } as unknown as ServerMessage;
    socket.reply(view);
    socket.reply({ kind: 'turn', step: 5, team: 0, day: 1 });
    socket.reply({ kind: 'turn', step: 7, team: 1, day: 1 });
    expect(h.received.map((message) => message.kind)).toEqual(['welcome', 'view', 'turn']);
    expect(socket.messages.at(-1)).toEqual({ kind: 'resync' });
    socket.reply({ kind: 'view', step: 9, view: {} } as unknown as ServerMessage);
    socket.reply({ kind: 'turn', step: 10, team: 1, day: 1 });
    expect(h.received).toHaveLength(5);
  });

  it('cerrar a proposito no reintenta', () => {
    const h = harness();
    const socket = opened(h);
    h.link.close();
    expect(socket.isClosed).toBe(true);
    socket.onclose?.({ code: 1000 });
    h.clock.advance(60000);
    expect(h.sockets).toHaveLength(1);
    expect(h.statuses.at(-1)).toBe('closed');
  });
});

// ---------------------------------------------------------------------------------------------
// RoomClient, con la sala de verdad del nucleo detras
// ---------------------------------------------------------------------------------------------

const TWO_PEOPLE_AND_AI: MatchTeam[] = [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }];
const context = (): RoomContext => ({ content: defaultContent(), newToken: tokenCounter() });

/** Una sala con un cliente de verdad sentado en el asiento 0 (los mensajes van directos, sin red). */
function seated(teams = TWO_PEOPLE_AND_AI) {
  const room = Room.create({ match: skirmishConfig({ seed: 21, size: 16, teams, settingChanges: { fog: true } }) }, context());
  const tokens = room.personSeats().map((seat) => seat.token);
  const plays: RoomPlay[] = [];
  let seq = 0;
  const resyncs: number[] = [];
  const client = new RoomClient(
    {
      send: (message) => {
        seq += 1;
        deliver(room.handle(0, { ...message, seq }));
        return seq;
      },
      resync: () => {
        resyncs.push(seq);
        deliver(room.handle(0, { kind: 'resync' }));
      },
    },
    defaultContent(),
    { onPlay: (play) => plays.push(play) },
  );
  const deliver = (outgoing: Outgoing[]) => {
    for (const { seat, message } of outgoing) if (seat === 0) client.receive(message);
  };
  const join = (seat: number) => {
    const result = room.join({ kind: 'hello', token: tokens[seat]!, ...CURRENT_PROTOCOL });
    if (!result.ok) throw new Error(result.error);
    deliver(result.messages);
  };
  return { room, client, plays, join, deliver, resyncs, tokens };
}

const kinds = (plays: RoomPlay[]) => plays.map((play) => play.kind);

describe('RoomClient', () => {
  it('al entrar lee su vista (loadView) y sabe a quien se espera; al entrar todos la partida empieza', () => {
    const { room, client, plays, join } = seated();
    join(0);
    expect(client.seat).toBe(0);
    expect(client.team).toBe(0);
    expect(client.status).toBe('waiting');
    expect(client.state?.teams).toHaveLength(3);
    expect(kinds(plays)).toEqual(['view']);
    join(1);
    expect(room.status).toBe('playing');
    expect(client.status).toBe('playing');
    expect(client.isMyTurn).toBe(true);
    expect(kinds(plays).at(-1)).toBe('turn');
  });

  it('una accion propia: su resultado llega por la promesa y su eco pone la vista al dia sin animarse', async () => {
    const { client, plays, join } = seated();
    join(0);
    join(1);
    const before = plays.length;
    const unit = client.state!.units.find((candidate) => candidate.team === 0)!;
    const echo = client.nextEcho();
    const reply = await client.act({ kind: 'wait', uid: unit.uid });
    expect(reply.ok).toBe(true);
    const after = await echo;
    expect(unitById(after, unit.uid)?.turnState).toBe('done');
    expect(client.state).toBe(after);
    // Nada que animar: el eco no es una jugada.
    expect(plays.length).toBe(before);
  });

  it('una accion rechazada por la sala contesta con su motivo', async () => {
    const { client, join } = seated();
    join(0);
    // Antes de que entren todos la sala no esta jugando.
    const reply: RoomReply = await client.act({ kind: 'wait', uid: 1 });
    expect(reply).toEqual({ ok: false, reason: 'notPlaying' });
  });

  it('al acabar el turno, lo de los demas llega como un lote: se anima contra la vista de antes y deja la de despues', async () => {
    const { room, client, plays, join, deliver, tokens } = seated();
    join(0);
    join(1);
    const mine = client.state!;
    const playsBefore = plays.length;
    client.endTurn();
    // Juega la persona 2 (acaba su turno sin mas) y la IA; luego vuelve a tocarle al 0.
    deliver(room.handle(1, { kind: 'endTurn', seq: 1 }));
    expect(room.awaiting?.token).toBe(tokens[0]);
    const batches = plays.slice(playsBefore).filter((play): play is Extract<RoomPlay, { kind: 'events' }> => play.kind === 'events');
    expect(batches.length).toBeGreaterThan(0);
    expect(batches[0]!.before).toBe(mine);
    expect(batches[batches.length - 1]!.after).toBe(client.state);
    // Los lotes van seguidos: la vista de antes de uno es la de despues del anterior.
    for (let i = 1; i < batches.length; i++) expect(batches[i]!.before).toBe(batches[i - 1]!.after);
    const allEvents = batches.flatMap((batch) => batch.events);
    expect(allEvents.some((event) => event.kind === 'turnStart' && event.actor === 1)).toBe(true);
    expect(allEvents.some((event) => event.kind === 'turnStart' && event.actor === 2)).toBe(true);
    expect(allEvents.some((event) => event.kind === 'newDay')).toBe(true);
    expect(kinds(plays).at(-1)).toBe('turn');
    expect(client.isMyTurn).toBe(true);
    expect(client.state!.day).toBe(2);
  });

  it('next() da las jugadas en orden y espera si no hay', async () => {
    const { client, join } = seated();
    join(0);
    const first = await client.next();
    expect(first.kind).toBe('view');
    const pending = client.next();
    join(1);
    // Al empezar: el paso que empieza el turno propio y, detras, a quien se espera.
    expect((await pending).kind).toBe('events');
    expect((await client.next()).kind).toBe('turn');
  });

  it('un lote con varios turnos se parte por turnos para anunciar cada uno', () => {
    const events: GameEvent[] = [
      { kind: 'turnEnd', actor: 0 as TeamId, day: 1 },
      { kind: 'turnStart', actor: 1 as TeamId, day: 1 },
      { kind: 'wait', actor: 1 as TeamId, uid: 9 },
      { kind: 'turnStart', actor: 2 as TeamId, day: 1 },
    ] as GameEvent[];
    expect(splitByTurn(events).map((chunk) => [chunk.team, chunk.events.length])).toEqual([
      [null, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('la vista con la que se anima lleva las unidades que ya no estan en la de despues', () => {
    const { client, join } = seated();
    join(0);
    const before = client.state!;
    const gone = before.units[0]!;
    const after = { ...before, units: before.units.filter((unit) => unit !== gone) };
    const view = animationView(before, after);
    expect(view.units).toContain(gone);
    expect(view.units).toHaveLength(before.units.length);
    expect(animationView(before, before)).toBe(before);
  });

  it('una vista que no se puede leer se pide otra vez', () => {
    const { client, resyncs } = seated();
    client.receive({ kind: 'welcome', seat: 0, team: 0, ...CURRENT_PROTOCOL, status: 'playing', lastSeq: 0 });
    client.receive({ kind: 'view', step: 1, view: { version: -1 } as never });
    expect(resyncs).toHaveLength(1);
    expect(client.state).toBeNull();
  });

  it('un events sin vista entera antes pide la vista', () => {
    const { client, resyncs } = seated();
    client.receive({ kind: 'events', step: 2, actor: 1, events: [], view: viewChangeOf(viewSnapshotOf(seated().room.state, 0)) });
    expect(resyncs).toHaveLength(1);
  });
});

describe('Mis partidas en línea', () => {
  const entry = (code: string, at: number): OnlineRoomEntry => ({ code, token: 't', seat: 0, team: 0, teams: 2, status: 'waiting', at });

  it('pone la sala al dia (o la añade) la primera, y se puede quitar', () => {
    const list = withRoom([entry('AAAAAA', 1)], entry('BBBBBB', 2));
    expect(list.map((room) => room.code)).toEqual(['BBBBBB', 'AAAAAA']);
    expect(withRoom(list, { ...entry('AAAAAA', 3), status: 'playing' }).map((room) => [room.code, room.status])).toEqual([
      ['AAAAAA', 'playing'],
      ['BBBBBB', 'waiting'],
    ]);
    expect(withoutRoom(list, 'BBBBBB').map((room) => room.code)).toEqual(['AAAAAA']);
  });

  it('entiende un enlace de invitacion entero, su parte tras el # o "CODIGO/FICHA"', () => {
    const token = 'AbC_-123456789012345';
    expect(parseInvite(`https://usources.github.io/ilogic/#/sala/ABC234/${token}`)).toEqual({ code: 'ABC234', token });
    expect(parseInvite(`#/sala/abc234/${token}`)).toEqual({ code: 'ABC234', token });
    expect(parseInvite(`ABC234/${token}`)).toEqual({ code: 'ABC234', token });
    expect(parseInvite('ABC234')).toBeNull();
    expect(parseInvite('')).toBeNull();
  });
});
