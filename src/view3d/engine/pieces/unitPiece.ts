/**
 * La pieza 3D de una unidad: su modelo GLB (Ashfox) si su tipo lo tiene, si no el de bloques, con su
 * barra de vida encima y lo que se anima aparte (torreta, rotor).
 */
import * as THREE from 'three';
import type { MovementMotion } from '../../../core/content';
import { newBadge } from '../../badges';
import { buildModel } from '../../blocks';
import type { GlbLibrary, GlbUnit } from '../../glbModels';
import { unitModelOf } from '../../models';
import type { UnitLook } from '../../systems/board/boardScene';
import { startPopping } from './growIn';
import { SIDE_PAINT } from './sidePaint';

/** Altura de la barra de vida sobre el suelo de un modelo de bloques (por encima de el y de su vuelo). */
const BADGE_HEIGHT = 0.7;
/** Lo que queda la barra de vida por encima de lo mas alto de un modelo de Ashfox. */
const BADGE_GAP = 0.12;
/** Vueltas por segundo del rotor de los helicopteros. */
export const ROTOR_SPEED = 14;

export interface UnitPiece {
  readonly uid: number;
  readonly object: THREE.Group;
  /** El cuerpo (a su altura de vuelo): lo que se sacude y se inclina en las animaciones. */
  readonly body: THREE.Object3D;
  /** Lo que gira aparte (la torreta), si el modelo lo tiene. */
  readonly turret: THREE.Object3D | null;
  readonly rotor: THREE.Object3D | null;
  readonly lifeBar: THREE.Sprite;
  /** El modelo GLB animado (Ashfox), si su tipo lo tiene; si no, es de bloques. */
  readonly glb: GlbUnit | null;
  /** Como se mueve (movements.json, "motion"): que huella deja y si levanta polvo. */
  readonly motion: MovementMotion;
  /** Segundos que lleva apareciendo (null: ya esta). */
  popping: number | null;
}

interface UnitModel {
  object: THREE.Group;
  body: THREE.Object3D;
  badgeHeight: number;
  glb: GlbUnit | null;
}

function unitModel(look: UnitLook, glbModels: GlbLibrary): UnitModel {
  const glb = glbModels.unit(look.type, look.side);
  if (glb) {
    const top = new THREE.Box3().setFromObject(glb.object).max.y;
    return { object: glb.object, body: glb.object.children[0]!, badgeHeight: top + BADGE_GAP, glb };
  }
  const model = unitModelOf(look.type);
  const object = buildModel(model, SIDE_PAINT[look.side]);
  return { object, body: object.getObjectByName('body')!, badgeHeight: BADGE_HEIGHT + (model.hover ?? 0), glb: null };
}

/** Una pieza nueva para esa unidad, empezando a aparecer. */
export function newUnitPiece(look: UnitLook, glbModels: GlbLibrary): UnitPiece {
  const { object, body, badgeHeight, glb } = unitModel(look, glbModels);
  const lifeBar = newBadge(badgeHeight);
  object.add(lifeBar);
  const piece: UnitPiece = {
    uid: look.uid,
    object,
    body,
    turret: object.getObjectByName('turret') ?? null,
    rotor: object.getObjectByName('rotor') ?? null,
    lifeBar,
    glb,
    motion: look.motion,
    popping: null,
  };
  startPopping(piece);
  return piece;
}
