import type Phaser from 'phaser';
import type { Pos } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { TILE } from '../../layout';
import { sideColor, type Side } from '../sides';
import type { BuildingLayer } from './buildingLayer';
import type { MapLayer } from './layer';
import { isPeekedAt, overhangsOver, type Overhang } from './overhangs';
import { TINT_FILL } from './tileImage';

/** Trozo que sobresale delante de una unidad: casi opaco, para que la unidad se intuya detras. */
const COVER_ALPHA = 0.85;
/** Con el cursor encima de la unidad tapada: casi transparente, para verla entera. */
const PEEK_ALPHA = 0.3;
/** Silueta de la parte tapada, del color de su lado: se ve donde esta sin borrar el arbol. */
const SILHOUETTE_ALPHA = 0.45;

/** Lo que la capa necesita de la de unidades. */
export interface DrawnUnits {
  tiles(): Pos[];
  drawnAt(tile: Pos): { image: Phaser.GameObjects.Image; side: Side } | null;
}

interface DrawnOverhang {
  overhang: Overhang;
  covers: Phaser.GameObjects.Image[];
  silhouette: Phaser.GameObjects.Image | null;
}

/**
 * Lo que sobresale de los dibujos altos (copas de arbol, tejados) por encima de la unidad que esta
 * justo detras, con la silueta de la parte tapada. Va encima de las unidades y debajo de las marcas
 * (ver map/overhangs.ts).
 */
export class OverhangLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  private drawn: DrawnOverhang[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buildings: BuildingLayer,
  ) {
    this.object = scene.add.container(0, 0);
  }

  /** Rehace los trozos para las unidades que se ven ahora. */
  sync(units: DrawnUnits, vis: Grid<boolean>, cursor: Pos | null): void {
    this.object.removeAll(true);
    const isTallAndVisible = (tile: Pos) => vis.atClamped(tile) && this.buildings.tallAt(tile).length > 0;
    this.drawn = overhangsOver(units.tiles(), isTallAndVisible).map((overhang) => {
      const talls = this.buildings.tallAt(overhang.owner);
      const covers = talls.map((tall) => this.topOf(tall));
      const coveredHeight = Math.max(...talls.map((tall) => tall.displayHeight - TILE));
      const unit = units.drawnAt(overhang.hidden);
      return { overhang, covers, silhouette: unit && this.silhouetteOf(unit.image, unit.side, coveredHeight) };
    });
    this.peek(cursor);
  }

  /** Aclara el trozo que tapa la unidad bajo el cursor (sin silueta: ya se ve) y deja los demas como estaban. */
  peek(cursor: Pos | null): void {
    for (const { overhang, covers, silhouette } of this.drawn) {
      const isPeeked = isPeekedAt(overhang, cursor);
      for (const cover of covers) cover.setAlpha(isPeeked ? PEEK_ALPHA : COVER_ALPHA);
      silhouette?.setVisible(!isPeeked);
    }
  }

  /** Copia del dibujo alto recortada a lo que sobresale de su casilla. */
  private topOf(tall: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
    const copy = this.copyOf(tall, tall.x, tall.y);
    copy.setCrop(0, 0, tall.frame.width, tall.frame.height - TILE);
    return copy;
  }

  /** Silueta de la parte de abajo de la unidad (`coveredHeight` pixeles), lo que queda tapado. */
  private silhouetteOf(unit: Phaser.GameObjects.Image, side: Side, coveredHeight: number): Phaser.GameObjects.Image {
    const root = unit.parentContainer;
    const copy = this.copyOf(unit, root.x + unit.x, root.y + unit.y);
    copy.setTint(sideColor(side)).setTintMode(TINT_FILL).setAlpha(SILHOUETTE_ALPHA);
    copy.setCrop(0, unit.frame.height - coveredHeight, unit.frame.width, coveredHeight);
    return copy;
  }

  /** Imagen igual que `source` (mismo dibujo, tamaño y volteo) en otro sitio, dentro de esta capa. */
  private copyOf(source: Phaser.GameObjects.Image, x: number, y: number): Phaser.GameObjects.Image {
    const copy = this.scene.add.image(x, y, source.texture.key, source.frame.name);
    copy.setOrigin(source.originX, source.originY).setDisplaySize(source.displayWidth, source.displayHeight).setFlipX(source.flipX);
    this.object.add(copy);
    return copy;
  }
}
