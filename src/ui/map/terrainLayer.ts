import type Phaser from 'phaser';
import { addSheetFrames, ATLAS, hasImage, sheetFrame } from '../../atlas';
import type { GameState } from '../../core/types';
import { TILE } from '../../layout';
import { ANIM_FRAMES } from '../sheets';
import { shoreKeys, terrainKey } from '../sprites';
import { paintTerrain, terrainObjects, waterAnimCells, type AnimCell } from '../terrainArt';
import type { BuildingLayer } from './buildingLayer';
import { forEachTile } from './geometry';
import { stepOf, type AnimatedLayer, type MapClock, type MapLayer } from './layer';
import { tileImage } from './tileImage';

/** Cada cuanto cambia el fotograma del agua animada. */
const WATER_FRAME_MS = 140;

/**
 * Terreno: se crea una vez por partida (no cambia). Dibujo nuevo: un lienzo pintado una vez
 * (terrainArt.ts), agua animada por casilla y montañas y bosques como sprites en la capa de los
 * edificios. Dibujo de 2013: una imagen por casilla y sus orillas.
 */
export class TerrainLayer implements MapLayer, AnimatedLayer {
  readonly object: Phaser.GameObjects.Container;
  /** Agua animada: una imagen por casilla con su lamina (anim/water o anim/shore_<set>) y fila. */
  private waterAnim: { img: Phaser.GameObjects.Image; cell: AnimCell }[] = [];
  private waterFrame = -1;
  /** Montañas y bosques: en la capa de los edificios, ordenados por fila con ellos. */
  private props: Phaser.GameObjects.Image[] = [];

  /** `bakeKey`: clave propia del lienzo del terreno (el menu y la partida tienen cada uno la suya). */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bakeKey: string,
    private readonly buildings: BuildingLayer,
  ) {
    this.object = scene.add.container(0, 0);
  }

  /** Terreno y orillas: solo al empezar la partida. `newArt`: dibujo nuevo elegido y cargado. */
  build(s: GameState, newArt: boolean): void {
    this.object.removeAll(true);
    this.waterAnim = [];
    for (const o of this.props) o.destroy();
    this.props = [];
    if (newArt) this.buildNew(s);
    else this.buildClassic(s);
  }

  private buildNew(s: GameState): void {
    const tex = this.scene.textures;
    // Terreno nuevo: pintado una vez en un lienzo.
    if (tex.exists(this.bakeKey)) tex.remove(this.bakeKey);
    tex.addCanvas(this.bakeKey, paintTerrain(tex, s));
    this.object.add(this.scene.add.image(0, 0, this.bakeKey).setOrigin(0));
    // Agua animada: piezas precompiladas, una por casilla; en tick() solo se cambia el fotograma.
    for (const cell of waterAnimCells(s)) {
      addSheetFrames(tex, cell.key, ANIM_FRAMES, TILE);
      const img = this.scene.add.image(cell.x * TILE, cell.y * TILE, ATLAS, sheetFrame(cell.key, cell.row, 0)).setOrigin(0);
      this.waterAnim.push({ img, cell });
      this.object.add(img);
    }
    this.waterFrame = -1;
    for (const o of terrainObjects(tex, s)) {
      const img = tileImage(this.scene, o.key, o.x, o.y);
      this.props.push(img);
      this.buildings.addProp(img);
    }
    this.buildings.sort();
  }

  private buildClassic(s: GameState): void {
    const objs: Phaser.GameObjects.GameObject[] = [];
    forEachTile((x, y) => {
      objs.push(tileImage(this.scene, terrainKey(s.map[x]![y]!), x, y));
      for (const k of shoreKeys(s, x, y)) {
        if (hasImage(this.scene.textures, k))
          objs.push(
            this.scene.add
              .image(x * TILE, y * TILE, ATLAS, k)
              .setOrigin(0)
              .setDisplaySize(TILE, TILE),
          );
      }
    });
    this.object.add(objs);
  }

  /** Agua animada: cambia de fotograma cada WATER_FRAME_MS (cada casilla con su desfase). */
  tick(clock: MapClock): void {
    if (!this.waterAnim.length) return;
    const f = stepOf(clock, WATER_FRAME_MS, ANIM_FRAMES);
    if (f === this.waterFrame) return;
    this.waterFrame = f;
    for (const { img, cell } of this.waterAnim) img.setFrame(sheetFrame(cell.key, cell.row, (f + cell.phase) % ANIM_FRAMES));
  }

  /** Suelta el lienzo del terreno (los objetos los destruye la escena al cerrarse). */
  destroy(): void {
    const tex = this.scene.textures;
    if (tex.exists(this.bakeKey)) tex.remove(this.bakeKey);
  }
}
