/**
 * Las marcas sobre el tablero, como piezas de juguete que se apoyan en las casillas: a donde puede ir
 * la unidad elegida (losas azules con un borde claro por fuera), hasta donde ataca (un marco rojo en
 * cada casilla), a quien puede atacar (una diana de pixel bajo el enemigo), a donde llegan los
 * enemigos (con «Ver amenaza»: un velo rojo con un borde rojo por fuera del area), la casilla señalada (cuatro esquinas que no dejan dudas), el
 * anillo de la unidad elegida y los aros de un grupo. Solo dibujan lo que se les dice (no saben de
 * reglas). Las piezas, en markParts.ts; el contorno, en tileOutline.ts; sobre el relieve (dunas,
 * montañas) van en trozos a la altura del suelo de cada uno (groundFit.ts), para no quedar enterradas.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { TileMarks } from '../../ports/turn';
import { PIECES_PER_SIDE, slabsOn, stripsOn, tileTop, type MarkGround } from './groundFit';
import { bullseyeMesh, cornerCursor, flatMaterial, frameSides, instanced, unitBox } from './markParts';
import { outlineSides } from './tileOutline';

/** Lo justo por encima del suelo para no parpadear con el (z-fighting). */
const LIFT = 0.012;
/** Azul de juguete: mas saturado que el agua del tablero, para que se distinga tambien sobre ella. */
const REACH_COLOR = 0x2e7dff;
const REACH_OPACITY = 0.55;
/** El borde de fuera del alcance: casi blanco, se lee sobre la hierba, la arena y el agua. */
const REACH_EDGE_COLOR = 0xeaf6ff;
const ATTACK_COLOR = 0xff4d45;
/** El relleno de las casillas a tiro: un velo, lo que manda es el marco. */
const ATTACK_FILL_OPACITY = 0.16;
/** La amenaza: un rojo mas oscuro que el de atacar; va debajo de las demas y suave (es un fondo, no una eleccion). */
const THREAT_COLOR = 0xd8262a;
const THREAT_OPACITY = 0.22;
const CURSOR_COLOR = 0xffd447;
/** Las losas son algo menores que la casilla: se ve la cuadricula entre ellas. */
const SLAB_INSET = 0.92;
/** El marco rojo, un poco hacia dentro del borde de la casilla. */
const FRAME_INSET = 0.44;
const FRAME_LENGTH = 0.88;
/** Un mapa no tiene mas casillas que esto a la vez en el alcance (40 x 40). */
const MAX_TILES = 1600;
/** Las piezas de una marca: sobre el relieve, cada losa o tira va en trozos (groundFit.ts). */
const MAX_PIECES = MAX_TILES * PIECES_PER_SIDE;
/** Un grupo elegido, o los enemigos a tiro, no son mas que esto. */
const MAX_RINGS = 64;
const RING_PULSE_SPEED = 4;
const CURSOR_PULSE_SPEED = 5;
const CURSOR_PULSE = 0.05;
/** Lo que gira la diana (vueltas por segundo), para que se vea viva. */
const BULLSEYE_TURNS = 0.15;
const BULLSEYE_SIZE = 1.02;

const UP = new THREE.Vector3(0, 1, 0);
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export class Highlights implements TileMarks {
  readonly object = new THREE.Group();
  private readonly reach = instanced(unitBox(), flatMaterial(REACH_COLOR, REACH_OPACITY), MAX_PIECES);
  private readonly reachEdges = instanced(unitBox(), flatMaterial(REACH_EDGE_COLOR, 1), MAX_PIECES);
  private readonly attackFill = instanced(unitBox(), flatMaterial(ATTACK_COLOR, ATTACK_FILL_OPACITY), MAX_PIECES);
  private readonly attackFrames = instanced(unitBox(), flatMaterial(ATTACK_COLOR, 1), MAX_PIECES);
  private readonly threat = instanced(unitBox(), flatMaterial(THREAT_COLOR, THREAT_OPACITY), MAX_PIECES);
  private readonly threatEdges = instanced(unitBox(), flatMaterial(THREAT_COLOR, 1), MAX_PIECES);
  private readonly targets = bullseyeMesh(MAX_RINGS);
  private readonly cursor = cornerCursor(CURSOR_COLOR);
  private readonly ring: THREE.Mesh;
  private readonly groupRings: THREE.InstancedMesh;
  /** Donde va la diana de cada enemigo a tiro (se recalcula al cambiarlos, no en cada fotograma). */
  private targetSpots: readonly THREE.Vector3[] = [];
  private time = 0;

  constructor(private readonly ground: MarkGround) {
    this.ring = ringMesh();
    this.groupRings = instanced(ringGeometry(), ringMaterial(), MAX_RINGS);
    this.object.add(this.threat, this.threatEdges, this.reach, this.reachEdges, this.attackFill, this.attackFrames, this.targets);
    this.object.add(this.cursor, this.ring, this.groupRings);
  }

  /** Lo que cubre la casilla entera (el cursor, el anillo, la diana): sobre lo mas alto de ella, que no se entierre. */
  private lifted(pos: Pos, lift: number): THREE.Vector3 {
    return new THREE.Vector3(pos.x, tileTop(this.ground, pos) + lift, pos.y);
  }

  /** Los lados de fuera de esas casillas, como tiras a `lift` del suelo. */
  private outlineOf(tiles: readonly Pos[], lift: number): THREE.Matrix4[] {
    return outlineSides(tiles).flatMap(({ pos, side }) => stripsOn(this.ground, pos, side, { inset: 0.5, length: 1, lift }));
  }

  /** Losas azules en cada casilla y, solo por fuera del area, un borde claro. */
  showReach(tiles: readonly Pos[]): void {
    const shown = tiles.slice(0, MAX_TILES);
    place(
      this.reach,
      shown.flatMap((pos) => slabsOn(this.ground, pos, SLAB_INSET, LIFT)),
    );
    place(this.reachEdges, this.outlineOf(shown, LIFT * 2));
  }

  /** Un marco rojo (con un velo rojo debajo) en cada casilla a la que podria disparar. */
  showAttackReach(tiles: readonly Pos[]): void {
    const shown = tiles.slice(0, MAX_TILES);
    place(
      this.attackFill,
      shown.flatMap((pos) => slabsOn(this.ground, pos, SLAB_INSET, LIFT, LIFT)),
    );
    const frame = { inset: FRAME_INSET, length: FRAME_LENGTH, lift: LIFT * 2 };
    place(
      this.attackFrames,
      shown.flatMap((pos) => frameSides.flatMap((side) => stripsOn(this.ground, pos, side, frame))),
    );
  }

  /** Una diana bajo cada enemigo al que puede atacar (gira despacio: `update`). */
  showTargets(tiles: readonly Pos[]): void {
    this.targetSpots = tiles.slice(0, MAX_RINGS).map((pos) => this.lifted(pos, LIFT * 4));
    this.placeTargets();
  }

  private placeTargets(): void {
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, this.time * BULLSEYE_TURNS * Math.PI * 2);
    const size = new THREE.Vector3(BULLSEYE_SIZE, 1, BULLSEYE_SIZE);
    place(
      this.targets,
      this.targetSpots.map((spot) => new THREE.Matrix4().compose(spot, turn, size)),
    );
  }

  /** Un velo rojo en cada casilla amenazada (seguido, sin cuadricula) y un borde rojo por fuera del area. */
  showThreat(tiles: readonly Pos[]): void {
    const shown = tiles.slice(0, MAX_TILES);
    place(
      this.threat,
      shown.flatMap((pos) => slabsOn(this.ground, pos, 1, LIFT, LIFT)),
    );
    place(this.threatEdges, this.outlineOf(shown, LIFT * 1.5));
  }

  hover(pos: Pos | null): void {
    this.cursor.visible = pos !== null;
    if (pos) this.cursor.position.copy(this.lifted(pos, LIFT * 3));
  }

  select(pos: Pos | null): void {
    this.ring.visible = pos !== null;
    if (pos) this.ring.position.copy(this.lifted(pos, LIFT * 3));
  }

  /** Un aro a los pies de cada unidad del grupo elegido. */
  showGroup(tiles: readonly Pos[]): void {
    const one = new THREE.Vector3(1, 1, 1);
    place(
      this.groupRings,
      tiles.slice(0, MAX_RINGS).map((pos) => new THREE.Matrix4().compose(this.lifted(pos, LIFT * 3), FLAT, one)),
    );
  }

  /** Lo que late: el anillo de la elegida (para encontrarla al girar la camara), el cursor y las dianas. */
  update(seconds: number): void {
    this.time += seconds;
    const pulse = 1 + Math.sin(this.time * RING_PULSE_SPEED) * 0.06;
    this.ring.scale.set(pulse, pulse, 1);
    this.cursor.scale.setScalar(1 + Math.sin(this.time * CURSOR_PULSE_SPEED) * CURSOR_PULSE);
    if (this.targetSpots.length) this.placeTargets();
  }
}

/** Pone una pieza por matriz y esconde las demas. */
function place(mesh: THREE.InstancedMesh, matrices: readonly THREE.Matrix4[]): void {
  const shown = matrices.slice(0, mesh.instanceMatrix.count);
  shown.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.count = shown.length;
  mesh.instanceMatrix.needsUpdate = true;
}

const ringGeometry = (): THREE.BufferGeometry => new THREE.RingGeometry(0.4, 0.48, 32);
const ringMaterial = (): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color: CURSOR_COLOR, transparent: true, opacity: 0.9, depthWrite: false });

function ringMesh(): THREE.Mesh {
  const ring = new THREE.Mesh(ringGeometry(), ringMaterial());
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
