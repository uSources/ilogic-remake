/**
 * Los pasos con los que se anima un suceso: datos, sin three.js. Los decide eventSteps.ts (que pasos
 * lleva cada suceso) y los cumple timeline.ts sobre los puertos del motor (ports/stage.ts). Un paso
 * nuevo es una forma mas aqui y su entrada en STEP_RUNNERS (timeline.ts): el compilador pide las dos.
 */
import type { SoundId } from '../../../audio/sounds';
import type { Pos } from '../../../core/model';
import type { PieceClip, PuffKind, Spot } from '../../ports/stage';

export type AnimationStep =
  /** Suena a la vez que se ve el paso siguiente (no espera). */
  | { kind: 'sound'; sound: SoundId }
  | { kind: 'clip'; uid: number; clip: PieceClip }
  | { kind: 'walk'; uid: number; from: Pos; to: Pos }
  | { kind: 'aim'; uid: number; target: number }
  | { kind: 'recoil'; uid: number }
  | { kind: 'projectile'; from: Spot; to: Spot; isArc: boolean }
  | { kind: 'shake'; uid: number }
  /** La vida que se ve, sin animar: la de antes del combate (el tablero ya esta como queda despues). */
  | { kind: 'lifeShown'; uid: number; life: number }
  /** La vida baja de `from` a `to`: el porcentaje cuenta hacia abajo y los tramos se vacian. */
  | { kind: 'lifeLoss'; uid: number; from: number; to: number }
  | { kind: 'hop'; uid: number }
  | { kind: 'fall'; uid: number; leavesWreck: boolean }
  | { kind: 'sparks'; at: Spot; power: number }
  | { kind: 'explosion'; at: Spot; ground: Spot; size: number }
  | { kind: 'text'; at: Spot; text: string; color: string }
  | { kind: 'puff'; puff: PuffKind; at: Spot; count: number }
  | { kind: 'scorch'; at: Spot }
  /** Estos pasos a la vez; acaba cuando acaba el mas largo. */
  | { kind: 'together'; steps: readonly AnimationStep[] };

export type AnimationStepKind = AnimationStep['kind'];
export type StepOf<K extends AnimationStepKind> = Extract<AnimationStep, { kind: K }>;

export const muzzle = (uid: number): Spot => ({ kind: 'muzzle', uid });
export const feet = (uid: number): Spot => ({ kind: 'feet', uid });
export const together = (...steps: AnimationStep[]): AnimationStep => ({ kind: 'together', steps });
export const sound = (id: SoundId): AnimationStep => ({ kind: 'sound', sound: id });
