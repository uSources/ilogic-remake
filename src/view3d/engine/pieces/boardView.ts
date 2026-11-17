/**
 * Las piezas 3D del tablero (unidades y edificios), tal como dice systems/board/boardScene.ts que se
 * ven: `sync` pone las que faltan, quita las que ya no estan, deja cada una en su casilla y pone sus
 * marcas (vida, captura; y lo que perderia el enemigo al que se apunta, `previewHit`). Aqui no se decide nada de la partida: solo se crean y se mueven objetos (las
 * animaciones mueven las piezas y despues `sync` las deja donde dice la partida).
 */
import * as THREE from 'three';
import type { GameState, Pos, TeamId } from '../../../core/model';
import { showBar, showLetter, showLoss } from './badges';
import type { GlbLibrary } from './glbModels';
import type { PuffSource } from '../fx/particles';
import { tileToWorld } from '../core/space';
import type { TerrainView } from '../terrain/terrain';
import { boardScene, woundedUnits, type BuildingLook, type HitLook, type UnitLook } from '../../systems/board/boardScene';
import { chimneyOf, newBuildingPiece, type BuildingPiece } from './buildingPiece';
import { growIn, startPopping } from './growIn';
import { CAPTURE_COLOR } from './sidePaint';
import { tint } from './tint';
import { newUnitPiece, ROTOR_SPEED, type UnitPiece } from './unitPiece';

/** Lo que se oscurece una unidad propia que ya ha hecho todo (tanto por uno de su color). */
const SPENT_TINT = 0.5;
/** Por encima de la unidad sale el humo de sus heridas. */
const WOUND_SMOKE_LIFT = new THREE.Vector3(0, 0.45, 0);

/** Lo que sobra por encima de la barra de vida para las chapas (que no la tapen). */
const OVERHEAD_GAP = new THREE.Vector3(0, 0.08, 0);
/** Sin unidad en la casilla (a donde se movera la tuya para disparar), las chapas, a esta altura. */
const EMPTY_OVERHEAD = new THREE.Vector3(0, 0.95, 0);
/** Una pieza esta en la casilla si su punto de apoyo esta tan cerca de su suelo. */
const SAME_SPOT = 0.05;

export class BoardView {
  readonly object = new THREE.Group();
  private readonly units = new Map<number, UnitPiece>();
  private readonly buildings = new Map<string, BuildingPiece>();
  /** El enemigo al que se apunta ahora: su barra enseña lo que perderia (hasta que se deja de apuntar). */
  private hit: HitLook | null = null;
  /** La barra normal de cada unidad (la del ultimo `sync`), para volver a ella al dejar de apuntar. */
  private readonly lifeOf = new Map<number, number | null>();

  constructor(
    private readonly s: GameState,
    private readonly viewer: TeamId,
    private readonly terrain: TerrainView,
    private readonly glbModels: GlbLibrary,
  ) {}

  /** El punto del suelo de esa casilla (encima de su terreno). */
  groundOf(pos: Pos): THREE.Vector3 {
    return tileToWorld(pos, this.terrain.heightAt(pos));
  }

  pieceOf(uid: number): UnitPiece | undefined {
    return this.units.get(uid);
  }

  /** Encima de la barra de vida de la unidad que se ve en esa casilla (o a esa altura si no hay ninguna). */
  overheadOf(pos: Pos): THREE.Vector3 {
    const ground = this.groundOf(pos);
    for (const piece of this.units.values()) {
      if (piece.object.visible && piece.object.position.distanceTo(ground) < SAME_SPOT)
        return piece.lifeBar.getWorldPosition(new THREE.Vector3()).add(OVERHEAD_GAP);
    }
    return ground.add(EMPTY_OVERHEAD);
  }

  /** La unidad se ve ahora (la niebla no la tapa). */
  isVisible(uid: number): boolean {
    return this.units.get(uid)?.object.visible ?? false;
  }

  /** La pieza de esa unidad si es la que se ha tocado (o algo dentro de ella), si se ve. */
  unitHit(object: THREE.Object3D): number | null {
    for (const piece of this.units.values()) if (piece.object.visible && isInside(object, piece.object)) return piece.uid;
    return null;
  }

  /**
   * De donde sale humo ahora: las chimeneas y las unidades muy dañadas que se ven. Cada fuente con su
   * nombre (para su ritmo) y el sitio del mundo de donde sale.
   */
  smokeSources(): PuffSource[] {
    const chimneys = [...this.buildings].flatMap(([key, piece]) => {
      const at = chimneyOf(piece);
      return at ? [{ key: `b${key}`, at, kind: 'smoke' as const }] : [];
    });
    const wounded = woundedUnits(this.s).flatMap(({ uid, smoke }) => {
      const piece = this.units.get(uid);
      if (!piece?.object.visible) return [];
      return [{ key: `u${uid}`, at: piece.body.getWorldPosition(new THREE.Vector3()).add(WOUND_SMOKE_LIFT), kind: smoke }];
    });
    return [...chimneys, ...wounded];
  }

  sync(): void {
    const scene = boardScene(this.s, this.viewer);
    this.terrain.showSeen(scene.seen);
    this.syncBuildings(scene.buildings);
    this.syncUnits(scene.units);
  }

  /** La barra del enemigo al que se apunta enseña lo que perderia; con null, todas vuelven a la suya. */
  previewHit(look: HitLook | null): void {
    const before = this.hit;
    if (before?.uid === look?.uid && before?.lifeAfter === look?.lifeAfter && before?.lifeLeft === look?.lifeLeft) return;
    this.hit = look;
    if (before) this.showLife(before.uid);
    if (look) this.showLife(look.uid);
  }

  private showLife(uid: number): void {
    const piece = this.units.get(uid);
    if (!piece) return;
    if (this.hit?.uid === uid) showLoss(piece.lifeBar, this.hit.lifeLeft, this.hit.lifeAfter);
    else showBar(piece.lifeBar, this.lifeOf.get(uid) ?? null);
  }

  /** Lo que se anima solo, sin sucesos: los rotores y las piezas que aparecen. */
  update(seconds: number): void {
    for (const piece of this.units.values()) {
      if (piece.rotor) piece.rotor.rotation.y += ROTOR_SPEED * seconds;
      piece.glb?.update(seconds);
      if (piece.popping !== null) growIn(piece, seconds);
    }
    for (const piece of this.buildings.values()) {
      piece.glb?.update(seconds);
      if (piece.popping !== null) growIn(piece, seconds);
    }
  }

  private syncBuildings(looks: readonly BuildingLook[]): void {
    const present = new Set(looks.map((look) => look.key));
    for (const [key, piece] of this.buildings) if (!present.has(key)) this.removeBuilding(key, piece);
    for (const look of looks) this.placeBuilding(look);
  }

  private placeBuilding(look: BuildingLook): void {
    let piece = this.buildings.get(look.key);
    if (piece?.side !== look.side) {
      const wasThere = !!piece;
      if (piece) this.removeBuilding(look.key, piece);
      piece = this.addBuilding(look);
      // Al cambiar de dueño (una captura) el edificio vuelve a crecer con sus colores nuevos.
      if (wasThere) startPopping(piece);
    }
    showBar(piece.captureBar, look.capture?.left ?? null, look.capture ? CAPTURE_COLOR[look.capture.side] : undefined);
  }

  private addBuilding(look: BuildingLook): BuildingPiece {
    const piece = newBuildingPiece(look, this.groundOf(look.pos), this.glbModels);
    this.buildings.set(look.key, piece);
    this.object.add(piece.object);
    return piece;
  }

  private removeBuilding(key: string, piece: BuildingPiece): void {
    this.object.remove(piece.object);
    this.buildings.delete(key);
  }

  private syncUnits(looks: readonly UnitLook[]): void {
    const present = new Set(looks.map((look) => look.uid));
    for (const [uid, piece] of this.units) if (!present.has(uid)) this.removeUnit(uid, piece);
    for (const look of looks) this.placeUnit(look);
  }

  private placeUnit(look: UnitLook): void {
    const piece = this.units.get(look.uid) ?? this.addUnit(look);
    piece.object.position.copy(this.groundOf(look.pos));
    piece.object.visible = look.isVisible;
    tint(piece.object, look.isSpent ? SPENT_TINT : 1);
    this.lifeOf.set(look.uid, look.lifeLeft);
    this.showLife(look.uid);
    showLetter(piece.orderBadge, look.orderLetter);
  }

  private addUnit(look: UnitLook): UnitPiece {
    const piece = newUnitPiece(look, this.glbModels);
    this.units.set(look.uid, piece);
    this.object.add(piece.object);
    return piece;
  }

  private removeUnit(uid: number, piece: UnitPiece): void {
    this.object.remove(piece.object);
    this.units.delete(uid);
    this.lifeOf.delete(uid);
  }
}

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
