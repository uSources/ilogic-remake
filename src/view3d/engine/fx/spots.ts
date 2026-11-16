/**
 * De los sitios que piden los sistemas (`Spot`, ports/stage.ts) a puntos del mundo 3D.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { Spot } from '../../ports/stage';
import type { UnitPiece } from '../pieces/unitPiece';

/** Altura (sobre la pieza) de donde sale y a donde llega un disparo. */
const MUZZLE_HEIGHT = 0.3;

/** Lo que hace falta para situar un sitio: las piezas y el suelo de cada casilla. */
export interface SpotBoard {
  pieceOf(uid: number): UnitPiece | undefined;
  groundOf(pos: Pos): THREE.Vector3;
}

export const muzzleOf = (piece: UnitPiece): THREE.Vector3 =>
  piece.body.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, MUZZLE_HEIGHT, 0));

/** El punto del mundo de ese sitio (null si es de una pieza que no hay). */
export function worldOf(spot: Spot, board: SpotBoard): THREE.Vector3 | null {
  if (spot.kind === 'tile') return board.groundOf(spot.pos).add(new THREE.Vector3(0, spot.lift, 0));
  const piece = board.pieceOf(spot.uid);
  if (!piece) return null;
  return spot.kind === 'muzzle' ? muzzleOf(piece) : piece.object.position.clone();
}
