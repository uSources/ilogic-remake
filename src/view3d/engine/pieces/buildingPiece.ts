/**
 * La pieza 3D de un edificio: su modelo GLB (Ashfox) si lo tiene, si no el de bloques, pintado del lado
 * del que se ve, con la barra de captura encima.
 */
import * as THREE from 'three';
import type { OwnerSide } from '../../../ui/sides';
import { newBadge } from './badges';
import { buildModel } from './blocks';
import type { GlbLibrary, GlbUnit } from './glbModels';
import { buildingModelOf } from './models';
import type { BuildingLook } from '../../systems/board/boardScene';
import { SIDE_PAINT } from './sidePaint';

const BADGE_HEIGHT = 1.0;
/** Donde sale el humo de la chimenea de cada edificio que la tiene (id de buildings.json), en el modelo de Ashfox (1/16 de casilla). */
const CHIMNEYS: Readonly<Record<string, THREE.Vector3>> = { Factory: new THREE.Vector3(5, 13, 5).divideScalar(16) };

export interface BuildingPiece {
  readonly object: THREE.Group;
  readonly captureBar: THREE.Sprite;
  /** El lado con el que se pinto: si cambia, se vuelve a construir. */
  readonly side: OwnerSide;
  /** Su modelo de Ashfox (con lo que se mueve: radares, banderas, la bomba del pozo), si lo tiene. */
  readonly glb: GlbUnit | null;
  /** Su tipo (id de buildings.json): de el sale si tiene chimenea. */
  readonly type: string;
  /** Segundos que lleva apareciendo con sus colores nuevos, al cambiar de dueño (null: ya esta). */
  popping: number | null;
}

/** Una pieza nueva para ese edificio, sobre el suelo `ground`. */
export function newBuildingPiece(look: BuildingLook, ground: THREE.Vector3, glbModels: GlbLibrary): BuildingPiece {
  const glb = glbModels.building(look.type, look.side);
  const object = glb?.object ?? buildModel(buildingModelOf(look.type), SIDE_PAINT[look.side]);
  object.position.copy(ground);
  const captureBar = newBadge(BADGE_HEIGHT);
  object.add(captureBar);
  return { object, captureBar, side: look.side, glb, type: look.type, popping: null };
}

/** Donde sale ahora el humo de su chimenea (null si no tiene). */
export function chimneyOf(piece: BuildingPiece): THREE.Vector3 | null {
  const offset = CHIMNEYS[piece.type];
  const model = piece.glb?.object.children[0];
  return offset && model ? model.localToWorld(offset.clone()) : null;
}
