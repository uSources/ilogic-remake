import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import { TILE } from '../../layout';

/**
 * Los dibujos del mapa (unidades, edificios, montañas, bosques) llevan el origen abajo en el centro:
 * pueden ser algo mas anchos o altos que la casilla y asi se pueden voltear sin desplazarse.
 */

/** Ajusta el tamaño al del fotograma actual, sin estrechar los dibujos mas pequeños que la casilla. */
export function fitToTile<T extends Phaser.GameObjects.Image>(img: T): T {
  img.setDisplaySize(Math.max(TILE, img.frame.width), img.frame.height);
  return img;
}

/** Pie de una casilla en pixeles de mundo (donde va el origen de sus dibujos). */
export const tileFoot = (x: number, y: number): { x: number; y: number } => ({ x: x * TILE + TILE / 2, y: (y + 1) * TILE });

/** Imagen del atlas con el pie en el de la casilla (x, y). */
export function tileImage(scene: Phaser.Scene, key: string, x: number, y: number): Phaser.GameObjects.Image {
  const foot = tileFoot(x, y);
  return fitToTile(scene.add.image(foot.x, foot.y, ATLAS, key).setOrigin(0.5, 1));
}
