import { describe, expect, it, vi } from 'vitest';
import { trackAltKey } from '../src/hud/common/altKey';

/** Un suceso del navegador con Alt pulsado o no (en Node, Event no trae altKey). */
const eventWithAlt = (type: string, altKey: boolean) => Object.assign(new Event(type), { altKey });

/** Si Alt esta pulsado, una cuenta para toda la pagina (src/hud/common/altKey.ts). */
describe('trackAltKey', () => {
  it('sigue la pulsacion y la suelta de Alt', () => {
    const page = new EventTarget();
    const alt = trackAltKey(page);
    expect(alt.isHeld()).toBe(false);
    page.dispatchEvent(eventWithAlt('keydown', true));
    expect(alt.isHeld()).toBe(true);
    page.dispatchEvent(eventWithAlt('keyup', false));
    expect(alt.isHeld()).toBe(false);
  });

  it('quien llega con Alt ya pulsado lo sabe (en Mac, mantener Alt no repite la pulsacion)', () => {
    const page = new EventTarget();
    const alt = trackAltKey(page);
    page.dispatchEvent(eventWithAlt('keydown', true));
    // Como una ficha de casilla que se monta despues: lee la cuenta de la pagina, no empieza de cero.
    const listener = vi.fn();
    alt.subscribe(listener);
    expect(alt.isHeld()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('el raton corrige una pulsacion perdida (Alt pulsado con la pagina sin el foco)', () => {
    const page = new EventTarget();
    const alt = trackAltKey(page);
    page.dispatchEvent(eventWithAlt('pointermove', true));
    expect(alt.isHeld()).toBe(true);
    page.dispatchEvent(eventWithAlt('pointermove', false));
    expect(alt.isHeld()).toBe(false);
  });

  it('salir de la ventana lo suelta (no llega la suelta de Alt)', () => {
    const page = new EventTarget();
    const alt = trackAltKey(page);
    page.dispatchEvent(eventWithAlt('keydown', true));
    page.dispatchEvent(new Event('blur'));
    expect(alt.isHeld()).toBe(false);
  });

  it('avisa solo cuando cambia, y deja de avisar al darse de baja', () => {
    const page = new EventTarget();
    const alt = trackAltKey(page);
    const listener = vi.fn();
    const unsubscribe = alt.subscribe(listener);
    page.dispatchEvent(eventWithAlt('keydown', true));
    page.dispatchEvent(eventWithAlt('pointermove', true));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    page.dispatchEvent(eventWithAlt('keyup', false));
    expect(listener).toHaveBeenCalledOnce();
  });

  it('escucha las teclas en fase de captura: un cuadro de texto que corte la propagacion no esconde la suelta', () => {
    const add = vi.fn();
    trackAltKey({ addEventListener: add });
    const keyCalls = add.mock.calls.filter(([type]) => type === 'keydown' || type === 'keyup');
    expect(keyCalls).toHaveLength(2);
    for (const [, , options] of keyCalls) expect(options).toEqual({ capture: true });
  });
});
