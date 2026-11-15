/**
 * De casillas al mundo 3D: la casilla (x, y) del mapa es el cuadrado de lado 1 centrado en
 * (x, ?, y) del mundo; la altura (eje y del mundo) la pone quien pregunta. Todo lo 3D pasa por aqui.
 */
import * as THREE from 'three';
import type { Pos } from '../core/model';

export const tileToWorld = (pos: Pos, height: number): THREE.Vector3 => new THREE.Vector3(pos.x, height, pos.y);

/** El giro (alrededor del eje vertical) para mirar de una casilla a la de al lado: los modelos miran hacia +z. */
export const facingAngle = (from: Pos, to: Pos): number => Math.atan2(to.x - from.x, to.y - from.y);
