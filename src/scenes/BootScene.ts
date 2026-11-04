import Phaser from 'phaser';
import { installCursors } from '../ui/cursors';
import { createAtlas, loadAtlas } from '../atlas';
import { ATLAS_PAGES } from '../atlasPages';
import { asset, assetsAvailable, setImageSource } from '../assets';
import { ui } from '../hud/store';

const SONGS = ['menu', 'game'] as const;
/** Fuentes de la interfaz que hay que tener antes de enseñar el logo. */
const UI_FONTS = ["16px 'Pixelify Sans'", "16px 'Silkscreen'", "16px 'Ilogic'"];
/** Por si las fuentes no llegan: se sigue con las de reserva pasado este tiempo (ms). */
const FONT_TIMEOUT_MS = 2500;

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
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => ui.set({ loading: progress }));
    loadAtlas(this.load, ATLAS_PAGES, asset);
    for (const song of SONGS) this.load.audio(song, assetsAvailable([`assets/music/${song}.ogg`, `assets/music/${song}.mp3`]).map(asset));
  }

  create(): void {
    createAtlas(this, ATLAS_PAGES);
    setImageSource(this.textures);
    setMouseCursors();
    // Phaser no espera a create(): la escena siguiente se lanza cuando esten las fuentes de la
    // interfaz (van incluidas; el limite es por si acaso; sin ellas se usan las de reserva).
    void waitForFonts().then(() => this.scene.start('Logo'));
  }
}

/**
 * Punteros del raton propios (tools/art/icons/iconos.txt): el normal y el de lo que se puede pulsar,
 * con el punto activo en la punta.
 */
function setMouseCursors(): void {
  const root = document.documentElement.style;
  root.setProperty('--cursor', pointerCss('raton', 'auto'));
  root.setProperty('--cursor-button', pointerCss('raton_boton', 'pointer'));
  // [CAMBIO] Punteros que anuncian el clic derecho (mover, atacar, capturar...): ui/cursors.ts.
  installCursors();
}

function waitForFonts(): Promise<unknown> {
  const fonts = Promise.all(UI_FONTS.map((font) => document.fonts.load(font))).catch(() => undefined);
  return Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS))]);
}

/**
 * Valor CSS de un puntero propio: imagen de 32x32 con el punto activo en la punta. Sin image-set:
 * algunos navegadores dicen entenderlo en `cursor` pero ponen la flecha del sistema.
 */
function pointerCss(name: string, fallback: string): string {
  // Ruta absoluta: dentro de una variable CSS, una relativa se resuelve desde la hoja de estilos
  // (assets/...), no desde la pagina, y la imagen no se encuentra.
  const url = new URL(asset(`assets/img/${name}.png`), document.baseURI).href;
  return `url("${url}") 0 0, ${fallback}`;
}
