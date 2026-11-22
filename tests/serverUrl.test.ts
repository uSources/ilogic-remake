import { describe, expect, it } from 'vitest';
import { absoluteServerUrl, roomSocketUrl } from '../src/net/serverUrl';

describe('donde esta el servidor de partidas', () => {
  it('una URL entera se queda como esta (sin la barra del final); sin ninguna, no hay red', () => {
    expect(absoluteServerUrl('https://ilogic-servidor.x.workers.dev/', 'https://usources.github.io/ilogic/')).toBe(
      'https://ilogic-servidor.x.workers.dev',
    );
    expect(absoluteServerUrl('  ', 'https://usources.github.io/')).toBeNull();
  });

  it('"/" es el sitio que sirve el juego (el servidor de Node), con su puerto, y su WebSocket va igual', () => {
    const base = absoluteServerUrl('/', 'http://192.168.1.20:8787/index.html#/sala/ABCDEF/x');
    expect(base).toBe('http://192.168.1.20:8787');
    expect(roomSocketUrl(base!, 'ABCDEF')).toBe('ws://192.168.1.20:8787/rooms/ABCDEF/ws');
    expect(roomSocketUrl(absoluteServerUrl('/', 'https://ilogic.mi-casa.net/')!, 'ABCDEF')).toBe(
      'wss://ilogic.mi-casa.net/rooms/ABCDEF/ws',
    );
  });
});
