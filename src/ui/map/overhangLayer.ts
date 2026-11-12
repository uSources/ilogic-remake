import type Phaser from 'phaser';
import { samePos } from '../../core/geom';
import type { Pos } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { TILE } from '../../layout';
import { TINT_FILL } from '../palette';
import { sideColor } from '../sides';
import type { BuildingLayer } from './buildingLayer';
import { tileInFront } from './geometry';
import type { MapLayer } from './layer';
import type { VisibleUnit } from './unitLayer';

/** Lo que sobresale delante de una unidad: casi opaco, para que la unidad se intuya detras. */
const COVER_ALPHA = 0.85;
/** Con el cursor encima de la unidad tapada: casi transparente, para verla entera. */
const PEEK_ALPHA = 0.3;
/** Silueta de la parte tapada, del color de su lado: se ve donde esta sin borrar el arbol. */
const SILHOUETTE_ALPHA = 0.45;

/** Unidad con algo alto delante, con lo que la tapa ya dibujado en esta capa. */
interface CoveredUnit {
  tile: Pos;
  /** Lo que sobresale de cada dibujo alto de la casilla de delante. */
  covers: Phaser.GameObjects.Image[];
  /** La parte tapada de la unidad, del color de su lado. */
  silhouette: Phaser.GameObjects.Image;
}

/**
 * Lo que sobresale de los dibujos altos (copas de arbol, tejados) por encima de la unidad que esta
 * justo detras (una fila mas arriba), con la silueta de la parte tapada.
 *
 * Por que una capa aparte: las unidades van encima de la capa de edificios, asi que sin esto una
 * unidad detras de un arbol se pintaria delante de su copa. Juntar unidades y edificios en una sola
 * capa ordenada por fila lo arreglaria, pero dejaria los resaltados y las flechas por debajo de los
 * arboles. Esta capa va encima de las unidades y debajo de las marcas.
 */
export class OverhangLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  private covered: CoveredUnit[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buildings: BuildingLayer,
  ) {
    this.object = scene.add.container(0, 0);
  }

  /** Rehace lo que tapa a cada unidad que se ve ahora. */
  sync(units: readonly VisibleUnit[], vis: Grid<boolean>, cursor: Pos | null): void {
    this.object.removeAll(true);
    this.covered = [];
    for (const unit of units) {
      const talls = this.tallsInFront(unit.tile, vis);
      if (talls.length > 0) this.covered.push(this.cover(unit, talls));
    }
    this.peek(cursor);
  }

  /** Con el cursor sobre una unidad tapada, lo de delante se aclara y la silueta se quita: asi se ve y se elige bien. */
  peek(cursor: Pos | null): void {
    for (const { tile, covers, silhouette } of this.covered) {
      const isPeeked = !!cursor && samePos(cursor, tile);
      for (const cover of covers) cover.setAlpha(isPeeked ? PEEK_ALPHA : COVER_ALPHA);
      silhouette.setVisible(!isPeeked);
    }
  }

  /** Dibujos altos de la casilla de delante de `tile`, si se ve (bajo la niebla no se pinta nada encima). */
  private tallsInFront(tile: Pos, vis: Grid<boolean>): Phaser.GameObjects.Image[] {
    const front = tileInFront(tile);
    return vis.atClamped(front) ? this.buildings.tallAt(front) : [];
  }

  private cover(unit: VisibleUnit, talls: Phaser.GameObjects.Image[]): CoveredUnit {
    const covers = talls.map((tall) => this.topOf(tall));
    const coveredHeight = Math.max(...talls.map(overhangHeight));
    return { tile: unit.tile, covers, silhouette: this.silhouetteOf(unit, coveredHeight) };
  }

  /** Copia del dibujo alto recortada a lo que sobresale de su casilla. */
  private topOf(tall: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
    const copy = this.copyOf(tall, tall.x, tall.y);
    copy.setCrop(0, 0, tall.frame.width, tall.frame.height - TILE);
    return copy;
  }

  /** Silueta de los `coveredHeight` pixeles de abajo de la unidad: lo que queda tapado. */
  private silhouetteOf(unit: VisibleUnit, coveredHeight: number): Phaser.GameObjects.Image {
    const { image } = unit;
    const root = image.parentContainer;
    const copy = this.copyOf(image, root.x + image.x, root.y + image.y);
    copy.setTint(sideColor(unit.side)).setTintMode(TINT_FILL).setAlpha(SILHOUETTE_ALPHA);
    copy.setCrop(0, image.frame.height - coveredHeight, image.frame.width, coveredHeight);
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

/** Pixeles que un dibujo alto sobresale por encima de su casilla. */
const overhangHeight = (tall: Phaser.GameObjects.Image): number => tall.displayHeight - TILE;
