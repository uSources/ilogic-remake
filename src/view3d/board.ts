/**
 * Lo que hay sobre el terreno (unidades y edificios), como piezas 3D que siguen a la partida:
 * `sync` pone las que faltan, quita las que ya no estan y deja cada una en su casilla. La partida no
 * se toca aqui: solo se lee (las animaciones mueven las piezas y despues `sync` las deja donde dice
 * la partida).
 */
import * as THREE from 'three';
import type { Building, GameState, Pos, TeamId, Unit } from '../core/model';
import { posKey } from '../core/geom';
import { isOnMap } from '../core/rules';
import { ownerSideOf, type OwnerSide } from '../ui/sides';
import { buildModel, type TeamPaint } from './blocks';
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

/** Una unidad que ya ha hecho todo en este turno se ve algo hundida en el gris: se lee de un vistazo cual queda. */
const SPENT_TINT = 0.55;

export interface UnitPiece {
  readonly uid: number;
  readonly object: THREE.Group;
  /** Lo que gira aparte (la torreta), si el modelo lo tiene. */
  readonly turret: THREE.Object3D | null;
}

export class BoardView {
  readonly object = new THREE.Group();
  private readonly units = new Map<number, UnitPiece>();
  private readonly buildings = new Map<string, THREE.Group>();

  constructor(
    private readonly s: GameState,
    private readonly viewer: TeamId,
    private readonly terrain: TerrainView,
  ) {}

  /** El punto del suelo de esa casilla (encima de su terreno). */
  groundOf(pos: Pos): THREE.Vector3 {
    return tileToWorld(pos, this.terrain.heightAt(pos));
  }

  pieceOf(uid: number): UnitPiece | undefined {
    return this.units.get(uid);
  }

  /** La pieza de esa unidad si es la que se ha tocado (o algo dentro de ella). */
  unitHit(object: THREE.Object3D): number | null {
    for (const piece of this.units.values()) if (piece.object === object || isInside(object, piece.object)) return piece.uid;
    return null;
  }

  sync(): void {
    this.syncBuildings();
    this.syncUnits();
  }

  private paintOf(owner: TeamId | null): TeamPaint {
    return SIDE_PAINT[ownerSideOf(this.s, this.viewer, owner)];
  }

  private syncBuildings(): void {
    const present = new Set(this.s.buildings.map(buildingKey));
    for (const [key, object] of this.buildings) if (!present.has(key)) this.removeBuilding(key, object);
    for (const building of this.s.buildings) this.placeBuilding(building);
  }

  /** Un edificio que cambia de dueño se vuelve a construir con sus colores nuevos. */
  private placeBuilding(building: Building): void {
    const key = buildingKey(building);
    const owner = String(building.owner);
    const existing = this.buildings.get(key);
    if (existing?.userData.owner === owner) return;
    if (existing) this.removeBuilding(key, existing);
    const object = buildModel(buildingModelOf(building.type), this.paintOf(building.owner));
    object.userData.owner = owner;
    object.position.copy(this.groundOf(building));
    this.buildings.set(key, object);
    this.object.add(object);
  }

  private removeBuilding(key: string, object: THREE.Group): void {
    this.object.remove(object);
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
    tintSpent(piece.object, unit.turnState === 'done');
  }

  private addUnit(unit: Unit): UnitPiece {
    const object = buildModel(unitModelOf(unit.type), this.paintOf(unit.team));
    const piece: UnitPiece = { uid: unit.uid, object, turret: object.getObjectByName('turret') ?? null };
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

/** El color de partida de una pieza (lo apunta la primera vez, antes de oscurecerla). */
function baseColorOf(mesh: THREE.Object3D, material: THREE.MeshToonMaterial): THREE.Color {
  if (!(mesh.userData.baseColor instanceof THREE.Color)) mesh.userData.baseColor = material.color.clone();
  return mesh.userData.baseColor as THREE.Color;
}

/** Oscurece (o devuelve a su color) las piezas de una unidad, con los materiales compartidos de toon.ts. */
function tintSpent(object: THREE.Object3D, isSpent: boolean): void {
  const scale = isSpent ? SPENT_TINT : 1;
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh;
    if (!(mesh.material instanceof THREE.MeshToonMaterial)) return;
    mesh.material = toonMaterial(baseColorOf(mesh, mesh.material).clone().multiplyScalar(scale));
  });
}
