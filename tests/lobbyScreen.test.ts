/**
 * El vestibulo de una sala (`LobbyScreen`) con un servidor de mentira: `fetch`, `WebSocket`,
 * `localStorage` y `sessionStorage` falsos y el reloj a mano. Con un servidor lejano (Cloudflare) la
 * bienvenida llega por el WebSocket antes que la respuesta de quien esta en la sala, y eso no puede
 * dejarlo a medias. Tambien lo que suena: quien entra, la conexion y que la partida empieza.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultContent } from '@core/content/default';
import { skirmishConfig } from '@core/match';
import { CURRENT_PROTOCOL, Room, type ServerMessage } from '@core/net';
import { LobbyScreen } from '../src/menu/online/lobbyScreen';
import { RoomWatch } from '../src/menu/online/roomWatch';
import type { OnlineHost, OnlineScreens } from '../src/menu/online/shared';
import { CUT_NOTICE_MS } from '../src/net/linkSounds';
import { takeMatchBegun } from '../src/net/matchIntro';
import { readOnlineRooms, writeOnlineRooms } from '../src/net/onlineRooms';
import type { LobbyInfo } from '../src/net/roomApi';
import { t } from '../src/settings';
import { tokenCounter } from './sim/netClient';
import { FakeSounds } from './sim/turnPorts';

const PAGE = 'http://localhost/';
const CODE = 'ABCDEF';
const POLL_MS = 3000;

class FakeStorage {
  private readonly items = new Map<string, string>([['ilogic.server', 'https://servidor.test']]);
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** El WebSocket de la sala: el ultimo que se ha abierto. */
class FakeSocket {
  static last: FakeSocket | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor() {
    FakeSocket.last = this;
  }
  send(): void {}
  close(): void {}
  reply(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

/** Las peticiones de `fetch` sin contestar: cada una se contesta a mano con lo que hay en la sala. */
const unanswered: ((info: LobbyInfo) => void)[] = [];

const fakeFetch = (): Promise<Response> =>
  new Promise((resolve) => unanswered.push((info) => resolve(new Response(JSON.stringify(info), { status: 200 }))));

const waitingRoom: LobbyInfo = {
  ...CURRENT_PROTOCOL,
  status: 'waiting',
  seats: [
    { seat: 0, team: 0, kind: 'person', joined: true },
    { seat: 1, team: 1, kind: 'person', joined: false },
  ],
  turn: null,
};

/** Con su tipo y no `ServerMessage`: un `...` dentro de un objeto con el tipo de toda la union agota la memoria de tsc. */
type Welcome = Extract<ServerMessage, { kind: 'welcome' }>;

const welcome: Welcome = { kind: 'welcome', seat: 0, team: 0, ...CURRENT_PROTOCOL, status: 'waiting', lastSeq: 0 };

/** La sala esperando con quien ha entrado en cada asiento (el 0 es el propio). */
const roomWith = (...joined: boolean[]): LobbyInfo => ({
  ...waitingRoom,
  seats: joined.map((isIn, seat) => ({ seat, team: seat, kind: 'person', joined: isIn })),
});

/**
 * Lo que manda la sala de verdad del nucleo al asiento 0 al entrar, con la IA enfrente: la bienvenida
 * (aun esperando: falta el) y, como con el ya estan todos, la vista y a quien se espera. Al volver a
 * entrar (`isReturning`), lo mismo con la partida ya en marcha.
 */
function roomMessages(isReturning: boolean): ServerMessage[] {
  const config = skirmishConfig({ seed: 21, size: 16, teams: [{ controller: 'human' }, { controller: 'ai' }] });
  const room = Room.create({ match: config }, { content: defaultContent(), newToken: tokenCounter() });
  const hello = { kind: 'hello', token: room.personSeats()[0]!.token, ...CURRENT_PROTOCOL };
  const first = room.join(hello);
  const joined = isReturning ? room.join(hello) : first;
  if (!joined.ok) throw new Error(joined.error);
  return joined.messages.filter((outgoing) => outgoing.seat === 0).map((outgoing) => outgoing.message);
}

/** Lo que pidio la pantalla al conjunto (cancelar la busqueda, volver al menu, pasar a la partida). */
const asked: string[] = [];

let sounds = new FakeSounds();

const host = (): OnlineHost => ({
  palette: {} as OnlineHost['palette'],
  sounds,
  toHome: () => {},
  startOnline: (match) => asked.push(`play ${match.code}`),
});

const screens = (): OnlineScreens => ({
  host: host(),
  rooms: new RoomWatch(),
  focus: '',
  error: null,
  busy: false,
  show: () => {},
  joinRoom: () => {},
  enterRoom: () => {},
  searchRival: () => {},
  cancelSearch: (entry) => {
    asked.push(`cancel ${entry.code}`);
    return Promise.resolve(true);
  },
  toMenu: () => asked.push('menu'),
  publish: () => {},
});

/** Deja correr las promesas ya contestadas (y los relojes que venzan en `ms`). */
const settle = (ms = 0): Promise<unknown> => vi.advanceTimersByTimeAsync(ms);

describe('LobbyScreen', () => {
  let lobby: LobbyScreen;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('location', { href: PAGE });
    vi.stubGlobal('localStorage', new FakeStorage());
    vi.stubGlobal('sessionStorage', new FakeStorage());
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', fakeFetch);
    unanswered.length = 0;
    asked.length = 0;
    sounds = new FakeSounds();
    lobby = new LobbyScreen(screens());
  });

  afterEach(() => {
    lobby.leave();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('con la bienvenida antes que la respuesta del vestibulo, enseña la sala y los asientos y sigue preguntando', async () => {
    lobby.join(CODE, 'ficha-0', 2, { seat: 0, team: 0 });
    expect(unanswered).toHaveLength(1);

    FakeSocket.last?.reply(welcome);
    unanswered.shift()?.(waitingRoom);
    await settle();

    const vm = lobby.vm();
    expect(vm?.seats.map((seat) => [seat.presence, seat.handToAiId !== null])).toEqual([
      ['in', false],
      ['out', true],
    ]);
    expect(vm?.link).toBe(`${PAGE}#/sala/${CODE}`);
    expect(vm?.canInvite).toBe(true);
    expect(vm).toMatchObject({ title: t('onlineYourRoom'), searchingSince: null, note: t('onlineWaitingOne') });
    expect(vm?.seats.map((seat) => [seat.who, seat.team, seat.status])).toEqual([
      [t('onlineYou'), t('onlineArmyBlue'), t('onlineIn')],
      [t('onlineWaitingFriend'), t('onlineArmyRed'), null],
    ]);
    expect(lobby.rows()).toEqual([['leave'], ['copy'], ['copyCode'], ['ai-1']]);
    await settle(POLL_MS);
    expect(unanswered).toHaveLength(1);
  });

  it('el asiento que acaba de dar el servidor apunta la sala en «Mis partidas» ya, antes de entrar', () => {
    lobby.join(CODE, 'ficha-1', 2, { seat: 1, team: 1 });
    expect(readOnlineRooms()).toMatchObject([{ code: CODE, token: 'ficha-1', seat: 1, team: 1, status: 'waiting' }]);
  });

  it('al volver a una busqueda desde «Mis partidas», «Buscando rival…» cuenta desde que empezo, no desde ahora', async () => {
    const STARTED = 1_000;
    writeOnlineRooms([
      { code: CODE, token: 'ficha-0', seat: 0, team: 0, teams: 2, status: 'waiting', at: STARTED, search: 'daily', searchedAt: STARTED },
    ]);
    lobby.join(CODE, 'ficha-0', 2);
    FakeSocket.last?.reply(welcome);
    unanswered.shift()?.(waitingRoom);
    await settle();

    expect(lobby.vm()?.searchingSince).toBe(STARTED);
    expect(readOnlineRooms()[0]?.searchedAt).toBe(STARTED);
  });

  it('una respuesta que llega despues de salir de la sala no la enseña ni vuelve a preguntar', async () => {
    lobby.join(CODE, 'ficha-0', 2);
    lobby.leave();
    unanswered.shift()?.(waitingRoom);
    await settle(POLL_MS);

    expect(lobby.vm()).toBeNull();
    expect(unanswered).toHaveLength(0);
  });

  it('la propia busqueda de rival: sin invitar, el rival por llegar, jugar contra la IA y cancelar', async () => {
    lobby.join(CODE, 'ficha-0', 2, { seat: 0, team: 0, search: 'live' });
    FakeSocket.last?.reply(welcome);
    unanswered.shift()?.(waitingRoom);
    await settle();

    const vm = lobby.vm();
    expect(vm?.canInvite).toBe(false);
    expect(vm?.searching).toContain(t('onlinePaceLive'));
    expect(vm?.note).toBe(t('onlineSearchingLive'));
    expect(vm?.handToAiLabel).toBe(t('onlinePlayAi'));
    expect(vm?.seats[1]).toMatchObject({ who: t('onlineRival'), status: t('onlineRivalComing'), isYou: false });
    expect(vm?.searchingSince).toEqual(expect.any(Number));
    expect(readOnlineRooms()[0]?.searchedAt).toBe(vm?.searchingSince);
    expect(lobby.rows()).toEqual([['ai-1', 'cancelSearch', 'leave']]);
    expect(readOnlineRooms()).toMatchObject([{ code: CODE, search: 'live' }]);

    lobby.pick('cancelSearch');
    await settle();
    expect(asked).toEqual([`cancel ${CODE}`, 'menu']);
    expect(lobby.vm()).toBeNull();
  });

  it('suena cuando entra alguien mas; ni con quien ya estaba al llegar ni con la propia conexion', async () => {
    lobby.join(CODE, 'ficha-0', 3, { seat: 0, team: 0 });
    FakeSocket.last?.reply(welcome);
    unanswered.shift()?.(roomWith(false, true, false));
    await settle();
    expect(sounds.heard).toEqual([]);

    await settle(POLL_MS);
    unanswered.shift()?.(roomWith(true, true, false));
    await settle();
    expect(sounds.heard).toEqual([]);

    await settle(POLL_MS);
    unanswered.shift()?.(roomWith(true, true, true));
    await settle();
    expect(sounds.heard).toEqual(['player_joined']);

    await settle(POLL_MS);
    unanswered.shift()?.(roomWith(true, true, true));
    await settle();
    expect(sounds.heard).toEqual(['player_joined']);
  });

  it('un corte que dura suena, y su vuelta; un cierre sin arreglo, en el acto', async () => {
    lobby.join(CODE, 'ficha-0', 2, { seat: 0, team: 0 });
    FakeSocket.last?.reply(welcome);
    FakeSocket.last?.onclose?.({ code: 1006 });
    await settle(CUT_NOTICE_MS);
    expect(sounds.heard).toEqual(['net_reconnecting']);

    FakeSocket.last?.reply(welcome);
    expect(sounds.heard).toEqual(['net_reconnecting', 'net_connected']);

    FakeSocket.last?.onclose?.({ code: 4410 });
    expect(sounds.heard).toEqual(['net_reconnecting', 'net_connected', 'net_lost']);
  });

  it('si la sala se pone a jugar mientras se esperaba en ella, la carga de la partida lo hace sonar', () => {
    lobby.join(CODE, 'ficha-0', 2, { seat: 0, team: 0 });
    for (const message of roomMessages(false)) FakeSocket.last?.reply(message);

    expect(asked).toEqual([`play ${CODE}`]);
    expect(takeMatchBegun()).toBe(true);
    expect(takeMatchBegun()).toBe(false);
  });

  it('volver a una partida que ya iba no la hace sonar como si empezara', () => {
    lobby.join(CODE, 'ficha-0', 2);
    for (const message of roomMessages(true)) FakeSocket.last?.reply(message);

    expect(asked).toEqual([`play ${CODE}`]);
    expect(takeMatchBegun()).toBe(false);
  });
});
