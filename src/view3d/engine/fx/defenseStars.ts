/**
 * Las estrellas de defensa de la casilla señalada: bloquecitos amarillos con su borde de tinta que
 * flotan en fila sobre ella (como la letra de la orden, se leen sin abrir ninguna ficha). Cuantas, lo
 * dice la partida (core: `defenseStars`); aqui solo se ponen, se ordenan y botan un poco.
 */
import * as THREE from 'three';

/** Nunca hay mas estrellas que esto (core: MAX_DEFENSE_STARS). */
const MAX_STARS = 4;
const STAR_SIZE = 0.13;
/** El borde de tinta: la misma pieza algo mayor, por detras. */
const INK_GROW = 1.35;
const STAR_GAP = 0.06;
/** Por encima del suelo de la casilla, lo justo para no tapar la unidad que hay en ella. */
const STAR_LIFT = 0.16;
/** Y hacia el borde de delante de la casilla (el de la camara al empezar). */
const STAR_FORWARD = 0.36;
/** Las caras del bloque (+x, -x, arriba, abajo, delante, detras): arriba clara, a un lado sombra, como un voxel. */
const STAR_FACES = [0xffd447, 0xd99a1e, 0xfff0a0, 0xd99a1e, 0xf2bb2c, 0xf2bb2c];
const INK_FACES = [0x2b2240];
const BOB_SPEED = 3;
const BOB_HEIGHT = 0.025;
/** Cada estrella bota algo despues que la anterior (una ola). */
const BOB_DELAY = 0.6;

export class DefenseStars {
  readonly object = new THREE.Group();
  private readonly stars: THREE.InstancedMesh;
  private readonly ink: THREE.InstancedMesh;
  private count = 0;
  private time = 0;

  constructor() {
    this.stars = starBlocks(STAR_FACES, 1);
    this.ink = starBlocks(INK_FACES, INK_GROW);
    this.object.add(this.ink, this.stars);
    this.object.visible = false;
  }

  /** Esas estrellas sobre ese punto del suelo (sin punto, o con 0, ninguna). */
  show(ground: THREE.Vector3 | null, count: number): void {
    this.count = Math.min(MAX_STARS, count);
    this.object.visible = ground !== null && this.count > 0;
    if (!this.object.visible || !ground) return;
    this.object.position.copy(ground).add(new THREE.Vector3(0, STAR_LIFT, STAR_FORWARD));
    this.place();
  }

  update(seconds: number): void {
    this.time += seconds;
    if (this.object.visible) this.place();
  }

  private place(): void {
    const width = this.count * STAR_SIZE + (this.count - 1) * STAR_GAP;
    for (let index = 0; index < this.count; index++) {
      const x = -width / 2 + STAR_SIZE / 2 + index * (STAR_SIZE + STAR_GAP);
      const y = Math.max(0, Math.sin(this.time * BOB_SPEED - index * BOB_DELAY)) * BOB_HEIGHT;
      const at = new THREE.Matrix4().makeTranslation(x, y, 0);
      this.stars.setMatrixAt(index, at);
      this.ink.setMatrixAt(index, at);
    }
    for (const blocks of [this.stars, this.ink]) {
      blocks.count = this.count;
      blocks.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Los bloques con esos colores de cara (sin luz: se leen igual de dia, de noche y con nieve), siempre por delante. */
function starBlocks(faces: readonly number[], grow: number): THREE.InstancedMesh {
  const size = STAR_SIZE * grow;
  const materials = faces.map((color) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(size, size, size),
    materials.length > 1 ? materials : materials[0],
    MAX_STARS,
  );
  blocks.count = 0;
  blocks.frustumCulled = false;
  // El borde de tinta va antes; los bloques amarillos, encima.
  blocks.renderOrder = grow > 1 ? 11 : 12;
  return blocks;
}
