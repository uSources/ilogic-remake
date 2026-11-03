import type Phaser from 'phaser';
import { PAL } from '../palette';
import { frameRect } from '../pixelDraw';
import type { MapCamera, ScreenBox } from './camera';

/**
 * Recuadro de seleccion (arrastrar con el raton): relleno dorado tenue y borde de 1 px. Se crea la
 * primera vez que hace falta, en la capa de efectos (por encima de las unidades).
 */
export class SelectionBox {
  private g: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: MapCamera,
    private readonly parent: Phaser.GameObjects.Container,
  ) {}

  /** Recuadro en pixeles de pantalla del lienzo, o null para quitarlo. */
  set(r: ScreenBox | null): void {
    if (!r) {
      this.g?.clear();
      return;
    }
    if (!this.g) {
      this.g = this.scene.add.graphics();
      this.parent.add(this.g);
    }
    const { a, b } = this.camera.worldBox(r);
    const g = this.g;
    g.clear();
    g.fillStyle(PAL.gold, 0.12);
    g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    g.fillStyle(PAL.gold, 0.9);
    frameRect(g, a.x, a.y, b.x - a.x, b.y - a.y);
  }
}
