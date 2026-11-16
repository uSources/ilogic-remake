/**
 * El motor de los efectos de un momento (ports/stage.ts, `EffectStage`): proyectiles, chispas, textos
 * que suben (fx.ts), bocanadas (particles.ts) y manchas en el suelo (groundMarks.ts), en el punto del
 * mundo de cada sitio (spots.ts). Un sitio de una pieza que ya no esta no pone nada.
 */
import type * as THREE from 'three';
import type { EffectStage, PuffKind, Spot } from '../../ports/stage';
import { floatingText, projectile, sparks, type FxHost } from '../../fx';
import { worldOf, type SpotBoard } from './spots';

export interface EffectStageHost extends FxHost {
  board: SpotBoard;
  puff(kind: PuffKind, at: THREE.Vector3, count: number): void;
  scorch(at: THREE.Vector3): void;
}

export class FxEffectStage implements EffectStage {
  constructor(private readonly host: EffectStageHost) {}

  async projectile(from: Spot, to: Spot, isArc: boolean): Promise<void> {
    const start = this.at(from);
    const end = this.at(to);
    if (start && end) await projectile(this.host, start, end, isArc);
  }

  async sparks(at: Spot, power: number): Promise<void> {
    const point = this.at(at);
    if (point) await sparks(this.host, point, power);
  }

  async text(at: Spot, text: string, color: string): Promise<void> {
    const point = this.at(at);
    if (point) await floatingText(this.host, point, text, color);
  }

  puff(kind: PuffKind, at: Spot, count: number): void {
    const point = this.at(at);
    if (point) this.host.puff(kind, point, count);
  }

  scorch(at: Spot): void {
    const point = this.at(at);
    if (point) this.host.scorch(point);
  }

  private at(spot: Spot): THREE.Vector3 | null {
    return worldOf(spot, this.host.board);
  }
}
