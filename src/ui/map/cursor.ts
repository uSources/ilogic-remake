import type Phaser from 'phaser';
import { ATLAS } from '../../atlas';
import type { Pos } from '../../core/model';
import { TILE } from '../../layout';
import { PAL } from '../palette';
import { stepOf, type AnimatedLayer, type MapClock, type MapLayer } from './layer';

/** Separacion de las esquinas por fuera de la casilla en cada paso (0, 1, 2, 1...): pixel entero. */
const GAP_STEPS = [0, 1, 2, 1] as const;
/** Separacion con todo quieto. */
const GAP_STILL = 1;
const GAP_STEP_MS = 160;

/** Marco de la casilla señalada: cuatro esquinas (ui/esquina) que se separan y se juntan. */
export class MapCursor implements MapLayer, AnimatedLayer {
  readonly object: Phaser.GameObjects.Container;
  private readonly corners: Phaser.GameObjects.Image[];
  private gap = -1;
  private tinted = false;
  /** Marco rojo: eligiendo objetivo de ataque (lo pone MapView antes de cada tick). */
  attack = false;

  constructor(scene: Phaser.Scene) {
    this.corners = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ].map(([fx, fy]) => scene.add.image(0, 0, ATLAS, 'ui/esquina').setOrigin(0).setFlip(fx!, fy!));
    this.object = scene.add.container(0, 0, this.corners);
    this.layout(GAP_STILL);
  }

  place(pos: Pos, visible: boolean): void {
    this.object.setPosition(pos.x * TILE, pos.y * TILE).setVisible(visible);
  }

  /** Coloca las esquinas `gap` pixeles por fuera de la casilla. */
  private layout(gap: number): void {
    if (gap === this.gap) return;
    this.gap = gap;
    const cornerSize = this.corners[0]!.width;
    const far = TILE - cornerSize + gap;
    const pos = [
      [-gap, -gap],
      [far, -gap],
      [-gap, far],
      [far, far],
    ];
    this.corners.forEach((img, i) => img.setPosition(pos[i]![0], pos[i]![1]));
  }

  /** Parpadeo por pasos de pixel entero (se mueve sin emborronar las esquinas) y color de ataque. */
  tick(clock: MapClock): void {
    this.layout(clock.still ? GAP_STILL : GAP_STEPS[stepOf(clock, GAP_STEP_MS, GAP_STEPS.length)]!);
    if (this.attack !== this.tinted) {
      this.tinted = this.attack;
      for (const img of this.corners) {
        if (this.attack) img.setTint(PAL.red);
        else img.clearTint();
      }
    }
  }
}
