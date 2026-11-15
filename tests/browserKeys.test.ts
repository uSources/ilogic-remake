import { describe, expect, it, vi } from 'vitest';
import { blockTabFocus, installTabGuard } from '../src/controls/browserKeys';

/** Tab entre el navegador y el juego (src/controls/browserKeys.ts). */
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

  it('el guardian va en fase de burbuja', () => {
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
});
