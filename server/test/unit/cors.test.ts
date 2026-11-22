import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../../src/cors';

const CONFIGURED = 'https://usources.github.io,null';

describe('desde que webs se puede hablar con el servidor', () => {
  it('las de la configuracion, localhost en cualquier puerto y sin origen (no es un navegador)', () => {
    for (const origin of ['https://usources.github.io', 'null', 'http://localhost:5173', 'http://127.0.0.1:8080', null])
      expect(isOriginAllowed(origin, CONFIGURED)).toBe(true);
    expect(isOriginAllowed('https://otra.example', CONFIGURED)).toBe(false);
  });

  it('la propia direccion del servidor si es una IP (el de Node sirve tambien el juego), con su puerto', () => {
    expect(isOriginAllowed('http://192.168.1.20:8787', '', '192.168.1.20:8787')).toBe(true);
    expect(isOriginAllowed('http://[fd00::20]:8787', '', '[fd00::20]:8787')).toBe(true);
    expect(isOriginAllowed('http://192.168.1.20:9000', '', '192.168.1.20:8787')).toBe(false);
    expect(isOriginAllowed('null', '', '192.168.1.20:8787')).toBe(false);
  });

  it('con un nombre no basta ser del mismo sitio (DNS rebinding): el nombre del servidor va en la lista', () => {
    expect(isOriginAllowed('http://malo.example:8787', '', 'malo.example:8787')).toBe(false);
    expect(isOriginAllowed('https://ilogic.mi-casa.net', '', 'ilogic.mi-casa.net')).toBe(false);
    expect(isOriginAllowed('https://ilogic.mi-casa.net', 'https://ilogic.mi-casa.net', 'ilogic.mi-casa.net')).toBe(true);
  });
});
