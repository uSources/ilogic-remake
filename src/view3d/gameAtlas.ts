/**
 * El atlas del juego para la interfaz HTML del 3D: las fichas, la barra de arriba y los menus enseñan
 * los dibujos del atlas (iconos, retratos), que lee Phaser. Se carga con un juego de Phaser oculto,
 * que solo carga el atlas (las mismas paginas y rutas que BootScene) y despues se duerme.
 */
import Phaser from 'phaser';
import { asset, setImageSource } from '../assets';
import { createAtlas, loadAtlas } from '../atlas';
import { ATLAS_PAGES } from '../atlasPages';

export type GameTextures = Phaser.Textures.TextureManager;

/** Carga el atlas y lo deja como fuente de las imagenes de la interfaz (`imgUrl`). */
export function loadGameAtlas(): Promise<GameTextures> {
  return new Promise((resolve) => {
    class AtlasScene extends Phaser.Scene {
      preload(): void {
        loadAtlas(this.load, ATLAS_PAGES, asset);
      }
      create(): void {
        createAtlas(this, ATLAS_PAGES);
        setImageSource(this.textures);
        resolve(this.textures);
        // Ya no dibuja nada: que no gaste un fotograma tras otro.
        this.game.loop.sleep();
      }
    }
    const holder = document.createElement('div');
    holder.hidden = true;
    document.body.append(holder);
    new Phaser.Game({
      type: Phaser.CANVAS,
      parent: holder,
      width: 1,
      height: 1,
      banner: false,
      audio: { noAudio: true },
      scene: AtlasScene,
    });
  });
}
