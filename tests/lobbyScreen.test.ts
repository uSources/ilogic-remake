/**
 * El vestibulo de una sala (`LobbyScreen`) con un servidor de mentira: `fetch`, `WebSocket` y
 * `localStorage` falsos y el reloj a mano. Con un servidor lejano (Cloudflare) la bienvenida llega
 * por el WebSocket antes que la respuesta de quien esta en la sala, y eso no puede dejarlo a medias.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_PROTOCOL, type ServerMessage } from '@core/net';
import { LobbyScreen } from '../src/menu/online/lobbyScreen';
import type { OnlineHost, OnlineScreens } from '../src/menu/online/shared';
import type { LobbyInfo } from '../src/net/roomApi';

const PAGE = 'http://localhost/';
const CODE = 'ABCDEF';
const INVITE = `#/sala/${CODE}/ficha-1`;
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
};

/** Con su tipo y no `ServerMessage`: un `...` dentro de un objeto con el tipo de toda la union agota la memoria de tsc. */
type Welcome = Extract<ServerMessage, { kind: 'welcome' }>;

const welcome: Welcome = { kind: 'welcome', seat: 0, team: 0, ...CURRENT_PROTOCOL, status: 'waiting', lastSeq: 0 };

const screens = (): OnlineScreens => ({
  host: {} as OnlineHost,
  focus: '',
  error: null,
  busy: false,
  show: () => {},
  joinRoom: () => {},
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
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', fakeFetch);
    unanswered.length = 0;
    lobby = new LobbyScreen(screens());
  });

  afterEach(() => {
    lobby.leave();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('con la bienvenida antes que la respuesta del vestibulo, enseña los asientos y sigue preguntando', async () => {
    lobby.join(CODE, 'ficha-0', 2, { seat: 0, team: 0, invites: [{ seat: 1, team: 1, token: 'ficha-1', invite: INVITE }] });
    expect(unanswered).toHaveLength(1);

    FakeSocket.last?.reply(welcome);
    unanswered.shift()?.(waitingRoom);
    await settle();

    expect(lobby.vm()?.seats.map((seat) => seat.invite)).toEqual([null, `${PAGE}${INVITE}`]);
    await settle(POLL_MS);
    expect(unanswered).toHaveLength(1);
  });

  it('una respuesta que llega despues de salir de la sala no la enseña ni vuelve a preguntar', async () => {
    lobby.join(CODE, 'ficha-0', 2);
    lobby.leave();
    unanswered.shift()?.(waitingRoom);
    await settle(POLL_MS);

    expect(lobby.vm()).toBeNull();
    expect(unanswered).toHaveLength(0);
  });
});
