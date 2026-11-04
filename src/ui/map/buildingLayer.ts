import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import type { Building, GameState } from '../../core/model';
import { cellAt } from '../../core/util/grid';
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
  addProp(image: Phaser.GameObjects.Image): void {
    this.object.add(image);
  }

  sync(s: GameState, vis: boolean[][]): void {
    s.buildings.forEach((building, i) => this.syncBuilding(s, building, i, cellAt(vis, building)));
    this.sort();
  }

  /** Pone al dia el sprite numero `index` (lo crea la primera vez; lo esconde si no tiene dibujo). */
  private syncBuilding(s: GameState, building: Building, index: number, isVisible: boolean): void {
    const key = buildingKey(this.scene.textures, s, building, isVisible);
    const existing = this.buildings[index];
    if (!key) {
      existing?.setVisible(false);
      return;
    }
    if (!existing) {
      const image = tileImage(this.scene, key, building.x, building.y);
      this.buildings[index] = image;
      this.object.add(image);
      image.setVisible(true);
      return;
    }
    // Ojo: texture.key es siempre 'atlas' y `key` es un fotograma, asi que esto se cumple siempre y
    // el dibujo se vuelve a poner en cada render. Comparar con frame.name ahorraria trabajo; queda
    // pendiente para no cambiar lo que hace en una limpieza.
    if (existing.texture.key !== key) {
      existing.setTexture(ATLAS, key);
      fitToTile(existing);
      const foot = tileFoot(building.x, building.y);
      existing.setPosition(foot.x, foot.y);
    }
    existing.setVisible(true);
  }

  /** Lo que esta mas abajo en el mapa se dibuja delante (los sprites tienen el origen abajo). */
  sort(): void {
    this.object.sort('y');
  }
}
