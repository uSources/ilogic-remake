/**
 * Los sonidos del tablero (`SoundStage`, ports/stage.ts): pasa el sitio que piden los sistemas a un punto
 * del mundo y se lo da a quien suena (`SoundHost`, el audio, que lo junta la raiz de composicion). El
 * motor no sabe de Web Audio.
 */
import type { SoundName } from '../../../audio/sounds';
import type { Point3 } from '../../ports/camera';
import type { SoundStage, Spot } from '../../ports/stage';
import { worldOf, type SpotBoard } from './spots';

/** Hacer sonar un efecto en un punto del mundo (null: sin sitio). */
export interface SoundHost {
  playAt(sound: SoundName, at: Point3 | null): void;
}

export class SpotSoundStage implements SoundStage {
  constructor(
    private readonly board: SpotBoard,
    private readonly host: SoundHost,
  ) {}

  /** Si el sitio es de una pieza que ya no esta, suena sin sitio. */
  play(sound: SoundName, at?: Spot): void {
    const point = at ? worldOf(at, this.board) : null;
    this.host.playAt(sound, point ? { x: point.x, y: point.y, z: point.z } : null);
  }
}
