/**
 * Lo que dice el servidor de las salas apuntadas (`RoomWatch`, la que miran a la vez «Mis partidas» y
 * la tarjeta «En línea» de Inicio), con `fetch` y `localStorage` falsos y el reloj a mano: pregunta por
 * las que siguen en marcha, avisa solo a quien empezo a mirar el ultimo y, al parar, deja de preguntar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_PROTOCOL } from '@core/net';
import { RoomWatch } from '../src/menu/online/roomWatch';
import { writeOnlineRooms, type OnlineRoomEntry } from '../src/net/onlineRooms';
import type { LobbyInfo } from '../src/net/roomApi';

const POLL_MS = 20_000;

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

const entry = (code: string): OnlineRoomEntry => ({ code, token: 'ficha', seat: 0, team: 0, teams: 2, status: 'playing', at: 0 });

const room = (status: LobbyInfo['status']): LobbyInfo => ({
  ...CURRENT_PROTOCOL,
  status,
  seats: [
    { seat: 0, team: 0, kind: 'person', joined: true },
    { seat: 1, team: 1, kind: 'person', joined: true },
  ],
  turn: status === 'playing' ? { seat: 0, day: 2, endsAt: null } : null,
});

/** Lo que contesta el servidor por cada sala; la que no esta, ya no existe. */
let rooms: Record<string, LobbyInfo> = {};
/** Por que salas se ha preguntado, en orden. */
const asked: string[] = [];

function fakeFetch(url: string): Promise<Response> {
  const code = url.slice(url.lastIndexOf('/') + 1);
  asked.push(code);
  const info = rooms[code];
  const body = info ?? { error: 'noSuchRoom' };
  return Promise.resolve(new Response(JSON.stringify(body), { status: info ? 200 : 404 }));
}

/** Deja correr las promesas ya contestadas (y los relojes que venzan en `ms`). */
const settle = (ms = 0): Promise<unknown> => vi.advanceTimersByTimeAsync(ms);

describe('RoomWatch', () => {
  let watch: RoomWatch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('location', { href: 'http://localhost/' });
    vi.stubGlobal('localStorage', new FakeStorage());
    vi.stubGlobal('fetch', fakeFetch);
    asked.length = 0;
    rooms = { MINE11: room('playing'), ENDED1: room('ended') };
    writeOnlineRooms([entry('MINE11'), entry('ENDED1'), entry('GONE11')]);
    watch = new RoomWatch();
  });

  afterEach(() => {
    watch.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pregunta por todas al empezar, avisa y luego solo vuelve a preguntar por las que siguen en marcha', async () => {
    const onChange = vi.fn();
    watch.start(onChange);
    await settle();
    expect(asked).toEqual(['MINE11', 'ENDED1', 'GONE11']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(watch.lookOf('MINE11')).toMatchObject({ kind: 'info', info: { status: 'playing' } });
    expect(watch.lookOf('GONE11')).toEqual({ kind: 'gone' });

    await settle(POLL_MS);
    expect(asked.slice(3)).toEqual(['MINE11']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('quien empieza a mirar despues se queda los avisos; al parar, nadie vuelve a preguntar', async () => {
    const home = vi.fn();
    const menu = vi.fn();
    watch.start(home);
    watch.start(menu);
    await settle();
    expect(home).not.toHaveBeenCalled();
    expect(menu).toHaveBeenCalledTimes(1);

    watch.stop();
    await settle(POLL_MS * 2);
    expect(menu).toHaveBeenCalledTimes(1);
  });

  it('con todas acabadas pregunta solo por la mas reciente, para saber si el servidor contesta; sin salas, ni pregunta ni espera', async () => {
    writeOnlineRooms([entry('ENDED1'), entry('GONE11')]);
    watch.start(() => {});
    await settle();
    expect(asked).toEqual(['ENDED1', 'GONE11']);
    expect(watch.serverReach()).toBe('online');

    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('sin red')));
    await settle(POLL_MS);
    expect(watch.serverReach()).toBe('offline');

    writeOnlineRooms([]);
    watch.start(() => {});
    await settle();
    expect(watch.serverReach()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lo que se sabe se queda al dejar de mirar (al volver se ve ya); olvidar una sala lo borra', async () => {
    watch.start(() => {});
    await settle();
    watch.stop();
    expect(watch.lookOf('MINE11').kind).toBe('info');
    watch.forget('MINE11');
    expect(watch.lookOf('MINE11')).toEqual({ kind: 'unknown' });
  });
});
