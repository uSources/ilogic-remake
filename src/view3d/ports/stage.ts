/**
 * Lo que los sucesos animados (systems/events) piden al motor: leer como esta una pieza, moverla y
 * poner efectos en un sitio. Los sitios son datos (`Spot`: la boca o los pies de una pieza, una
 * casilla), no puntos del mundo: el motor los convierte (engine/fx/spots.ts). Lo implementa el motor
 * (engine/fx/) y los tests, con puertos falsos (docs/PLAN-VISTA3D.md, "Los puertos").
 */
import type { MovementMotion } from '../../core/content';
import type { Pos } from '../../core/model';

/** Las clases de bocanada (humo, polvo, fuego): el motor dice como se ve cada una (particles.ts, PUFFS). */
export type PuffKind = 'smoke' | 'darkSmoke' | 'dust' | 'blast' | 'gunSmoke';

/** Un sitio del tablero donde sale un efecto. */
export type Spot =
  /** De donde sale (y a donde llega) un disparo: el cuerpo de la pieza, algo por encima. */
  | { kind: 'muzzle'; uid: number }
  /** El suelo bajo la pieza. */
  | { kind: 'feet'; uid: number }
  /** El suelo de una casilla, `lift` casillas por encima. */
  | { kind: 'tile'; pos: Pos; lift: number };

/** Lo que se sabe de la pieza de una unidad al ir a animarla. */
export interface ShownPiece {
  /** Como se mueve (movements.json, "motion"): su paso, su disparo y si deja restos. */
  readonly motion: MovementMotion;
  /** La niebla no la tapa: lo que no se ve no se anima (no se delata). */
  readonly isVisible: boolean;
}

export interface PieceLookup {
  /** La pieza de esa unidad tal como esta ahora (null: no hay pieza). */
  pieceOf(uid: number): ShownPiece | null;
  /** Distancia en el mundo (casillas) de la boca de una pieza a la de otra: de lejos se dispara en arco. */
  shotDistance(shooter: number, target: number): number;
}

/** Las animaciones de su modelo que se piden por nombre (el resto, como 'fire', las pone el motor). */
export type PieceClip = 'drive' | 'idle';

/** Mover las piezas. Si no hay pieza de esa unidad, no se hace nada. */
export interface PieceStage {
  playClip(uid: number, clip: PieceClip): void;
  /** Un paso de una casilla a la de al lado, girando hacia alli y dejando huella. */
  walk(uid: number, from: Pos, to: Pos): Promise<void>;
  /** Gira la torreta (o la pieza entera) hacia otra pieza. */
  aim(uid: number, target: number): Promise<void>;
  /** El golpe de vuelta al disparar. */
  recoil(uid: number): Promise<void>;
  /** La sacudida al recibir un golpe. */
  shake(uid: number): Promise<void>;
  /** La vida de la unidad baja `damage` puntos: su porcentaje cuenta hacia abajo y sus tramos se vacian. */
  drainLife(uid: number, damage: number): Promise<void>;
  /** Dos saltitos en su sitio. */
  hop(uid: number): Promise<void>;
  /** Cae y se esconde: se ladea y quema hasta el suelo (y deja sus restos) o vuelca y desaparece. */
  fall(uid: number, leavesWreck: boolean): Promise<void>;
}

/** Efectos de un momento en un sitio del tablero. */
export interface EffectStage {
  /** En arco si `isArc` (artilleria, misiles). */
  projectile(from: Spot, to: Spot, isArc: boolean): Promise<void>;
  sparks(at: Spot, power: number): Promise<void>;
  /** Un texto que sube y se desvanece. */
  text(at: Spot, text: string, color: string): Promise<void>;
  puff(kind: PuffKind, at: Spot, count: number): void;
  /** Una mancha quemada en el suelo. */
  scorch(at: Spot): void;
}
