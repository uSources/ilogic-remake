/**
 * La pieza 3D de un edificio: su modelo GLB (Ashfox) si lo tiene, si no el de bloques, pintado del lado
 * del que se ve, con la chapa de captura encima. Con una unidad encima deja sitio: encoge y se va a la
 * esquina de atras de su casilla (`sharedTile.ts`), para que la unidad, delante, no lo atraviese.
 */
import * as THREE from 'three';
import type { OwnerSide } from '../../../ui/sides';
import { newCaptureBadge } from './badges';
import { buildModel } from './blocks';
import type { GlbLibrary, GlbUnit } from './glbModels';
import { buildingModelOf } from './models';
import type { BuildingLook } from '../../systems/board/boardScene';
import { backCornerOf, settlingShare } from './sharedTile';
import { SIDE_PAINT } from './sidePaint';

const BADGE_HEIGHT = 1.0;
/** Donde sale el humo de la chimenea de cada edificio que la tiene (id de buildings.json), en el modelo de Ashfox (1/16 de casilla). */
const CHIMNEYS: Readonly<Record<string, THREE.Vector3>> = { Factory: new THREE.Vector3(5, 13, 5).divideScalar(16) };
/** Su tamaño con una unidad encima (por uno). */
const ROOM_MAKING_SIZE = 0.8;
/** Lo que se aparta hacia cada lado de la esquina de atras (en casillas): con su tamaño, sigue dentro de la casilla. */
const ROOM_MAKING_SHIFT = 0.14;
/** Donde va el modelo en este fotograma (se reutiliza: nada nuevo en cada fotograma). */
const roomShift = new THREE.Vector3();

export interface BuildingPiece {
  readonly object: THREE.Group;
  /** El modelo (dentro de `object`): lo que encoge y se aparta cuando hay una unidad encima. */
  readonly model: THREE.Object3D;
  readonly captureBadge: THREE.Sprite;
  /** El lado con el que se pinto: si cambia, se vuelve a construir. */
  readonly side: OwnerSide;
  /** Su modelo de Ashfox (con lo que se mueve: radares, banderas, la bomba del pozo), si lo tiene. */
  readonly glb: GlbUnit | null;
  /** Su tipo (id de buildings.json): de el sale si tiene chimenea. */
  readonly type: string;
  /** Hay una unidad encima que se ve: le deja sitio. */
  isOccupied: boolean;
  /** Segundos que lleva apareciendo con sus colores nuevos, al cambiar de dueño (null: ya esta). */
  popping: number | null;
}

/** Una pieza nueva para ese edificio, sobre el suelo `ground`. */
export function newBuildingPiece(look: BuildingLook, ground: THREE.Vector3, glbModels: GlbLibrary): BuildingPiece {
  const glb = glbModels.building(look.type, look.side);
  const model = glb?.object ?? buildModel(buildingModelOf(look.type), SIDE_PAINT[look.side]);
  const object = new THREE.Group();
  object.position.copy(ground);
  const captureBadge = newCaptureBadge(BADGE_HEIGHT);
  object.add(model, captureBadge);
  return { object, model, captureBadge, side: look.side, glb, type: look.type, isOccupied: look.isOccupied, popping: null };
}

/**
 * Un fotograma mas dejando sitio (o volviendo a su sitio): hacia su tamaño y su esquina segun haya una
 * unidad encima. `cameraForward`: hacia donde mira la camara; la esquina de atras es la de ese lado.
 */
export function makeRoom(piece: BuildingPiece, cameraForward: THREE.Vector3, seconds: number): void {
  const share = settlingShare(seconds);
  const size = piece.isOccupied ? ROOM_MAKING_SIZE : 1;
  if (piece.isOccupied) backCornerOf(cameraForward, roomShift).multiplyScalar(ROOM_MAKING_SHIFT);
  else roomShift.set(0, 0, 0);
  piece.model.scale.setScalar(THREE.MathUtils.lerp(piece.model.scale.x, size, share));
  piece.model.position.lerp(roomShift, share);
}

/** Donde sale ahora el humo de su chimenea (null si no tiene). */
export function chimneyOf(piece: BuildingPiece): THREE.Vector3 | null {
  const offset = CHIMNEYS[piece.type];
  const model = piece.glb?.object.children[0];
  return offset && model ? model.localToWorld(offset.clone()) : null;
}
