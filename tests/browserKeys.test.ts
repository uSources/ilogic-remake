import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { blockTabFocus, installTabGuard, onceEachKey } from '../src/controls/browserKeys';

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

  /**
   * Como reparte Phaser las teclas (KeyboardPlugin.update): con cada pulsacion nueva, la cola entera
   * del fotograma, saltandose solo la que es igual a la ultima repartida.
   */
  function phaserDeliveries(events: readonly KeyboardEventInit[], listener: (event: KeyboardEventInit) => void): void {
    const queue: KeyboardEventInit[] = [];
    let previous: KeyboardEventInit | null = null;
    for (const event of events) {
      queue.push(event);
      for (const queued of queue) {
        if (queued === previous) continue;
        previous = queued;
        listener(queued);
      }
    }
  }

  it('Mayusculas+Tab en un fotograma: Phaser reparte el Tab tres veces; la escena lo atiende una', () => {
    const shiftTab: KeyboardEventInit[] = [{ code: 'ShiftLeft' }, { code: 'Tab', shiftKey: true }, { code: 'Tab' }, { code: 'ShiftLeft' }];
    const keydowns = [shiftTab[0]!, shiftTab[1]!];
    const seen: string[] = [];
    phaserDeliveries(shiftTab, (event) => keydowns.includes(event) && seen.push(event.code!));
    expect(seen.filter((code) => code === 'Tab')).toHaveLength(3);
    const handled: string[] = [];
    const scene = onceEachKey((event: KeyboardEventInit) => handled.push(event.code!));
    phaserDeliveries(shiftTab, (event) => keydowns.includes(event) && scene(event));
    expect(handled).toEqual(['ShiftLeft', 'Tab']);
  });
});
