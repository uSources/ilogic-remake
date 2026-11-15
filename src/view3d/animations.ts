/**
 * Como se anima en 3D cada suceso de la partida (los `events` que devuelve una accion). Uno nuevo es
 * una entrada mas en EVENT_ANIMATIONS; los sucesos sin entrada no se animan (la pieza salta a donde
 * diga la partida con el siguiente `sync`). Lo que la niebla tapa no se anima: no se delata.
 */
import * as THREE from 'three';
import type { MovementMotion } from '../core/content';
import type { GameEvent, Pos } from '../core/model';
import type { BoardView, UnitPiece } from './board';
import { floatingText, projectile, sparks, type FxHost } from './fx';
import type { PuffKind } from './particles';
import { facingAngle } from './space';

/** Segundos por casilla al moverse. */
const STEP_SECONDS = 0.18;
/** Lo que se levanta la pieza a mitad de cada paso (un saltito de juguete). */
const STEP_HOP = 0.08;
const AIM_SECONDS = 0.18;
const RECOIL_SECONDS = 0.12;
const RECOIL = 0.12;
const SHAKE_SECONDS = 0.25;
const FALL_SECONDS = 0.5;
/** De lejos (mas de una casilla) el disparo va en arco. */
const ARC_FROM = 1.5;
/** Altura (sobre la pieza) de donde sale y a donde llega un disparo. */
const MUZZLE_HEIGHT = 0.3;
const DAMAGE_COLOR = '#ff7a73';

/** Lo que necesita una animacion: las piezas, la capa de efectos y el reloj del mundo. */
export interface AnimationHost extends FxHost {
  board: BoardView;
  /** Humo, polvo y fuego (particles.ts) y las huellas en el suelo (groundMarks.ts). */
  puff(kind: PuffKind, at: THREE.Vector3, count?: number): void;
  mark(at: THREE.Vector3, heading: number, motion: MovementMotion): void;
}

type EventOf<K extends GameEvent['kind']> = Extract<GameEvent, { kind: K }>;
type EventAnimations = { readonly [K in GameEvent['kind']]?: (event: EventOf<K>, host: AnimationHost) => Promise<void> };

/** El giro mas corto de `from` a `to` (sin dar la vuelta entera). */
const shortestTurn = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** En que momentos de cada paso se deja huella (y polvo, si es un vehiculo): a mitad y al llegar. */
const MARK_MOMENTS = [0.5, 1] as const;

async function stepTo(piece: UnitPiece, from: Pos, to: Pos, host: AnimationHost): Promise<void> {
  const { object } = piece;
  const start = host.board.groundOf(from);
  const end = host.board.groundOf(to);
  const startAngle = object.rotation.y;
  const turn = shortestTurn(startAngle, facingAngle(from, to));
  let marked = 0;
  await host.animate(STEP_SECONDS, (progress) => {
    object.position.lerpVectors(start, end, progress);
    object.position.y += Math.sin(progress * Math.PI) * STEP_HOP;
    object.rotation.y = startAngle + turn * Math.min(progress * 3, 1);
    for (; marked < MARK_MOMENTS.length && progress >= MARK_MOMENTS[marked]!; marked++)
      leaveTrace(piece, new THREE.Vector3().lerpVectors(start, end, progress), host);
  });
}

/** La huella en el suelo y, si es un vehiculo, una nube de polvo detras. */
function leaveTrace(piece: UnitPiece, ground: THREE.Vector3, host: AnimationHost): void {
  host.mark(ground, piece.object.rotation.y, piece.motion);
  if (piece.motion !== 'drive') return;
  const behind = new THREE.Vector3(Math.sin(piece.object.rotation.y), 0, Math.cos(piece.object.rotation.y)).multiplyScalar(-0.35);
  host.puff(
    'dust',
    ground
      .clone()
      .add(behind)
      .add(new THREE.Vector3(0, 0.05, 0)),
    3,
  );
}

async function animateMove(event: EventOf<'move'>, host: AnimationHost): Promise<void> {
  const piece = host.board.pieceOf(event.uid);
  if (!piece?.object.visible) return;
  piece.glb?.play('drive');
  for (let index = 1; index < event.path.length; index++) await stepTo(piece, event.path[index - 1]!, event.path[index]!, host);
  piece.glb?.play('idle');
}

/** Gira la torreta (o la pieza entera si no tiene) hacia un punto del mundo. */
async function aimAt(piece: UnitPiece, target: THREE.Vector3, host: AnimationHost): Promise<void> {
  const turning = piece.turret ?? piece.object;
  const delta = target.clone().sub(piece.object.position);
  const worldAngle = Math.atan2(delta.x, delta.z);
  const goal = piece.turret ? worldAngle - piece.object.rotation.y : worldAngle;
  const start = turning.rotation.y;
  const turn = shortestTurn(start, goal);
  await host.animate(AIM_SECONDS, (progress) => (turning.rotation.y = start + turn * progress));
}

/** El golpe de vuelta al disparar: la animacion 'fire' del modelo si la tiene; si no, el cuerpo se echa atras y vuelve. */
async function recoil(piece: UnitPiece, host: AnimationHost): Promise<void> {
  if (piece.glb) {
    piece.glb.play('fire');
    return host.animate(RECOIL_SECONDS, () => undefined);
  }
  const back = new THREE.Vector3(0, 0, -RECOIL).applyAxisAngle(new THREE.Vector3(0, 1, 0), piece.turret?.rotation.y ?? 0);
  const rest = piece.body.position.clone();
  await host.animate(RECOIL_SECONDS, (progress) => piece.body.position.copy(rest).addScaledVector(back, Math.sin(progress * Math.PI)));
}

const muzzleOf = (piece: UnitPiece): THREE.Vector3 =>
  piece.body.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, MUZZLE_HEIGHT, 0));

/** Un disparo de `shooter` a `target`: apunta, dispara y el proyectil vuela. */
async function shoot(shooter: UnitPiece, target: UnitPiece, host: AnimationHost): Promise<void> {
  await aimAt(shooter, target.object.position, host);
  const from = muzzleOf(shooter);
  const to = muzzleOf(target);
  host.puff('gunSmoke', from, 4);
  await Promise.all([recoil(shooter, host), projectile(host, from, to, from.distanceTo(to) > ARC_FROM)]);
}

/** Lo que pasa al que recibe: chispas, una sacudida y el daño que sube. */
async function takeHit(piece: UnitPiece, damage: number, host: AnimationHost): Promise<void> {
  const at = muzzleOf(piece);
  const rest = piece.body.position.clone();
  const shake = host.animate(SHAKE_SECONDS, (progress) => {
    piece.body.position.copy(rest);
    piece.body.position.x += Math.sin(progress * Math.PI * 6) * 0.05 * (1 - progress);
  });
  await Promise.all([sparks(host, at), shake, floatingText(host, at, `-${damage}`, DAMAGE_COLOR)]);
}

/** Una unidad destruida vuelca, se encoge y desaparece (despues `sync` quita su pieza). */
async function fall(piece: UnitPiece, host: AnimationHost): Promise<void> {
  void sparks(host, muzzleOf(piece), 1.6);
  host.puff('blast', muzzleOf(piece), 14);
  host.puff('darkSmoke', muzzleOf(piece), 8);
  await host.animate(FALL_SECONDS, (progress) => {
    piece.body.rotation.z = progress * 1.4;
    piece.object.scale.setScalar(1 - progress * 0.9);
  });
  piece.object.visible = false;
}

/** Un golpe de un lado al otro (si se ve alguno de los dos) y, si cae el que lo recibe, su caida. */
async function exchange(
  shooter: UnitPiece | undefined,
  target: UnitPiece | undefined,
  hit: { damage: number; killed: boolean },
  host: AnimationHost,
): Promise<void> {
  if (!target) return;
  if (shooter?.object.visible) await shoot(shooter, target, host);
  if (!target.object.visible) return;
  await takeHit(target, hit.damage, host);
  if (hit.killed) await fall(target, host);
}

async function animateAttack(event: EventOf<'attack'>, host: AnimationHost): Promise<void> {
  const attacker = event.attacker === null ? undefined : host.board.pieceOf(event.attacker);
  const target = host.board.pieceOf(event.target);
  await exchange(attacker, target, { damage: event.damage, killed: event.killed }, host);
  if (event.counter <= 0 || event.killed) return;
  await exchange(target, attacker, { damage: event.counter, killed: event.attackerKilled }, host);
}

/** Capturar: la unidad da dos saltitos en el edificio (la barra la pone `sync`). */
async function animateCapture(event: EventOf<'capture'>, host: AnimationHost): Promise<void> {
  const piece = host.board.pieceOf(event.uid);
  if (!piece?.object.visible) return;
  const rest = piece.body.position.y;
  await host.animate(0.4, (progress) => (piece.body.position.y = rest + Math.abs(Math.sin(progress * Math.PI * 2)) * 0.12));
}

const EVENT_ANIMATIONS: EventAnimations = { move: animateMove, attack: animateAttack, capture: animateCapture };

type AnyEventAnimation = (event: GameEvent, host: AnimationHost) => Promise<void>;

/** La animacion de ese suceso. TypeScript no sabe que la entrada de cada clase recibe un suceso de esa misma clase. */
const animationOf = (event: GameEvent): AnyEventAnimation | undefined => EVENT_ANIMATIONS[event.kind] as AnyEventAnimation | undefined;

/** Anima los sucesos uno tras otro. */
export async function playEvents(events: readonly GameEvent[], host: AnimationHost): Promise<void> {
  for (const event of events) await animationOf(event)?.(event, host);
}
