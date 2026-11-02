import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import type { GameState } from '../../core/types';
import { buildingKey } from '../sprites';
import type { MapLayer } from './layer';
import { fitToTile, tileFoot, tileImage } from './tileImage';

/**
 * Edificios (un sprite persistente por edificio, que se actualiza) y, en la misma capa, los
 * sprites del terreno nuevo (montañas y bosques) para ordenarlos por fila con ellos.
 */
export class BuildingLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  private readonly buildings: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.object = scene.add.container(0, 0);
  }

  /** Añade un sprite de terreno (montaña, bosque); hay que llamar a `sort` al acabar. */
  addProp(img: Phaser.GameObjects.Image): void {
    this.object.add(img);
  }

  sync(s: GameState, vis: boolean[][]): void {
    const tex = this.scene.textures;
    s.buildings.forEach((b, i) => {
      const key = buildingKey(tex, s, b, vis[b.x]![b.y]!);
      let img = this.buildings[i];
      if (!key) {
        img?.setVisible(false);
        return;
      }
      if (!img) {
        img = tileImage(this.scene, key, b.x, b.y);
        this.buildings[i] = img;
        this.object.add(img);
      } else if (img.texture.key !== key) {
        img.setTexture(ATLAS, key);
        fitToTile(img);
        const foot = tileFoot(b.x, b.y);
        img.setPosition(foot.x, foot.y);
      }
      img.setVisible(true);
    });
    this.sort();
  }

  /** Lo que esta mas abajo en el mapa se dibuja delante (los sprites tienen el origen abajo). */
  sort(): void {
    this.object.sort('y');
  }
}
