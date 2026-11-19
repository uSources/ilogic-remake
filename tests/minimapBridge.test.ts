import { describe, expect, it } from 'vitest';
import { ui } from '../src/hud/store';
import { MinimapBridge } from '../src/view3d/systems/hud/minimapBridge';
import { GameImages } from '../src/atlas';

/** El recuadro no mira imagenes: sin ninguna. */
const NO_IMAGES = new GameImages(new Map());

describe('MinimapBridge: el recuadro de lo que se ve', () => {
  it('se publica redondeado a cuartos de casilla', () => {
    new MinimapBridge(NO_IMAGES, 0).publishView({ x: 3.13, y: 4.9, w: 10.04, h: 8.6 });
    expect(ui.get().minimapView).toEqual({ x: 3.25, y: 5, w: 10, h: 8.5 });
  });

  it('no se vuelve a publicar si no se ha movido lo bastante para notarse', () => {
    const bridge = new MinimapBridge(NO_IMAGES, 0);
    bridge.publishView({ x: 3, y: 4, w: 10, h: 8 });
    const shown = ui.get().minimapView;
    bridge.publishView({ x: 3.05, y: 4.02, w: 10, h: 8 });
    expect(ui.get().minimapView).toBe(shown);
  });
});
