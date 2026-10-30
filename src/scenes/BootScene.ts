import Phaser from 'phaser';
import { createAtlas, loadAtlas } from '../atlas';
import { ATLAS_PAGES } from '../atlasPages';
import { asset, assetsAvailable, setImageSource } from '../assets';
import { ui } from '../hud/store';

/**
 * Carga los graficos (las paginas del atlas que compila npm run assets) y la musica mostrando una
 * barra de progreso (en la interfaz HTML).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    ui.set({ screen: 'loading', loading: 0 });
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => ui.set({ loading: p }));
    loadAtlas(this.load, ATLAS_PAGES, asset);
    for (const song of ['menu', 'game'])
      this.load.audio(song, assetsAvailable([`assets/music/${song}.ogg`, `assets/music/${song}.mp3`]).map(asset));
  }

  create(): void {
    createAtlas(this, ATLAS_PAGES);
    setImageSource(this.textures);
    // Punteros del raton propios (tools/art/icons/iconos.txt): el normal y el de lo que se puede
    // pulsar, con el punto activo en la punta. Al doble para pantallas de alta densidad.
    const root = document.documentElement.style;
    root.setProperty('--cursor', pointerCss('raton', 'auto'));
    root.setProperty('--cursor-button', pointerCss('raton_boton', 'pointer'));
    // Phaser no espera a create(): la escena siguiente se lanza cuando esten las fuentes de la
    // interfaz (van incluidas; el limite es por si acaso; sin ellas se usan las de reserva).
    const fonts = Promise.all([
      document.fonts.load("16px 'Pixelify Sans'"),
      document.fonts.load("16px 'Silkscreen'"),
      document.fonts.load("16px 'Ilogic'"),
    ]).catch(() => undefined);
    void Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(() => this.scene.start('Logo'));
  }
}

/** Valor CSS de un puntero propio: con image-set (nitido en alta densidad) si el navegador lo entiende. */
function pointerCss(name: string, fallback: string): string {
  const one = asset(`assets/img/${name}.png`);
  const two = asset(`assets/img/${name}_2x.png`);
  const sharp = `image-set(url("${one}") 1x, url("${two}") 2x) 0 0, ${fallback}`;
  return CSS.supports('cursor', sharp) ? sharp : `url("${one}") 0 0, ${fallback}`;
}
