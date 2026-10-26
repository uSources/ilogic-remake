import type Phaser from 'phaser';

/**
 * Pantalla nitida: el lienzo de Phaser tiene tantos pixeles como pixeles fisicos la ventana
 * (ventana CSS x devicePixelRatio) y se muestra al tamaño CSS de la ventana. Asi, con zoom
 * entero de camara, cada pixel del dibujo original ocupa un numero exacto de pixeles fisicos.
 */
export function dpr(): number {
  return Math.max(1, window.devicePixelRatio || 1);
}

export function viewportCss(): { w: number; h: number } {
  const vv = window.visualViewport;
  return { w: Math.max(1, Math.round(vv?.width ?? window.innerWidth)), h: Math.max(1, Math.round(vv?.height ?? window.innerHeight)) };
}

export function deviceSize(): { w: number; h: number } {
  const { w, h } = viewportCss();
  const r = dpr();
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

/** Pasa de pixeles del lienzo (fisicos) a pixeles CSS. */
export const toCss = (v: number): number => v / dpr();

export function fitCanvas(game: Phaser.Game): void {
  const { w, h } = deviceSize();
  const css = viewportCss();
  if (game.scale.width !== w || game.scale.height !== h) game.scale.resize(w, h);
  const st = game.canvas.style;
  st.width = `${css.w}px`;
  st.height = `${css.h}px`;
  game.scale.refresh();
}

export function watchResize(game: Phaser.Game): void {
  let pending = 0;
  const onResize = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => fitCanvas(game));
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  // Cambio de densidad (mover la ventana a otra pantalla, zoom del navegador).
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${dpr()}dppx)`);
    mq.addEventListener('change', () => {
      onResize();
      watchDpr();
    }, { once: true });
  };
  watchDpr();
}
