/**
 * Como se anima en 3D cada suceso de la partida (los `events` que devuelve una accion). Uno nuevo es
 * una entrada mas en EVENT_ANIMATIONS; los sucesos sin entrada no se animan (la pieza salta a donde
 * diga la partida con el siguiente `sync`).
 */
import type * as THREE from 'three';
import type { GameEvent, Pos } from '../core/model';
import type { BoardView } from './board';
import { facingAngle } from './space';

/** Segundos por casilla al moverse. */
const STEP_SECONDS = 0.2;
/** Lo que se levanta la pieza a mitad de cada paso (un saltito de juguete). */
const STEP_HOP = 0.08;

/** Lo que necesita una animacion: las piezas y el reloj del mundo. */
export interface AnimationHost {
  board: BoardView;
  animate(seconds: number, step: (progress: number) => void): Promise<void>;
}

type EventOf<K extends GameEvent['kind']> = Extract<GameEvent, { kind: K }>;
type EventAnimations = { readonly [K in GameEvent['kind']]?: (event: EventOf<K>, host: AnimationHost) => Promise<void> };

/** Gira la pieza hacia el paso con el camino mas corto (sin dar la vuelta entera). */
function turnToward(object: THREE.Object3D, angle: number, progress: number, from: number): void {
  const delta = Math.atan2(Math.sin(angle - from), Math.cos(angle - from));
  object.rotation.y = from + delta * Math.min(progress * 3, 1);
}

async function stepTo(object: THREE.Object3D, from: Pos, to: Pos, host: AnimationHost): Promise<void> {
  const start = host.board.groundOf(from);
  const end = host.board.groundOf(to);
  const startAngle = object.rotation.y;
  const angle = facingAngle(from, to);
  await host.animate(STEP_SECONDS, (progress) => {
    object.position.lerpVectors(start, end, progress);
    object.position.y += Math.sin(progress * Math.PI) * STEP_HOP;
    turnToward(object, angle, progress, startAngle);
  });
}

async function animateMove(event: EventOf<'move'>, host: AnimationHost): Promise<void> {
  const piece = host.board.pieceOf(event.uid);
  if (!piece) return;
  for (let index = 1; index < event.path.length; index++) await stepTo(piece.object, event.path[index - 1]!, event.path[index]!, host);
}

const EVENT_ANIMATIONS: EventAnimations = { move: animateMove };

type AnyEventAnimation = (event: GameEvent, host: AnimationHost) => Promise<void>;

/** La animacion de ese suceso. TypeScript no sabe que la entrada de cada clase recibe un suceso de esa misma clase. */
const animationOf = (event: GameEvent): AnyEventAnimation | undefined => EVENT_ANIMATIONS[event.kind] as AnyEventAnimation | undefined;

/** Anima los sucesos uno tras otro. */
export async function playEvents(events: readonly GameEvent[], host: AnimationHost): Promise<void> {
  for (const event of events) await animationOf(event)?.(event, host);
}
