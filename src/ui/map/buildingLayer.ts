import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import { posOf, samePos } from '../../core/geom';
import type { Building, GameState, Pos, TeamId } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { TILE } from '../../layout';
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
  /** Casilla de cada dibujo, apuntada al ponerlo (los que se destruyen salen solos). */
  private readonly tileOf = new WeakMap<Phaser.GameObjects.Image, Pos>();

  constructor(private readonly scene: Phaser.Scene) {
    this.object = scene.add.container(0, 0);
  }

  /** Añade un sprite de terreno (montaña, bosque) puesto en `tile`; hay que llamar a `sort` al acabar. */
  addProp(image: Phaser.GameObjects.Image, tile: Pos): void {
    this.place(image, posOf(tile));
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
      this.place(image, posOf(building));
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

  /** Dibujos que se ven en `tile` y son mas altos que la casilla: sobresalen por detras (ver map/overhangLayer.ts). */
  tallAt(tile: Pos): Phaser.GameObjects.Image[] {
    return this.object.list.filter(isImage).filter((image) => isTall(image) && this.isPlacedOn(image, tile));
  }

  private place(image: Phaser.GameObjects.Image, tile: Pos): void {
    this.tileOf.set(image, tile);
    this.object.add(image);
  }

  private isPlacedOn(image: Phaser.GameObjects.Image, tile: Pos): boolean {
    const placedOn = this.tileOf.get(image);
    return !!placedOn && samePos(placedOn, tile);
  }
}

const isImage = (child: Phaser.GameObjects.GameObject): child is Phaser.GameObjects.Image => child.type === 'Image';

const isTall = (image: Phaser.GameObjects.Image): boolean => image.visible && image.displayHeight > TILE;
