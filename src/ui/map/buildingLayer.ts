import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import { samePos } from '../../core/geom';
import type { Building, GameState, Pos, TeamId } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { TILE } from '../../layout';
import { buildingKey } from '../sprites';
import type { MapLayer } from './layer';
import { fitToTile, footTile, tileFoot, tileImage } from './tileImage';

const isImage = (child: Phaser.GameObjects.GameObject): child is Phaser.GameObjects.Image => child.type === 'Image';

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

  sync(s: GameState, vis: Grid<boolean>, viewer: TeamId): void {
    s.buildings.forEach((building, i) => this.syncBuilding(s, building, i, vis.at(building), viewer));
    this.sort();
  }

  /** Pone al dia el sprite numero `index` (lo crea la primera vez; lo esconde si no tiene dibujo). */
  private syncBuilding(s: GameState, building: Building, index: number, isVisible: boolean, viewer: TeamId): void {
    const key = buildingKey(this.scene.textures, s, building, isVisible, viewer);
    const existing = this.buildings[index];
    if (!key) {
      existing?.setVisible(false);
      return;
    }
    if (!existing) {
      const image = tileImage(this.scene, key, building);
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
      const foot = tileFoot(building);
      existing.setPosition(foot.x, foot.y);
    }
    existing.setVisible(true);
  }

  /** Lo que esta mas abajo en el mapa se dibuja delante (los sprites tienen el origen abajo). */
  sort(): void {
    this.object.sort('y');
  }

  /** Dibujos visibles de la casilla `tile` que sobresalen hacia la de arriba (ver map/overhangs.ts). */
  tallAt(tile: Pos): Phaser.GameObjects.Image[] {
    return this.object.list.filter(
      (child): child is Phaser.GameObjects.Image =>
        isImage(child) && child.visible && child.displayHeight > TILE && samePos(footTile(child), tile),
    );
  }
}
