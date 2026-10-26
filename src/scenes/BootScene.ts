import Phaser from 'phaser';
import { IMAGE_KEYS } from '../assetList';
import { asset } from '../assets';
import { ui } from '../hud/store';

/** Carga todas las imagenes y la musica mostrando una barra de progreso (en la interfaz HTML). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    ui.set({ screen: 'loading', loading: 0 });
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => ui.set({ loading: p }));
    for (const key of IMAGE_KEYS) this.load.image(key, asset(`assets/img/${key}.png`));
    this.load.audio('menu', [asset('assets/music/menu.ogg'), asset('assets/music/menu.mp3')]);
    this.load.audio('game', [asset('assets/music/game.ogg'), asset('assets/music/game.mp3')]);
  }

  async create(): Promise<void> {
    // Esperar a las fuentes de la interfaz (van incluidas; el limite es por si acaso).
    try {
      await Promise.race([
        Promise.all([document.fonts.load("16px 'Pixelify Sans'"), document.fonts.load("16px 'Silkscreen'")]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch {
      // sin fuentes: se usan las de reserva
    }
    // Cursor del raton propio: el soldadito blanco, con el punto activo en (17,0).
    document.body.style.cursor = `url(${asset('assets/img/mouse.png')}) 17 0, auto`;
    this.scene.start('Logo');
  }
}
