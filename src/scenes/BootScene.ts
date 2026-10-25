import Phaser from 'phaser';
import { IMAGE_KEYS } from '../assetList';
import { SCREEN_W, SCREEN_H } from '../layout';

/**
 * En la version de un solo fichero (scripts/build-single.mjs) los recursos van incrustados
 * en window.__ILOGIC_ASSETS__ como data URI; en la normal se cargan de la carpeta assets/.
 */
function asset(path: string): string {
  const inline = (window as unknown as { __ILOGIC_ASSETS__?: Record<string, string> }).__ILOGIC_ASSETS__;
  return inline?.[path] ?? path;
}

/** Carga todas las imagenes y la musica mostrando una barra de progreso. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const barW = 320;
    const x = (SCREEN_W - barW) / 2;
    const y = SCREEN_H / 2;
    const frame = this.add.rectangle(x, y, barW, 12).setOrigin(0, 0.5).setStrokeStyle(1, 0x888888);
    const fill = this.add.rectangle(x + 2, y, 0, 8, 0xc0c0c0).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      fill.width = (barW - 4) * p;
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      frame.destroy();
      fill.destroy();
    });

    for (const key of IMAGE_KEYS) this.load.image(key, asset(`assets/img/${key}.png`));
    this.load.audio('menu', [asset('assets/music/menu.ogg'), asset('assets/music/menu.mp3')]);
    this.load.audio('game', [asset('assets/music/game.ogg'), asset('assets/music/game.mp3')]);
  }

  async create(): Promise<void> {
    // Esperar a la fuente de la interfaz (si no hay conexion, se usa la de reserva).
    try {
      await Promise.race([document.fonts.load("16px 'Pixelify Sans'"), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      // sin fuentes web
    }
    // Cursor del raton propio: el soldadito blanco, con el punto activo en (17,0).
    this.game.canvas.style.cursor = `url(${asset('assets/img/mouse.png')}) 17 0, auto`;
    this.scene.start('Logo');
  }
}
