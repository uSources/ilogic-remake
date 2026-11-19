/**
 * Los restos de los vehiculos y aviones destruidos: una copia quemada de su modelo, tal como quedo al
 * caer, que echa humo (negro al principio, luego gris) y al cabo de un rato se hunde en el suelo y
 * desaparece. No son de la partida: no ocupan la casilla ni se pueden tocar (van aparte del tablero).
 */
import * as THREE from 'three';
import type { PuffSource } from '../fx/particles';
import { hideThroughWalls } from '../core/silhouettes';

/** Lo que duran los restos (segundos), los ultimos hundiendose. */
const WRECK_SECONDS = 16;
const SINK_SECONDS = 3;
const SINK_DEPTH = 0.5;
/** Hasta cuando echa humo negro (despues, gris). */
const DARK_SMOKE_SECONDS = 7;
/** Por debajo de lo mas alto de los restos sale el humo (que no nazca tapado por ellos). */
const SMOKE_BELOW_TOP = 0.1;

interface Wreck {
  key: string;
  object: THREE.Object3D;
  /** Su altura al dejarlo (de ahi se hunde). */
  rest: number;
  /** De donde sale su humo (baja con ellos al hundirse). */
  smokeAt: THREE.Vector3;
  smokeHeight: number;
  age: number;
}

export class Wrecks {
  readonly object = new THREE.Group();
  private wrecks: Wreck[] = [];
  private made = 0;

  /** Deja los restos de ese modelo (el de la pieza que acaba de caer, ya quemado) donde esta. */
  leave(model: THREE.Object3D): void {
    const object = model.clone();
    for (const sprite of spritesIn(object)) sprite.removeFromParent();
    hideThroughWalls(object);
    ownMaterials(object);
    this.object.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const smokeHeight = box.max.y - SMOKE_BELOW_TOP;
    const smokeAt = box.getCenter(new THREE.Vector3()).setY(smokeHeight);
    this.wrecks.push({ key: `wreck${this.made++}`, object, rest: object.position.y, smokeAt, smokeHeight, age: 0 });
  }

  /** El humo de cada uno mientras dura (para ParticleSystem.keepEmitting). */
  smokeSources(): PuffSource[] {
    return this.wrecks.map((wreck) => ({
      key: wreck.key,
      at: wreck.smokeAt,
      kind: wreck.age < DARK_SMOKE_SECONDS ? 'darkSmoke' : 'smoke',
    }));
  }

  update(seconds: number): void {
    for (const wreck of this.wrecks) {
      wreck.age += seconds;
      const sinking = Math.max(0, wreck.age - (WRECK_SECONDS - SINK_SECONDS)) / SINK_SECONDS;
      wreck.object.position.y = wreck.rest - sinking * SINK_DEPTH;
      wreck.smokeAt.y = wreck.smokeHeight - sinking * SINK_DEPTH;
    }
    for (const wreck of this.wrecks) if (wreck.age >= WRECK_SECONDS) wreck.object.removeFromParent();
    this.wrecks = this.wrecks.filter((wreck) => wreck.age < WRECK_SECONDS);
  }
}

/** Cada malla con su copia del material: lo que le pase despues a la pieza de la unidad no le llega a los restos. */
function ownMaterials(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const mesh = node as THREE.Mesh;
      mesh.material = (mesh.material as THREE.Material).clone();
    }
  });
}

/** Los carteles (la barra de vida) que lleva un modelo: los restos no los llevan. */
function spritesIn(object: THREE.Object3D): THREE.Sprite[] {
  const sprites: THREE.Sprite[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.Sprite) sprites.push(node as THREE.Sprite);
  });
  return sprites;
}
