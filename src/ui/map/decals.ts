import type Phaser from 'phaser';
import type { Pos } from '../../core/model';
import { TILE } from '../../layout';
import { PAL_MAP } from '../palette';
import { fillRects } from '../pixelDraw';
import type { MapLayer } from './layer';

/** Dias que dura un quemado: se quita cuando han pasado estos dias desde que se hizo. */
const SCORCH_DAYS = 2;
/** Altura del centro del quemado sobre el borde de abajo de la casilla (a los pies de la unidad). */
const SCORCH_LIFT = 7;
/** Motas sueltas alrededor del quemado (desde su centro). */
const SCORCH_SPECKS = [
  [-12, 0],
  [11, -1],
  [-4, -6],
  [5, 5],
  [0, -1],
] as const;

/** Marcas en el suelo (quemados donde ha caido una unidad), bajo edificios y unidades. */
export class DecalLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Container;
  /** Marcas de quemado y dia en que se hicieron. */
  private scorches: { g: Phaser.GameObjects.Graphics; day: number }[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.object = scene.add.container(0, 0);
  }

  /** Marca de quemado bajo las unidades: dura hasta el turno siguiente (ver prune). */
  scorch(p: Pos, day: number): void {
    const g = this.scene.add.graphics();
    const cx = p.x * TILE + TILE / 2,
      cy = p.y * TILE + TILE - SCORCH_LIFT;
    fillRects(g, PAL_MAP.scorch, 0.55, [
      [cx - 10, cy - 2, 20, 5],
      [cx - 7, cy - 4, 14, 9],
    ]);
    fillRects(
      g,
      PAL_MAP.scorchSpeck,
      0.6,
      SCORCH_SPECKS.map(([dx, dy]) => [cx + dx, cy + dy, 2, 2] as const),
    );
    this.object.add(g);
    this.scorches.push({ g, day });
  }

  /** Quita las marcas de hace mas de un dia. */
  prune(day: number): void {
    this.scorches = this.scorches.filter((m) => {
      if (day - m.day < SCORCH_DAYS) return true;
      m.g.destroy();
      return false;
    });
  }
}
