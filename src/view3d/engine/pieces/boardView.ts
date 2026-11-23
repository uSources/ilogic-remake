/**
 * Las piezas 3D del tablero (unidades, edificios y zonas de control), tal como dice systems/board/boardScene.ts que se
 * ven: `sync` pone las que faltan, quita las que ya no estan, deja cada una en su casilla y pone sus
 * marcas (las chapas de vida y de captura; y lo que perderia el enemigo al que se apunta, `previewHit`). Aqui no se decide nada de la partida: solo se crean y se mueven objetos (las
 * animaciones mueven las piezas y despues `sync` las deja donde dice la partida).
 */
import * as THREE from 'three';
import { MAX_LIFE } from '../../../core/data';
import { samePos } from '../../../core/geom';
import type { GameState, Pos, TeamId } from '../../../core/model';
import { showLetter, showLife, showLifeDrop, showLoss, showNumber } from './badges';
import type { GlbLibrary } from './glbModels';
import type { PuffSource } from '../fx/particles';
import { tileToWorld } from '../core/space';
import type { TerrainView } from '../terrain/terrain';
import { boardScene, woundedUnits, type BuildingLook, type HitLook, type UnitLook } from '../../systems/board/boardScene';
import { chimneyOf, makeRoom, newBuildingPiece, type BuildingPiece } from './buildingPiece';
import { ControlZonesView } from './controlZones';
import { growIn, startPopping } from './growIn';
import { CAPTURE_COLOR } from './sidePaint';
import { tint } from './tint';
import { newUnitPiece, ROTOR_SPEED, stepAside, type UnitPiece } from './unitPiece';

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
  /** Las zonas de los puntos de control: van aparte de `object` (lo que se toca) para que el raton las atraviese. */
  readonly controlZones = new ControlZonesView(this);
  private readonly units = new Map<number, UnitPiece>();
  private readonly buildings = new Map<string, BuildingPiece>();
  /** El enemigo al que se apunta ahora: su barra enseña lo que perderia (hasta que se deja de apuntar). */
  private hit: HitLook | null = null;
  /** La chapa de vida de cada unidad (la del ultimo `sync`), para volver a ella al dejar de apuntar. */
  private readonly unitLooks = new Map<number, UnitLook>();

  constructor(
    private readonly s: GameState,
    private readonly viewer: TeamId,
    private readonly terrain: TerrainView,
    private readonly glbModels: GlbLibrary,
  ) {}

  /** La unidad que se ve en esa casilla (su pieza entera), o null. */
  unitObjectAt(pos: Pos): THREE.Object3D | null {
    const look = [...this.unitLooks.values()].find((unit) => unit.isVisible && samePos(unit.pos, pos));
    return look ? (this.units.get(look.uid)?.object ?? null) : null;
  }

  /** El punto del suelo de esa casilla (encima de su terreno). */
  groundOf(pos: Pos): THREE.Vector3 {
    return tileToWorld(pos, this.terrain.heightAt(pos));
  }

  /** Lo alto del suelo en un punto del mundo, con el relieve (donde se apoyan las marcas planas). */
  surfaceAt(x: number, z: number): number {
    return this.terrain.surfaceAt(x, z);
  }

  pieceOf(uid: number): UnitPiece | undefined {
    return this.units.get(uid);
  }

  /** Encima de la barra de vida de la unidad que se ve en esa casilla (o a esa altura si no hay ninguna). */
  overheadOf(pos: Pos): THREE.Vector3 {
    const ground = this.groundOf(pos);
    for (const piece of this.units.values()) {
      if (piece.object.visible && piece.object.position.distanceTo(ground) < SAME_SPOT)
        return piece.lifeBadge.getWorldPosition(new THREE.Vector3()).add(OVERHEAD_GAP);
    }
    return ground.add(EMPTY_OVERHEAD);
  }

  /** Enseña la vida `life` en la chapa de la unidad (null: entera, sin chapa), a `pulse` de su tamaño. */
  showLifeNow(uid: number, life: number | null, pulse: number): void {
    const piece = this.units.get(uid);
    if (!piece) return;
    showLife(piece.lifeBadge, life === null ? null : Math.ceil(life), (life ?? MAX_LIFE) / MAX_LIFE);
    piece.lifeBadge.scale.multiplyScalar(pulse);
  }

  /** La vida que acaba de perder: le queda `left` y lo perdido hasta `shown` brilla en blanco; la chapa a `pulse` de su tamaño. */
  showLifeDrop(uid: number, shown: number, left: number, pulse: number): void {
    const piece = this.units.get(uid);
    if (!piece) return;
    showLifeDrop(piece.lifeBadge, shown / MAX_LIFE, left / MAX_LIFE);
    piece.lifeBadge.scale.multiplyScalar(pulse);
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
    this.controlZones.sync(scene.controlZones);
  }

  /** La barra del enemigo al que se apunta enseña lo que perderia; con null, todas vuelven a la suya. */
  previewHit(look: HitLook | null): void {
    const before = this.hit;
    if (before?.uid === look?.uid && before?.lifeAfter === look?.lifeAfter && before?.lifeLeft === look?.lifeLeft) return;
    this.hit = look;
    if (before) this.showLife(before.uid);
    if (look) this.showLife(look.uid);
  }

  /** Su chapa de vida o, si es a quien se apunta, la barra a rayas de lo que perderia. */
  private showLife(uid: number): void {
    const piece = this.units.get(uid);
    const look = this.unitLooks.get(uid);
    if (!piece || !look) return;
    if (this.hit?.uid === uid) return showLoss(piece.lifeBadge, this.hit.lifeLeft, this.hit.lifeAfter);
    showLife(piece.lifeBadge, look.lifeShown, look.lifeLeft ?? 1);
  }

  /**
   * Lo que se anima solo, sin sucesos: los rotores, las piezas que aparecen y las unidades y edificios
   * que comparten casilla, cada uno a su esquina segun hacia donde mira la camara (`cameraForward`).
   */
  update(seconds: number, cameraForward: THREE.Vector3): void {
    for (const piece of this.units.values()) {
      if (piece.rotor) piece.rotor.rotation.y += ROTOR_SPEED * seconds;
      piece.glb?.update(seconds);
      stepAside(piece, cameraForward, seconds);
      if (piece.popping !== null) growIn(piece, seconds);
    }
    for (const piece of this.buildings.values()) {
      piece.glb?.update(seconds);
      makeRoom(piece, cameraForward, seconds);
      if (piece.popping !== null) growIn(piece, seconds);
    }
    this.controlZones.update(seconds);
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
    piece.isOccupied = look.isOccupied;
    showNumber(piece.captureBadge, look.capture?.points ?? null, look.capture ? CAPTURE_COLOR[look.capture.side] : '');
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
    piece.standsOnBuilding = look.standsOnBuilding;
    tint(piece.object, look.isSpent ? SPENT_TINT : 1);
    this.unitLooks.set(look.uid, look);
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
    this.unitLooks.delete(uid);
  }
}

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
