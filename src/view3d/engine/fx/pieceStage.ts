/**
 * El motor de las piezas animadas (ports/stage.ts, `PieceStage` y `PieceLookup`): mueve, gira, sacude
 * y tumba los objetos de three.js de las piezas del tablero. No decide que se hace ni cuando: eso lo
 * dicen los pasos de systems/events.
 */
import * as THREE from 'three';
import type { MovementMotion } from '../../../core/content';
import { MAX_LIFE } from '../../../core/data';
import type { Pos } from '../../../core/model';
import type { PieceClip, PieceLookup, PieceStage, PuffKind, ShownPiece } from '../../ports/stage';
import { tint } from '../pieces/tint';
import type { UnitPiece } from '../pieces/unitPiece';
import { facingAngle } from '../core/space';
import { muzzleOf, type SpotBoard } from './spots';

/** Segundos por casilla al moverse. */
const STEP_SECONDS = 0.18;
/** Lo que se levanta la pieza a mitad de cada paso (un saltito de juguete). */
const STEP_HOP = 0.08;
/** El giro de cada paso acaba en el primer tercio: primero se encara y luego avanza. */
const TURN_SPEEDUP = 3;
/** En que momentos de cada paso se deja huella (y polvo, si es un vehiculo): a mitad y al llegar. */
const MARK_MOMENTS = [0.5, 1] as const;
/** Donde sale (casillas por detras de un vehiculo) y cuanto es el polvo de cada huella. */
const DUST_BEHIND = 0.35;
const DUST_LIFT = 0.05;
const DUST_PUFFS = 3;
const AIM_SECONDS = 0.18;
const RECOIL_SECONDS = 0.12;
const RECOIL = 0.12;
const SHAKE_SECONDS = 0.25;
const SHAKE_WIDTH = 0.05;
const SHAKE_SWINGS = 3;
const FALL_SECONDS = 0.5;
/** Lo que vuelca (radianes) y lo que encoge una pieza que desaparece. */
const VANISH_TILT = 1.4;
const VANISH_SHRINK = 0.9;
/** Lo que se ladean y lo oscuros que quedan los restos (tanto por uno de su color). */
const WRECK_TILT = 0.3;
const CHARRED = 0.22;
const HOP_SECONDS = 0.4;
const HOP = 0.12;
const HOPS = 2;
/** La vida que baja al recibir un golpe, y cuanto se hincha la chapa al empezar (1 = normal). */
const LIFE_DRAIN_SECONDS = 0.6;
const LIFE_PULSE = 0.35;

/** Lo que necesita: las piezas, el reloj del mundo y donde quedan huellas, polvo y restos. */
export interface PieceStageHost {
  board: SpotBoard;
  animate(seconds: number, step: (progress: number) => void): Promise<void>;
  mark(at: THREE.Vector3, heading: number, motion: MovementMotion): void;
  puff(kind: PuffKind, at: THREE.Vector3, count: number): void;
  /** Deja los restos de ese modelo donde esta (wrecks.ts). */
  wreck(model: THREE.Object3D): void;
}

/** El giro mas corto de `from` a `to` (sin dar la vuelta entera). */
const shortestTurn = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export class BoardPieceStage implements PieceStage, PieceLookup {
  constructor(private readonly host: PieceStageHost) {}

  pieceOf(uid: number): ShownPiece | null {
    const piece = this.host.board.pieceOf(uid);
    return piece ? { motion: piece.motion, isVisible: piece.object.visible } : null;
  }

  shotDistance(shooter: number, target: number): number {
    const from = this.host.board.pieceOf(shooter);
    const to = this.host.board.pieceOf(target);
    return from && to ? muzzleOf(from).distanceTo(muzzleOf(to)) : 0;
  }

  playClip(uid: number, clip: PieceClip): void {
    this.host.board.pieceOf(uid)?.glb?.play(clip);
  }

  async walk(uid: number, from: Pos, to: Pos): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    if (!piece) return;
    const { object } = piece;
    const start = this.host.board.groundOf(from);
    const end = this.host.board.groundOf(to);
    const startAngle = object.rotation.y;
    const turn = shortestTurn(startAngle, facingAngle(from, to));
    let marked = 0;
    await this.host.animate(STEP_SECONDS, (progress) => {
      object.position.lerpVectors(start, end, progress);
      object.position.y += Math.sin(progress * Math.PI) * STEP_HOP;
      object.rotation.y = startAngle + turn * Math.min(progress * TURN_SPEEDUP, 1);
      for (; marked < MARK_MOMENTS.length && progress >= MARK_MOMENTS[marked]!; marked++)
        this.leaveTrace(piece, new THREE.Vector3().lerpVectors(start, end, progress));
    });
  }

  /** La huella en el suelo y, si es un vehiculo, una nube de polvo detras. */
  private leaveTrace(piece: UnitPiece, ground: THREE.Vector3): void {
    const heading = piece.object.rotation.y;
    this.host.mark(ground, heading, piece.motion);
    if (piece.motion !== 'drive') return;
    const behind = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(-DUST_BEHIND);
    this.host.puff(
      'dust',
      ground
        .clone()
        .add(behind)
        .add(new THREE.Vector3(0, DUST_LIFT, 0)),
      DUST_PUFFS,
    );
  }

  /** Gira la torreta (o la pieza entera si no tiene) hacia la otra pieza. */
  async aim(uid: number, target: number): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    const goalPiece = this.host.board.pieceOf(target);
    if (!piece || !goalPiece) return;
    const turning = piece.turret ?? piece.object;
    const delta = goalPiece.object.position.clone().sub(piece.object.position);
    const worldAngle = Math.atan2(delta.x, delta.z);
    const goal = piece.turret ? worldAngle - piece.object.rotation.y : worldAngle;
    const start = turning.rotation.y;
    const turn = shortestTurn(start, goal);
    await this.host.animate(AIM_SECONDS, (progress) => (turning.rotation.y = start + turn * progress));
  }

  /** La animacion 'fire' del modelo si la tiene; si no, el cuerpo se echa atras y vuelve. */
  async recoil(uid: number): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    if (!piece) return;
    if (piece.glb) {
      piece.glb.play('fire');
      return this.host.animate(RECOIL_SECONDS, () => undefined);
    }
    const back = new THREE.Vector3(0, 0, -RECOIL).applyAxisAngle(new THREE.Vector3(0, 1, 0), piece.turret?.rotation.y ?? 0);
    const rest = piece.body.position.clone();
    await this.host.animate(RECOIL_SECONDS, (progress) =>
      piece.body.position.copy(rest).addScaledVector(back, Math.sin(progress * Math.PI)),
    );
  }

  async shake(uid: number): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    if (!piece) return;
    const rest = piece.body.position.clone();
    await this.host.animate(SHAKE_SECONDS, (progress) => {
      piece.body.position.copy(rest);
      piece.body.position.x += Math.sin(progress * Math.PI * 2 * SHAKE_SWINGS) * SHAKE_WIDTH * (1 - progress);
    });
  }

  showLife(uid: number, life: number): void {
    this.host.board.showLifeNow(uid, life >= MAX_LIFE ? null : life, 1);
  }

  async drainLife(uid: number, from: number, to: number): Promise<void> {
    await this.host.animate(LIFE_DRAIN_SECONDS, (progress) => {
      const eased = 1 - (1 - progress) ** 3;
      this.host.board.showLifeNow(uid, from + (to - from) * eased, 1 + LIFE_PULSE * (1 - progress));
    });
    this.host.board.showLifeNow(uid, to, 1);
  }

  async hop(uid: number): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    if (!piece) return;
    const rest = piece.body.position.y;
    await this.host.animate(
      HOP_SECONDS,
      (progress) => (piece.body.position.y = rest + Math.abs(Math.sin(progress * Math.PI * HOPS)) * HOP),
    );
    piece.body.position.y = rest;
  }

  async fall(uid: number, leavesWreck: boolean): Promise<void> {
    const piece = this.host.board.pieceOf(uid);
    if (!piece) return;
    await (leavesWreck ? this.burnDown(piece) : this.vanish(piece));
    piece.object.visible = false;
  }

  /** Vuelca, se encoge y desaparece. */
  private async vanish(piece: UnitPiece): Promise<void> {
    await this.host.animate(FALL_SECONDS, (progress) => {
      piece.body.rotation.z = progress * VANISH_TILT;
      piece.object.scale.setScalar(1 - progress * VANISH_SHRINK);
    });
  }

  /** Se ladea, se quema y cae al suelo (un avion, desde su altura); ahi quedan sus restos. */
  private async burnDown(piece: UnitPiece): Promise<void> {
    const ground = piece.object.position.y;
    const height = new THREE.Box3().setFromObject(piece.object).min.y - ground;
    await this.host.animate(FALL_SECONDS, (progress) => {
      piece.body.rotation.z = progress * WRECK_TILT;
      piece.object.position.y = ground - height * progress * progress;
      tint(piece.object, 1 - progress * (1 - CHARRED));
    });
    this.host.wreck(piece.object);
  }
}
