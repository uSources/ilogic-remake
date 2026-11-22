import { afterEach, describe, expect, it, vi } from 'vitest';
import { whenFontLoads } from '../src/view3d/engine/core/canvasText';

/**
 * Un `document.fonts` falso: la letra no ha cargado (o si, con `isLoaded`) y su carga acaba como diga
 * `load`. Cada prueba usa su propia letra: la carga de cada una se guarda para siempre.
 */
function fakeFonts(load: () => Promise<unknown>, isLoaded = false) {
  const fonts = { check: vi.fn(() => isLoaded), load: vi.fn(load) };
  vi.stubGlobal('document', { fonts });
  return fonts;
}

/** Deja que acaben las promesas pendientes. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('whenFontLoads', () => {
  it('no pide nada si la letra ya ha cargado', async () => {
    const fonts = fakeFonts(() => Promise.resolve([]), true);
    const repaint = vi.fn();
    whenFontLoads("bold 10px 'Cargada'", repaint);
    await settle();
    expect(fonts.load).not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();
  });

  it('vuelve a pintar todo lo que la esperaba cuando carga, pidiendola una vez', async () => {
    const fonts = fakeFonts(() => Promise.resolve([]));
    const repaints = [vi.fn(), vi.fn()];
    for (const repaint of repaints) whenFontLoads("bold 10px 'Lenta'", repaint);
    expect(repaints[0]).not.toHaveBeenCalled();
    await settle();
    for (const repaint of repaints) expect(repaint).toHaveBeenCalledOnce();
    expect(fonts.load).toHaveBeenCalledOnce();
  });

  it('si no carga, avisa una vez, no la vuelve a pedir y no repinta', async () => {
    const fonts = fakeFonts(() => Promise.reject(new Error('Sin red')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repaint = vi.fn();
    whenFontLoads("bold 10px 'Caida'", repaint);
    await settle();
    whenFontLoads("bold 10px 'Caida'", repaint);
    await settle();
    expect(fonts.load).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(repaint).not.toHaveBeenCalled();
  });
});
