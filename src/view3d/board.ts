/**
 * Lo que hay sobre el terreno (unidades y edificios), como piezas 3D que siguen a la partida tal como
 * la ve quien mira: `sync` pone las que faltan, quita las que ya no estan, deja cada una en su casilla,
 * esconde lo que la niebla tapa y pone sus marcas (vida, captura). La partida no se toca aqui: solo
 * se lee (las animaciones mueven las piezas y despues `sync` las deja donde dice la partida).
 */
import * as THREE from 'three';
import type { MovementMotion } from '../core/content';
import { unitTypeOf } from '../core/gameContent';
import type { Building, GameState, Pos, TeamId, Unit } from '../core/model';
import { posKey } from '../core/geom';
import { capturePointsOf, captureProgress, isOnMap, isShownTo, visibility } from '../core/rules';
import type { Grid } from '../core/util/grid';
import { isFriendly, ownerSideOf, sideOf, type OwnerSide } from '../ui/sides';
import { newBadge, showBar } from './badges';
import type { PuffKind, PuffSource } from './particles';
import { buildModel, type TeamPaint } from './blocks';
import type { GlbLibrary, GlbUnit } from './glbModels';
import { buildingModelOf, unitModelOf } from './models';
import { tileToWorld } from './space';
import { toonMaterial } from './toon';
import type { TerrainView } from './terrain';

/** Los colores de cada lado (los mismos tonos que el juego en 2D: azul lo propio, rojo lo enemigo). */
const SIDE_PAINT: Readonly<Record<OwnerSide, TeamPaint>> = {
  own: { team: 0x3aa8ff, teamDark: 0x2477c4 },
  ally: { team: 0x3aa8ff, teamDark: 0x2477c4 },
  enemy: { team: 0xff4d45, teamDark: 0xc22f2a },
  neutral: { team: 0xc9d2e3, teamDark: 0x8d97ab },
};
/** El color de la barra de captura de cada lado (los de la interfaz). */
const CAPTURE_COLOR: Readonly<Record<OwnerSide, string>> = { own: '#3aa8ff', ally: '#3aa8ff', enemy: '#ff4d45', neutral: '#c9d2e3' };

/** Donde sale el humo de la chimenea de cada edificio que la tiene (id de buildings.json), en el modelo de Ashfox (1/16 de casilla). */
const CHIMNEYS: Readonly<Record<string, THREE.Vector3>> = { Factory: new THREE.Vector3(5, 13, 5).divideScalar(16) };
/** Por encima de la unidad sale el humo de sus heridas. */
const WOUND_SMOKE_LIFT = new THREE.Vector3(0, 0.45, 0);
/** El humo de las heridas: gris de la mitad para abajo, negro de un cuarto para abajo. */
const woundSmokeOf = (life: number): PuffKind | null => (life <= 25 ? 'darkSmoke' : life <= 50 ? 'smoke' : null);

/** Una unidad propia que ya ha hecho todo en este turno se ve oscurecida: se lee de un vistazo cual queda. */
const SPENT_TINT = 0.5;
/** Altura de la barra de vida sobre el suelo de la unidad (por encima de su modelo y de su vuelo). */
const BADGE_HEIGHT = 0.7;
/** Lo que queda la barra de vida por encima de lo mas alto de un modelo de Ashfox. */
const BADGE_GAP = 0.12;
const BUILDING_BADGE_HEIGHT = 1.0;
/** Vueltas por segundo del rotor de los helicopteros. */
const ROTOR_SPEED = 14;
/** Lo que tarda en aparecer (creciendo) una unidad nueva. */
const POP_SECONDS = 0.35;

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

interface BuildingPiece {
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

export class BoardView {
  readonly object = new THREE.Group();
  private readonly units = new Map<number, UnitPiece>();
  private readonly buildings = new Map<string, BuildingPiece>();
  private seen: Grid<boolean>;

  constructor(
    private readonly s: GameState,
    private readonly viewer: TeamId,
    private readonly terrain: TerrainView,
    private readonly glbModels: GlbLibrary,
  ) {
    this.seen = visibility(s, viewer);
  }

  /** El punto del suelo de esa casilla (encima de su terreno). */
  groundOf(pos: Pos): THREE.Vector3 {
    return tileToWorld(pos, this.terrain.heightAt(pos));
  }

  pieceOf(uid: number): UnitPiece | undefined {
    return this.units.get(uid);
  }

  /**
   * De donde sale humo ahora: las chimeneas (CHIMNEYS) y las unidades muy dañadas que se ven (gris por
   * debajo de la mitad de vida, negro por debajo de un cuarto). Cada fuente con su nombre (para su
   * ritmo) y el sitio del mundo de donde sale.
   */
  smokeSources(): PuffSource[] {
    const chimneys = [...this.buildings].flatMap(([key, piece]) => {
      const offset = CHIMNEYS[piece.type];
      const model = piece.glb?.object.children[0];
      return offset && model ? [{ key: `b${key}`, at: model.localToWorld(offset.clone()), kind: 'smoke' as const }] : [];
    });
    const wounded = this.s.units.flatMap((unit) => {
      const piece = this.units.get(unit.uid);
      const kind = woundSmokeOf(unit.life);
      if (!piece?.object.visible || !kind) return [];
      return [{ key: `u${unit.uid}`, at: piece.body.getWorldPosition(new THREE.Vector3()).add(WOUND_SMOKE_LIFT), kind }];
    });
    return [...chimneys, ...wounded];
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

  sync(): void {
    this.seen = visibility(this.s, this.viewer);
    this.terrain.showSeen(this.seen);
    this.syncBuildings();
    this.syncUnits();
  }

  /** Lo que se anima solo, sin sucesos: los rotores y las unidades que aparecen. */
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

  private syncBuildings(): void {
    const present = new Set(this.s.buildings.map(buildingKey));
    for (const [key, piece] of this.buildings) if (!present.has(key)) this.removeBuilding(key, piece);
    for (const building of this.s.buildings) this.placeBuilding(building);
  }

  /** De quien se ve que es un edificio: el dueño si se ve la casilla (o es de los suyos); si no, de nadie (como en 2D). */
  private shownOwner(building: Building): OwnerSide {
    const side = ownerSideOf(this.s, this.viewer, building.owner);
    return this.seen.at(building) || isFriendly(side) ? side : 'neutral';
  }

  private placeBuilding(building: Building): void {
    const key = buildingKey(building);
    const side = this.shownOwner(building);
    let piece = this.buildings.get(key);
    if (piece?.side !== side) {
      const wasThere = !!piece;
      if (piece) this.removeBuilding(key, piece);
      piece = this.addBuilding(building, side);
      // Al cambiar de dueño (una captura) el edificio vuelve a crecer con sus colores nuevos.
      if (wasThere) startPopping(piece);
    }
    this.showCapture(piece, building);
  }

  private addBuilding(building: Building, side: OwnerSide): BuildingPiece {
    const glb = this.glbModels.building(building.type, side);
    const object = glb?.object ?? buildModel(buildingModelOf(building.type), SIDE_PAINT[side]);
    object.position.copy(this.groundOf(building));
    const captureBar = newBadge(BUILDING_BADGE_HEIGHT);
    object.add(captureBar);
    const piece: BuildingPiece = { object, captureBar, side, glb, type: building.type, popping: null };
    this.buildings.set(buildingKey(building), piece);
    this.object.add(object);
    return piece;
  }

  /** La barra de lo que le queda a un edificio que se esta capturando (del color de quien lo captura). */
  private showCapture(piece: BuildingPiece, building: Building): void {
    const capture = this.seen.at(building) ? captureProgress(this.s, building) : null;
    if (!capture) return showBar(piece.captureBar, null);
    const color = CAPTURE_COLOR[sideOf(this.s, this.viewer, capture.team)];
    showBar(piece.captureBar, capture.left / capturePointsOf(this.s, building), color);
  }

  private removeBuilding(key: string, piece: BuildingPiece): void {
    this.object.remove(piece.object);
    this.buildings.delete(key);
  }

  private syncUnits(): void {
    const onMap = this.s.units.filter(isOnMap);
    const present = new Set(onMap.map((unit) => unit.uid));
    for (const [uid, piece] of this.units) if (!present.has(uid)) this.removeUnit(uid, piece);
    for (const unit of onMap) this.placeUnit(unit);
  }

  private placeUnit(unit: Unit): void {
    const piece = this.units.get(unit.uid) ?? this.addUnit(unit);
    piece.object.position.copy(this.groundOf(unit));
    piece.object.visible = isShownTo(this.viewer, unit, (pos) => this.seen.at(pos));
    tintSpent(piece.object, unit.team === this.viewer && unit.turnState === 'done');
    showBar(piece.lifeBar, unit.life < 100 ? unit.life / 100 : null);
  }

  /** La pieza de una unidad: su modelo GLB si su tipo lo tiene, si no el de bloques. */
  private unitModel(unit: Unit): { object: THREE.Group; body: THREE.Object3D; badgeHeight: number; glb: GlbUnit | null } {
    const side = sideOf(this.s, this.viewer, unit.team);
    const glb = this.glbModels.unit(unit.type, side);
    if (glb) {
      const top = new THREE.Box3().setFromObject(glb.object).max.y;
      return { object: glb.object, body: glb.object.children[0]!, badgeHeight: top + BADGE_GAP, glb };
    }
    const model = unitModelOf(unit.type);
    const object = buildModel(model, SIDE_PAINT[side]);
    return { object, body: object.getObjectByName('body')!, badgeHeight: BADGE_HEIGHT + (model.hover ?? 0), glb: null };
  }

  private addUnit(unit: Unit): UnitPiece {
    const { object, body, badgeHeight, glb } = this.unitModel(unit);
    const lifeBar = newBadge(badgeHeight);
    object.add(lifeBar);
    const piece: UnitPiece = {
      uid: unit.uid,
      object,
      body,
      turret: object.getObjectByName('turret') ?? null,
      rotor: object.getObjectByName('rotor') ?? null,
      lifeBar,
      glb,
      motion: unitTypeOf(this.s, unit).motion,
      popping: null,
    };
    startPopping(piece);
    this.units.set(unit.uid, piece);
    this.object.add(object);
    return piece;
  }

  private removeUnit(uid: number, piece: UnitPiece): void {
    this.object.remove(piece.object);
    this.units.delete(uid);
  }
}

const buildingKey = (building: Building): string => posKey(building);

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}

/** Una pieza que aparece: su objeto y los segundos que lleva creciendo (null: ya esta). */
interface Popping {
  readonly object: THREE.Object3D;
  popping: number | null;
}

/** Empieza a aparecer: desde casi nada. */
function startPopping(piece: Popping): void {
  piece.object.scale.setScalar(0.01);
  piece.popping = 0;
}

/** Una pieza nueva (una unidad, un edificio con dueño nuevo) crece hasta su tamaño con un pequeño rebote. */
function growIn(piece: Popping, seconds: number): void {
  const elapsed = (piece.popping ?? 0) + seconds;
  const progress = Math.min(elapsed / POP_SECONDS, 1);
  piece.object.scale.setScalar(THREE.MathUtils.lerp(0.01, 1, progress) + Math.sin(progress * Math.PI) * 0.15);
  piece.popping = progress < 1 ? elapsed : null;
}

/** El color de partida de una pieza (lo apunta la primera vez, antes de oscurecerla). */
function baseColorOf(mesh: THREE.Object3D, material: THREE.MeshToonMaterial): THREE.Color {
  if (!(mesh.userData.baseColor instanceof THREE.Color)) mesh.userData.baseColor = material.color.clone();
  return mesh.userData.baseColor as THREE.Color;
}

/** Oscurece (o devuelve a su color) las piezas de una unidad que ya ha hecho todo. */
const tintSpent = (object: THREE.Object3D, isSpent: boolean): void => tint(object, isSpent ? SPENT_TINT : 1);

/** Pone las piezas de una unidad a ese tanto de su color (1: el suyo), con los materiales compartidos de toon.ts. */
export function tint(object: THREE.Object3D, scale: number): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh;
    if (!(mesh.material instanceof THREE.MeshToonMaterial)) return;
    // Con textura (GLB) el material es solo de esta pieza: basta con oscurecer su color.
    if (mesh.material.map) return void mesh.material.color.setScalar(scale);
    mesh.material = toonMaterial(baseColorOf(mesh, mesh.material).clone().multiplyScalar(scale));
  });
}
