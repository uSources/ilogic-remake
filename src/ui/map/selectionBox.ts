import type Phaser from 'phaser';
import { PAL } from '../palette';
import { frameRect } from '../pixelDraw';
import type { MapCamera, ScreenBox } from './camera';

/**
 * Recuadro de seleccion (arrastrar con el raton): relleno dorado tenue y borde de 1 px. Se crea la
 * primera vez que hace falta, en la capa de efectos (por encima de las unidades).
 */
export class SelectionBox {
  private graphics: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: MapCamera,
    private readonly parent: Phaser.GameObjects.Container,
  ) {}

  /** Recuadro en pixeles de pantalla del lienzo, o null para quitarlo. */
  set(box: ScreenBox | null): void {
    if (!box) {
      this.graphics?.clear();
      return;
    }
    if (!this.graphics) {
      this.graphics = this.scene.add.graphics();
      this.parent.add(this.graphics);
    }
    const { topLeft, bottomRight } = this.camera.worldBox(box);
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    const graphics = this.graphics;
    graphics.clear();
    graphics.fillStyle(PAL.gold, 0.12);
    graphics.fillRect(topLeft.x, topLeft.y, width, height);
    graphics.fillStyle(PAL.gold, 0.9);
    frameRect(graphics, topLeft.x, topLeft.y, width, height);
  }
}
