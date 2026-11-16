/**
 * Una pieza que aparece (una unidad nueva, un edificio con dueño nuevo) crece desde casi nada hasta su
 * tamaño, con un pequeño rebote.
 */
import * as THREE from 'three';

/** Lo que tarda en aparecer. */
const POP_SECONDS = 0.35;
const POP_START_SCALE = 0.01;
/** Lo que se pasa de su tamaño a mitad de crecer. */
const POP_BOUNCE = 0.15;

/** Una pieza que aparece: su objeto y los segundos que lleva creciendo (null: ya esta). */
export interface Popping {
  readonly object: THREE.Object3D;
  popping: number | null;
}

/** Empieza a aparecer: desde casi nada. */
export function startPopping(piece: Popping): void {
  piece.object.scale.setScalar(POP_START_SCALE);
  piece.popping = 0;
}

/** Un fotograma mas creciendo. */
export function growIn(piece: Popping, seconds: number): void {
  const elapsed = (piece.popping ?? 0) + seconds;
  const progress = Math.min(elapsed / POP_SECONDS, 1);
  piece.object.scale.setScalar(THREE.MathUtils.lerp(POP_START_SCALE, 1, progress) + Math.sin(progress * Math.PI) * POP_BOUNCE);
  piece.popping = progress < 1 ? elapsed : null;
}
