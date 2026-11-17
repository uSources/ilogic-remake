/**
 * La pieza 3D de una unidad: su modelo GLB (Ashfox) si su tipo lo tiene, si no el de bloques, a su
 * tamaño (units.json, "modelSize": la infanteria, mas pequeña que un tanque), con su barra de vida
 * encima y lo que se anima aparte (torreta, rotor).
 */
import * as THREE from 'three';
import type { MovementMotion } from '../../../core/content';
import { newBadge, newLetterBadge } from './badges';
import { buildModel } from './blocks';
import type { GlbLibrary, GlbUnit } from './glbModels';
import { unitModelOf } from './models';
import type { UnitLook } from '../../systems/board/boardScene';
import { startPopping } from './growIn';
import { backCornerOf, settlingShare } from './sharedTile';
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
  /** La letra de su orden permanente. */
  readonly orderBadge: THREE.Sprite;
  /** El modelo GLB animado (Ashfox), si su tipo lo tiene; si no, es de bloques. */
  readonly glb: GlbUnit | null;
  /** Como se mueve (movements.json, "motion"): que huella deja y si levanta polvo. */
  readonly motion: MovementMotion;
  /** Esta encima de un edificio: se pone en la esquina de delante de la casilla (`sharedTile.ts`). */
  standsOnBuilding: boolean;
  /** Segundos que lleva apareciendo (null: ya esta). */
  popping: number | null;
}

/** Lo que se aparta hacia cada lado de la esquina de delante, encima de un edificio (en casillas). */
const STEP_ASIDE_SHIFT = 0.22;
/** Donde va este fotograma, en el mundo y en la pieza (se reutilizan: nada nuevo en cada fotograma). */
const asideInWorld = new THREE.Vector3();
const asideInPiece = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface UnitModel {
  object: THREE.Group;
  body: THREE.Object3D;
  badgeHeight: number;
  glb: GlbUnit | null;
}

function unitModel(look: UnitLook, glbModels: GlbLibrary): UnitModel {
  const glb = glbModels.unit(look.type, look.side);
  if (glb) {
    const body = glb.object.children[0]!;
    body.scale.setScalar(look.modelSize);
    const top = new THREE.Box3().setFromObject(glb.object).max.y;
    return { object: glb.object, body, badgeHeight: top + BADGE_GAP, glb };
  }
  const model = unitModelOf(look.type);
  const object = buildModel(model, SIDE_PAINT[look.side]);
  const body = object.getObjectByName('body')!;
  body.scale.setScalar(look.modelSize);
  return { object, body, badgeHeight: BADGE_HEIGHT * look.modelSize + (model.hover ?? 0), glb: null };
}

/** Una pieza nueva para esa unidad, empezando a aparecer. */
export function newUnitPiece(look: UnitLook, glbModels: GlbLibrary): UnitPiece {
  const { object, body, badgeHeight, glb } = unitModel(look, glbModels);
  const lifeBar = newBadge(badgeHeight);
  const orderBadge = newLetterBadge(badgeHeight);
  object.add(lifeBar, orderBadge);
  const piece: UnitPiece = {
    uid: look.uid,
    object,
    body,
    turret: object.getObjectByName('turret') ?? null,
    rotor: object.getObjectByName('rotor') ?? null,
    lifeBar,
    orderBadge,
    glb,
    motion: look.motion,
    standsOnBuilding: look.standsOnBuilding,
    popping: null,
  };
  startPopping(piece);
  return piece;
}

/**
 * Un fotograma mas apartandose (o volviendo al centro): encima de un edificio, hacia la esquina de
 * delante de la casilla segun `cameraForward`. Se mueven el cuerpo y sus marcas, no la pieza, que es la
 * que llevan las animaciones; y en la pieza, que puede estar girada, la esquina se pasa a su giro.
 */
export function stepAside(piece: UnitPiece, cameraForward: THREE.Vector3, seconds: number): void {
  if (piece.standsOnBuilding) backCornerOf(cameraForward, asideInWorld).multiplyScalar(-STEP_ASIDE_SHIFT);
  else asideInWorld.set(0, 0, 0);
  asideInPiece.copy(asideInWorld).applyAxisAngle(UP, -piece.object.rotation.y);
  const share = settlingShare(seconds);
  settleToward(piece.body, share);
  settleToward(piece.lifeBar, share);
  settleToward(piece.orderBadge, share);
}

/** Acerca `part` a `asideInPiece` por el suelo (su altura, la de vuelo o la del salto, no se toca). */
function settleToward(part: THREE.Object3D, share: number): void {
  part.position.x = THREE.MathUtils.lerp(part.position.x, asideInPiece.x, share);
  part.position.z = THREE.MathUtils.lerp(part.position.z, asideInPiece.z, share);
}
