import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { blockTabFocus, installTabGuard } from '../src/controls/browserKeys';

/**
 * Tab entre el navegador y Phaser (src/controls/browserKeys.ts). Phaser no mira las pulsaciones que
 * ya llegan con defaultPrevented: si el guardian de Tab corre antes, Tab no hace nada en el juego.
 * El recorrido completo en un navegador: tests/visual/keys.mjs.
 */
describe('Tab y el navegador', () => {
  const ev = (key: string) => ({ key, preventDefault: vi.fn() });

  it('Tab (tambien con Mayusculas: misma key) no mueve el foco; las demas teclas no se tocan', () => {
    const tab = ev('Tab');
    blockTabFocus(tab);
    expect(tab.preventDefault).toHaveBeenCalledOnce();
    for (const key of ['Enter', ' ', 'ArrowUp', 'Backspace', 'a']) {
      const e = ev(key);
      blockTabFocus(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('el guardian va en fase de burbuja: despues de Phaser, que escucha mas abajo', () => {
    const add = vi.fn();
    installTabGuard({ addEventListener: add });
    expect(add).toHaveBeenCalledOnce();
    const [type, listener, opts] = add.mock.calls[0]! as [string, (e: unknown) => void, AddEventListenerOptions];
    expect(type).toBe('keydown');
    expect(opts.capture).toBe(false);
    const tab = ev('Tab');
    listener(tab);
    expect(tab.preventDefault).toHaveBeenCalledOnce();
  });

  it('Phaser escucha en document y main.ts no frena Tab en fase de captura', () => {
    // Una regresion aqui deja Tab muerto en el mapa y en la pantalla final, sin ningun error.
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/keyboard:\s*\{\s*target:\s*document\s*\}/);
    expect(main).toMatch(/installTabGuard\(window\)/);
    expect(main).not.toMatch(/capture:\s*true/);
  });
});
