import type Phaser from 'phaser';
import { composeFog, visKey } from '../fog';
import type { MapLayer } from './layer';

/**
 * Niebla de guerra del dibujo nuevo: un lienzo con borde organico (ui/fog.ts) que solo se repinta
 * cuando cambia lo que se ve. La del dibujo de 2013 es un velo por casilla en la capa de resaltados
 * (`classicFog` en map/overlayLayer.ts).
 */
export class FogLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  private img: Phaser.GameObjects.Image | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sig = '';

  /** `bakeKey`: clave propia del lienzo de la niebla (el menu y la partida tienen cada uno la suya). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bakeKey: string,
  ) {
    this.object = scene.add.container(0, 0);
  }

  /** Enseña la niebla nueva (y la repinta si ha cambiado lo que se ve) o la esconde con el dibujo de 2013. */
  sync(vis: boolean[][], newArt: boolean): void {
    this.object.setVisible(newArt);
    if (newArt) this.update(vis);
  }

  private update(vis: boolean[][]): void {
    const sig = visKey(vis);
    if (sig === this.sig && this.img) return;
    this.sig = sig;
    const tex = this.scene.textures;
    this.canvas = composeFog(vis, tex, this.canvas ?? undefined);
    if (!this.img) {
      if (tex.exists(this.bakeKey)) tex.remove(this.bakeKey);
      tex.addCanvas(this.bakeKey, this.canvas);
      this.img = this.scene.add.image(0, 0, this.bakeKey).setOrigin(0);
      this.object.addAt(this.img, 0);
    } else (tex.get(this.bakeKey) as Phaser.Textures.CanvasTexture).refresh();
  }

  /** Suelta el lienzo (los objetos los destruye la escena al cerrarse). */
  destroy(): void {
    const tex = this.scene.textures;
    if (tex.exists(this.bakeKey)) tex.remove(this.bakeKey);
    this.canvas = null;
    this.img = null;
  }
}
