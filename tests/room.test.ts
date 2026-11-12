import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { skirmishConfig, type MatchConfig, type MatchTeam } from '@core/match';
import type { ActionResult, GameAction, GameActionKind, MatchSettings, TeamId } from '@core/model';
import {
  CURRENT_PROTOCOL,
  Room,
  ROOM_SNAPSHOT_VERSION,
  type ClientMessage,
  type Outgoing,
  type RoomContext,
  type ServerMessage,
} from '@core/net';
import { unitById } from '@core/rules';
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

const tokensOf = (room: Room): string[] => room.personSeats().map((seat) => seat.token);

/** Los mensajes de `outgoing` para el asiento `seat`. */
const toSeat = (outgoing: readonly Outgoing[], seat: TeamId): ServerMessage[] =>
  outgoing.filter((message) => message.seat === seat).map((message) => message.message);

const kindsTo = (outgoing: readonly Outgoing[], seat: TeamId): string[] => toSeat(outgoing, seat).map((message) => message.kind);

/** Lo que dice un mensaje sin su numero (para compararlo). */
const unnumbered = (message: ServerMessage): Omit<ServerMessage, 'step'> => {
  const { step: _step, ...rest } = message as ServerMessage & { step?: number };
  return rest;
};

/** Un mensaje con efecto, numerado a mano. */
let nextSeq = 1000;
const ordered = <M extends Omit<Extract<ClientMessage, { seq: number }>, 'seq'>>(message: M): M & { seq: number } => ({
  ...message,
  seq: nextSeq++,
});

describe('la sala: una partida por la red como logica pura', () => {
  it('nace esperando, con una ficha distinta por persona y ninguna para la IA', () => {
    const room = newRoom();
    expect(room.status).toBe('waiting');
    expect(room.seats.map((seat) => [seat.id, seat.team, seat.kind])).toEqual([
      [0, 0, 'person'],
      [1, 1, 'person'],
      [2, 2, 'ai'],
    ]);
    const tokens = tokensOf(room);
    expect(new Set(tokens).size).toBe(2);
    expect(tokens.every((token) => token.startsWith('ficha-24-'))).toBe(true);
  });

  it('al entrar cada persona recibe su asiento y su vista; con todos dentro, la partida empieza y se anuncia el turno', () => {
    const room = newRoom();
    const [first, second] = tokensOf(room);
    const one = room.join({ kind: 'hello', token: first!, ...CURRENT_PROTOCOL });
    expect(one.ok && kindsTo(one.messages, 0)).toEqual(['welcome', 'view']);
    expect(one.ok && one.connection).toBe(1);
    expect(room.status).toBe('waiting');
    const two = room.join({ kind: 'hello', token: second!, ...CURRENT_PROTOCOL });
    expect(room.status).toBe('playing');
    // El primero recibe lo que ha pasado (empieza su turno) y a quien se espera; el segundo, su saludo, su vista y el turno.
    expect(two.ok && kindsTo(two.messages, 0)).toEqual(['events', 'turn']);
    expect(two.ok && kindsTo(two.messages, 1)).toEqual(['welcome', 'view', 'events', 'turn']);
    const turn = two.ok ? toSeat(two.messages, 1).find((message) => message.kind === 'turn') : undefined;
    expect(turn).toEqual({ kind: 'turn', step: 3, team: 0, day: 1 });
    const welcome = two.ok ? toSeat(two.messages, 1)[0] : undefined;
    expect(welcome).toMatchObject({ kind: 'welcome', seat: 1, team: 1, status: 'waiting', lastSeq: 0 });
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
    expect(room.join({ kind: 'act', seq: 1, action: { kind: 'surrender' } })).toEqual({ ok: false, error: 'badMessage' });
    expect(room.join(null)).toEqual({ ok: false, error: 'badMessage' });
    // Un saludo con la ficha de otro desde un asiento no cambia de asiento.
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(kindsTo(room.handle(0, { kind: 'hello', token: tokensOf(room)[1], ...CURRENT_PROTOCOL }), 0)).toEqual(['error']);
    expect(toSeat(room.handle(0, { kind: 'act', seq: 1, action: { kind: 'attack', uid: 'x', target: 1 } }), 0)).toEqual([
      { kind: 'error', error: 'badMessage' },
    ]);
    expect(toSeat(room.handle(0, 'hola'), 0)).toEqual([{ kind: 'error', error: 'badMessage' }]);
    expect(toSeat(room.handle(2, { kind: 'resync' }), 2)).toEqual([{ kind: 'error', error: 'noSeat' }]);
    expect(toSeat(room.handle(7, { kind: 'resync' }), 7)).toEqual([{ kind: 'error', error: 'noSeat' }]);
    expect(room.rejectionsOf(0)).toBe(3);
    expect(room.rejectionsOf(2)).toBe(1);
  });

  it('un mensaje fuera de turno se rechaza con un error; rendirse vale siempre', () => {
    const room = newRoom();
    const [first] = tokensOf(room);
    room.join({ kind: 'hello', token: first!, ...CURRENT_PROTOCOL });
    // Esperando a los demas: nada se juega.
    expect(toSeat(room.handle(0, ordered({ kind: 'act', action: { kind: 'wait', uid: 1 } })), 0)).toEqual([
      { kind: 'error', error: 'notPlaying', seq: nextSeq - 1 },
    ]);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(room.state.turn).toBe(0);
    expect(toSeat(room.handle(1, ordered({ kind: 'act', action: { kind: 'wait', uid: 1 } })), 1)).toEqual([
      { kind: 'error', error: 'notYourTurn', seq: nextSeq - 1 },
    ]);
    expect(toSeat(room.handle(1, ordered({ kind: 'endTurn' })), 1)).toEqual([{ kind: 'error', error: 'notYourTurn', seq: nextSeq - 1 }]);
    // Lo que la partida rechaza llega como resultado, no como error de la sala.
    expect(toSeat(room.handle(0, ordered({ kind: 'act', action: { kind: 'wait', uid: 9999 } })), 0)).toEqual([
      { kind: 'result', seq: nextSeq - 1, result: { ok: false, reason: 'missing' } },
    ]);
    const surrender = room.handle(1, ordered({ kind: 'surrender' }));
    expect(kindsTo(surrender, 1)).toEqual(['result', 'events']);
    expect(kindsTo(surrender, 0)).toEqual(['events']);
    expect(room.state.teams[1]!.resigned).toBe(true);
    // Quien no ha entrado no juega.
    room.leave(0, table.clients[0]!.connection!);
    expect(toSeat(room.handle(0, ordered({ kind: 'endTurn' })), 0)).toEqual([{ kind: 'error', error: 'notJoined', seq: nextSeq - 1 }]);
  });

  it('un mensaje repetido (el mismo numero de orden, tras un corte) no se vuelve a hacer', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'ai' }], 8);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const client = table.clients[0]!;
    const { state } = room;
    const isFree = (at: { x: number; y: number }) => !state.units.some((unit) => unit.x === at.x && unit.y === at.y);
    const city = state.buildings.find((building) => building.owner === 0 && building.type === 'City' && isFree(building))!;
    const action: GameAction = { kind: 'buy', at: { x: city.x, y: city.y }, unitType: 'Soldier' };
    const buy = client.ordered({ kind: 'act', action });
    const unitsBefore = room.state.units.length;
    table.exchange(0, buy);
    expect(room.state.units.length).toBe(unitsBefore + 1);
    // La conexion se corta y el cliente, al volver, reenvia lo ultimo.
    room.leave(0, client.connection!);
    table.join(client);
    expect(() => table.exchange(0, buy)).toThrow(/stale/);
    expect(room.state.units.length).toBe(unitsBefore + 1);
    // Un fin de turno repetido tampoco acaba el turno siguiente.
    const endTurn = client.ordered({ kind: 'endTurn' });
    table.exchange(0, endTurn);
    expect(room.state.day).toBe(2);
    expect(toSeat(room.handle(0, endTurn), 0)).toEqual([{ kind: 'error', error: 'stale', seq: client.seq }]);
    expect(room.state.day).toBe(2);
    expect(room.awaiting?.team).toBe(0);
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
    table.exchange(0, table.clients[0]!.ordered({ kind: 'surrender' }));
    table.exchange(1, table.clients[1]!.ordered({ kind: 'surrender' }));
    expect(room.status).toBe('ended');
    for (const client of table.clients) expect(client.ended).toEqual({ status: 'decided', winners: [2], reason: 'surrender' });
    expect(toSeat(room.handle(0, ordered({ kind: 'endTurn' })), 0)).toEqual([{ kind: 'error', error: 'notPlaying', seq: nextSeq - 1 }]);
  }, 120_000);

  it('los pasos de los demas van en un solo mensaje por turno: nadie cuenta lo que hacen donde no ve', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'ai' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const client = table.clients[0]!;
    const before = client.received.get('events') ?? 0;
    const out = table.exchange(0, client.ordered({ kind: 'endTurn' }));
    // Lo suyo (acabar el turno) llega al momento; todo el turno de la IA (y el fin de ronda, y el
    // principio del turno siguiente) en un solo `events`; luego el turno.
    const events = toSeat(out, 0).filter((message) => message.kind === 'events');
    expect(events).toHaveLength(2);
    expect(events.map((message) => (message.kind === 'events' ? message.events[0]?.kind : null))).toEqual(['turnEnd', 'turnStart']);
    const batch = events[1];
    if (batch?.kind !== 'events') throw new Error('se esperaba el lote del turno de la IA');
    expect(batch.events.some((event) => event.kind === 'newDay')).toBe(true);
    expect(kindsTo(out, 0).at(-1)).toBe('turn');
    expect(client.received.get('events')).toBe(before + 2);
    // Y lo que viene en `events` no repite lo fijo de la partida.
    const change = batch.view;
    expect(change).not.toHaveProperty('map');
    expect(change).not.toHaveProperty('settings');
    expect(change).toHaveProperty('units');
  });

  it('quien se va vuelve con su ficha por otra conexion y recibe su vista al dia y el turno; la conexion vieja ya no cuenta', () => {
    const room = newRoom();
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    table.play((current) => current.state.day > 2);
    const client = table.clients[1]!;
    const stale = client.connection!;
    room.leave(1, stale);
    const back = room.join(client.hello());
    expect(back.ok && kindsTo(back.messages, 1)).toEqual(['welcome', 'view', 'turn']);
    expect(back.ok && back.connection).toBeGreaterThan(stale);
    // Irse por la conexion vieja no saca a la nueva.
    room.leave(1, stale);
    const again = room.handle(1, { kind: 'resync' });
    expect(kindsTo(again, 1)).toEqual(['view', 'turn']);
    expect(unnumbered(toSeat(again, 1)[0]!)).toEqual(back.ok ? unnumbered(toSeat(back.messages, 1)[1]!) : null);
    // Dos pestañas con la misma ficha: la ultima en entrar es la que esta.
    const second = room.join(client.hello());
    expect(second.ok && second.connection).toBeGreaterThan(back.ok ? back.connection : 0);
    expect(room.seats[1]).toMatchObject({ kind: 'person', connection: second.ok ? second.connection : null });
  }, 60_000);

  it('abandonar es rendirse: los demas se enteran, y si solo queda uno la partida acaba', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'human' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const gone = room.abandon(1);
    expect(gone.every((message) => message.seat === 0)).toBe(true);
    expect(kindsTo(gone, 0)).toEqual(['events', 'ended']);
    expect(room.status).toBe('ended');
    expect(room.seats[1]).toMatchObject({ kind: 'person', connection: null });
    expect(room.abandon(2)).toEqual([{ seat: 2, message: { kind: 'error', error: 'noSeat' } }]);
  });

  it('quien abandona antes de entrar se rinde y ya no se le espera: la partida empieza con los demas', () => {
    const room = newRoom();
    const [first] = tokensOf(room);
    room.join({ kind: 'hello', token: first!, ...CURRENT_PROTOCOL });
    expect(kindsTo(room.abandon(1), 0)).toEqual(['events', 'turn']);
    expect(room.status).toBe('playing');
    expect(room.state.teams[1]!.resigned).toBe(true);
    expect(room.awaiting?.team).toBe(0);
    // Al reves: abandona el primero y el segundo entra despues.
    const other = newRoom();
    other.abandon(0);
    expect(other.status).toBe('waiting');
    const joined = other.join({ kind: 'hello', token: tokensOf(other)[1]!, ...CURRENT_PROTOCOL });
    expect(other.status).toBe('playing');
    expect(joined.ok && kindsTo(joined.messages, 1)).toEqual(['welcome', 'view', 'events', 'turn']);
    expect(other.awaiting?.team).toBe(1);
  });

  it('un asiento pasa a la IA (quien no vuelve): juega el servidor desde su turno, y los demas siguen', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'human' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(room.awaiting?.team).toBe(0);
    const out = room.replaceWithAi(0);
    expect(room.seats[0]).toEqual({ kind: 'ai', id: 0, team: 0 });
    // La IA ha jugado el turno del 0: al 1 le llega lo que ve y su turno.
    expect(kindsTo(out, 1)).toEqual(['events', 'turn']);
    expect(room.awaiting?.team).toBe(1);
    expect(room.state.turn).toBe(1);
    expect(room.handle(0, { kind: 'resync' })).toEqual([{ seat: 0, message: { kind: 'error', error: 'noSeat' } }]);
    // Y una sala que espera a alguien que pasa a la IA, empieza.
    const waiting = newRoom();
    waiting.join({ kind: 'hello', token: tokensOf(waiting)[0]!, ...CURRENT_PROTOCOL });
    waiting.replaceWithAi(1);
    expect(waiting.status).toBe('playing');
    // La sala guardada con un asiento de la IA en un equipo de una persona se recupera igual.
    const restored = Room.restore(waiting.snapshot(), context());
    expect(restored.ok && restored.room.seats[1]).toEqual({ kind: 'ai', id: 1, team: 1 });
  });

  it('se le acaba el tiempo a quien se espera: su turno acaba, este dentro o no', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'human' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    expect(room.endTurnOf(1)).toEqual([]);
    room.leave(0, table.clients[0]!.connection!);
    const out = room.endTurnOf(0);
    expect(room.awaiting?.team).toBe(1);
    expect(kindsTo(out, 1)).toEqual(['events', 'turn']);
    expect(kindsTo(out, 0)).toEqual([]);
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
    // Nadie esta dentro al recuperarla: cada uno vuelve a saludar.
    expect(restored.room.personSeats().map((seat) => seat.connection)).toEqual([null, null]);
    const resumed = play(restored.room, tokens, 7);
    expect(serialize(resumed.room.state)).toBe(serialize(straight.room.state));
  }, 120_000);

  it('una sala guardada esperando se recupera esperando, y empieza cuando entran', () => {
    const room = newRoom();
    room.join({ kind: 'hello', token: tokensOf(room)[0]!, ...CURRENT_PROTOCOL });
    const restored = Room.restore(room.snapshot(), context());
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.room.status).toBe('waiting');
    const table = new Table(restored.room, tokensOf(restored.room));
    table.joinAll();
    expect(restored.room.status).toBe('playing');
    expect(table.clients[0]!.turn).toEqual({ team: 0, day: 1 });
  });

  it('una sala guardada rota no se recupera', () => {
    const room = newRoom();
    const snapshot = room.snapshot();
    expect(snapshot.version).toBe(ROOM_SNAPSHOT_VERSION);
    expect(Room.restore(null, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, version: snapshot.version + 1 }, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, seats: snapshot.seats.slice(1) }, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, seats: [{ kind: 'ai', id: 0, team: 0 }, ...snapshot.seats.slice(1)] }, context()).ok).toBe(true);
    expect(
      Room.restore({ ...snapshot, seats: [{ ...snapshot.seats[2], kind: 'person', token: 'x' }, ...snapshot.seats.slice(1)] }, context()),
    ).toEqual({
      ok: false,
      error: 'badSnapshot',
    });
    expect(Room.restore({ ...snapshot, nextConnection: 0 }, context())).toEqual({ ok: false, error: 'badSnapshot' });
    expect(Room.restore({ ...snapshot, state: { ...snapshot.state, units: 'ninguna' } }, context())).toEqual({
      ok: false,
      error: 'badShape',
    });
    const ok = Room.restore(snapshot, context());
    expect(ok.ok && ok.room.snapshot()).toEqual(snapshot);
  });
});

/**
 * Una partida preparada a mano con niebla: el equipo 0 (persona) con un soldado y un transporte en
 * una esquina; el equipo 1 (persona) con un tanque y un transporte en la otra, escondidos.
 */
function hiddenArmyMatch(): MatchConfig {
  return {
    mode: 'sandbox',
    size: 16,
    settingChanges: { fog: true },
    teams: [{ controller: 'human' }, { controller: 'human' }],
    seed: 4,
    buildings: [
      { type: 'Base', owner: 0, at: { x: 0, y: 0 } },
      { type: 'Base', owner: 1, at: { x: 15, y: 15 } },
    ],
    units: [
      { type: 'Soldier', team: 0, at: { x: 1, y: 1 } },
      { type: 'Transport', team: 0, at: { x: 1, y: 2 } },
      { type: 'Tank', team: 1, at: { x: 14, y: 14 } },
      { type: 'Transport', team: 1, at: { x: 14, y: 13 } },
    ],
  };
}

const lastResultOf = (client: NetClient): ActionResult | null => client.lastResult;

describe('la sala no delata lo que un equipo no conoce al rechazar una accion', () => {
  /** La accion de cada tipo que nombra a `other` (una unidad o escuadra que no es nuestra), o null si no nombra nada. */
  const naming = (mine: number, carrier: number, other: number): { readonly [K in GameActionKind]: GameAction | null } => ({
    move: { kind: 'move', uid: other, to: { x: 2, y: 2 } },
    undoMove: { kind: 'undoMove', uid: other },
    attack: { kind: 'attack', uid: mine, target: other },
    capture: { kind: 'capture', uid: other },
    merge: { kind: 'merge', uid: mine, into: other },
    load: { kind: 'load', uid: mine, into: other },
    unload: { kind: 'unload', uid: carrier, passenger: other, to: { x: 2, y: 2 } },
    supply: { kind: 'supply', uid: other },
    wait: { kind: 'wait', uid: other },
    deleteUnit: { kind: 'deleteUnit', uid: other },
    buy: null,
    usePower: null,
    gotoStep: { kind: 'gotoStep', uid: other },
    giveStandingOrder: { kind: 'giveStandingOrder', uids: [other], order: { kind: 'defend', at: { x: 2, y: 2 } } },
    cancelStandingOrder: { kind: 'cancelStandingOrder', uids: [other] },
    finishStandingOrder: { kind: 'finishStandingOrder', uid: other },
    formSquad: { kind: 'formSquad', uids: [mine, other] },
    setGroup: { kind: 'setGroup', uids: [other], key: 1 },
    addToGroup: { kind: 'addToGroup', uids: [other], key: 1 },
    leaveSquad: { kind: 'leaveSquad', uids: [other] },
    renameSquad: { kind: 'renameSquad', squad: other, name: 'x' },
    disbandSquad: { kind: 'disbandSquad', squad: other },
    surrender: null,
    startTurn: null,
    endTurn: null,
  });

  it('para cada tipo de accion, una unidad o escuadra enemiga escondida se rechaza igual que una que no existe', () => {
    const room = Room.create({ match: hiddenArmyMatch() }, context());
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const [me, rival] = table.clients as [NetClient, NetClient];
    // El rival forma una escuadra con su tanque (escondida para nosotros) y acaba su turno.
    table.exchange(0, me.ordered({ kind: 'endTurn' }));
    const tank = room.state.units.find((unit) => unit.team === 1 && unit.type === 'Tank')!;
    const formSquad: GameAction = { kind: 'formSquad', uids: [tank.uid] };
    table.exchange(1, rival.ordered({ kind: 'act', action: formSquad }));
    table.exchange(1, rival.ordered({ kind: 'endTurn' }));
    expect(room.awaiting?.team).toBe(0);
    const hiddenSquad = room.state.squads![0]!.id;
    const mine = me.state!.units.find((unit) => unit.team === 0 && unit.type === 'Soldier')!.uid;
    const carrier = me.state!.units.find((unit) => unit.team === 0 && unit.type === 'Transport')!.uid;
    expect(unitById(me.state!, tank.uid)).toBeUndefined();
    const nowhere = room.state.nextUid + 100;
    const reasonOf = (action: GameAction): string => {
      me.lastResult = null;
      table.exchange(0, me.ordered({ kind: 'act', action }));
      // TypeScript cree que sigue siendo null: lo ha puesto el servidor por el camino.
      const result = lastResultOf(me);
      if (!result) throw new Error('sin resultado');
      return result.ok ? 'ok' : result.reason;
    };
    const hidden = naming(mine, carrier, tank.uid);
    const missing = naming(mine, carrier, nowhere);
    for (const kind of Object.keys(hidden) as GameActionKind[]) {
      const action = hidden[kind];
      if (!action) continue;
      const withSquad = kind === 'renameSquad' || kind === 'disbandSquad';
      const probe = withSquad ? { ...action, squad: hiddenSquad } : action;
      expect(reasonOf(probe), kind).toBe('missing');
      expect(reasonOf(missing[kind]!), kind).toBe('missing');
    }
    expect(room.rejectionsOf(0)).toBeGreaterThan(30);
  });
});

/** Un bloqueador (ve 0 casillas) del equipo 0 en (8, 8) y, si se pide, un tanque enemigo escondido a dos casillas, en (10, 8). */
function blindMatch(withFoe: boolean, ambush: boolean): MatchConfig {
  return {
    mode: 'sandbox',
    size: 16,
    settingChanges: { fog: true, ambush },
    teams: [{ controller: 'human' }, { controller: 'human' }],
    seed: 4,
    buildings: [
      { type: 'Base', owner: 0, at: { x: 0, y: 0 } },
      { type: 'Base', owner: 1, at: { x: 15, y: 15 } },
    ],
    units: [{ type: 'Blocker', team: 0, at: { x: 8, y: 8 } }, ...(withFoe ? [{ type: 'Tank', team: 1, at: { x: 10, y: 8 } }] : [])],
  };
}

describe('la sala contesta lo que diria la vista del equipo, no la partida de verdad', () => {
  const FOE_TILE = { x: 10, y: 8 };
  /** La accion de cada tipo que toca la casilla del enemigo escondido o lo nombra (`foe`: su uid; en la sala sin el, uno que no existe). */
  const touching = (mine: number, foe: number): { readonly [K in GameActionKind]: GameAction | null } => ({
    move: { kind: 'move', uid: mine, to: FOE_TILE },
    undoMove: { kind: 'undoMove', uid: foe },
    attack: { kind: 'attack', uid: mine, target: foe },
    capture: { kind: 'capture', uid: foe },
    merge: { kind: 'merge', uid: mine, into: foe },
    load: { kind: 'load', uid: mine, into: foe },
    unload: { kind: 'unload', uid: mine, passenger: foe, to: FOE_TILE },
    supply: { kind: 'supply', uid: foe },
    wait: { kind: 'wait', uid: foe },
    deleteUnit: { kind: 'deleteUnit', uid: foe },
    buy: { kind: 'buy', at: FOE_TILE, unitType: 'Soldier' },
    usePower: { kind: 'usePower', power: 'airstrike', target: FOE_TILE },
    gotoStep: { kind: 'gotoStep', uid: mine },
    giveStandingOrder: { kind: 'giveStandingOrder', uids: [mine], order: { kind: 'goto', at: FOE_TILE } },
    cancelStandingOrder: { kind: 'cancelStandingOrder', uids: [foe] },
    finishStandingOrder: { kind: 'finishStandingOrder', uid: foe },
    formSquad: { kind: 'formSquad', uids: [mine, foe] },
    setGroup: { kind: 'setGroup', uids: [foe], key: 1 },
    addToGroup: { kind: 'addToGroup', uids: [foe], key: 1 },
    leaveSquad: { kind: 'leaveSquad', uids: [foe] },
    renameSquad: { kind: 'renameSquad', squad: foe, name: 'x' },
    disbandSquad: { kind: 'disbandSquad', squad: foe },
    surrender: null,
    startTurn: null,
    endTurn: null,
  });

  /** Lo que contesta la sala al equipo 0 a cada accion de `touching`, por tipo. */
  function answers(withFoe: boolean, ambush: boolean): Map<GameActionKind, string> {
    const room = Room.create({ match: blindMatch(withFoe, ambush) }, context());
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const me = table.clients[0]!;
    const mine = me.state!.units.find((unit) => unit.team === 0)!.uid;
    const foe = room.state.units.find((unit) => unit.team === 1)?.uid ?? room.state.nextUid + 7;
    expect(unitById(me.state!, foe)).toBeUndefined();
    const result = new Map<GameActionKind, string>();
    for (const [kind, action] of Object.entries(touching(mine, foe)) as [GameActionKind, GameAction | null][]) {
      if (!action) continue;
      // Cada accion en una sala nueva, para que una no cambie lo que contesta la siguiente.
      const fresh = Room.create({ match: blindMatch(withFoe, ambush) }, context());
      const freshTable = new Table(fresh, tokensOf(fresh));
      freshTable.joinAll();
      const client = freshTable.clients[0]!;
      client.lastResult = null;
      freshTable.exchange(0, client.ordered({ kind: 'act', action }));
      const answer = lastResultOf(client);
      result.set(kind, !answer ? 'sin respuesta' : answer.ok ? 'ok' : answer.reason);
    }
    return result;
  }

  it('con emboscadas, un enemigo escondido no cambia ninguna respuesta', () => {
    expect(answers(true, true)).toEqual(answers(false, true));
  });

  it('sin emboscadas, solo lo descubre lo que las propias reglas descubren al chocar (mover a su casilla)', () => {
    const withFoe = answers(true, false);
    const without = answers(false, false);
    const differing = [...withFoe.keys()].filter((kind) => withFoe.get(kind) !== without.get(kind));
    // Con la emboscada apagada, un enemigo escondido cierra el paso al planear (rules/passage.ts): es
    // una regla del juego, la misma que en la pantalla enseña el alcance (ver "Red").
    expect(differing).toEqual(['move']);
    expect([withFoe.get('move'), without.get('move')]).toEqual(['unreachable', 'ok']);
  });
});

describe('la sala acaba o se para sola', () => {
  it('sin ninguna persona que juegue, la sala acaba aunque la partida siga (y lo dice)', () => {
    const room = newRoom([{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }], 5);
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    room.replaceWithAi(0);
    expect(room.status).toBe('playing');
    const out = room.replaceWithAi(1);
    expect(out).toEqual([]);
    expect(room.status).toBe('ended');
    expect(room.state.day).toBeLessThan(3);
    // Y a quien se rinde el ultimo se le dice que la sala acaba abandonada.
    const other = newRoom([{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }], 6);
    const otherTable = new Table(other, tokensOf(other));
    otherTable.joinAll();
    const gone = otherTable.exchange(0, otherTable.clients[0]!.ordered({ kind: 'surrender' }));
    expect(toSeat(gone, 0).at(-1)).toMatchObject({ kind: 'ended', abandoned: true, result: { status: 'playing' } });
    expect(other.status).toBe('ended');
  });

  it('con un presupuesto de pasos, la sala se queda a medias (isMidway) y sigue con continueMatch', () => {
    const room = Room.create(
      {
        match: skirmishConfig({ seed: 9, size: 16, teams: [{ controller: 'human' }, { controller: 'ai' }], settingChanges: { fog: true } }),
      },
      { ...context(), stepBudget: 3 },
    );
    const table = new Table(room, tokensOf(room));
    table.joinAll();
    const client = table.clients[0]!;
    table.exchange(0, client.ordered({ kind: 'endTurn' }));
    expect(room.isMidway()).toBe(true);
    let calls = 0;
    while (room.isMidway()) {
      table.deliver(room.continueMatch());
      calls++;
    }
    expect(calls).toBeGreaterThan(1);
    expect(room.awaiting?.team).toBe(0);
    expect(client.turn).toEqual({ team: 0, day: 2 });
    expect(room.continueMatch()).toEqual([]);
  });
});

describe('el cliente simulado', () => {
  it('se queja si el servidor le manda un error', () => {
    const client = new NetClient('x');
    expect(() => client.receive({ kind: 'error', error: 'badToken' })).toThrow(/badToken/);
  });
});
