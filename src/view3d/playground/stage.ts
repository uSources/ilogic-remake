/**
 * El escenario del playground de modelos: el suelo, cada modelo en su casilla (una baldosa de 1×1
 * debajo, para ver si cabe) y lo que se les puede pedir a la vez: una animacion, girar la torreta,
 * avanzar el tiempo. No sabe de botones: el panel le dice que enseñar.
 */
import * as THREE from 'three';
import type { OwnerSide } from '../../ui/sides';
import { ROTOR_SPEED } from '../engine/pieces/unitPiece';
import type { GlbLibrary, GlbUnit, UnitClip } from '../glbModels';
import { toonMaterial } from '../toon';

/** Un modelo del catalogo: una unidad o un edificio (id del contenido). */
export interface ModelEntry {
  kind: 'unit' | 'building';
  id: string;
}

/** Lo que esta en escena: el modelo, su copia animada y su baldosa. */
interface Shown {
  entry: ModelEntry;
  glb: GlbUnit;
  turret: THREE.Object3D | null;
  rotor: THREE.Object3D | null;
}

/** Separacion entre casillas (casillas): que se vea cada una sin que se pisen. */
const SPACING = 1.7;
const GROUND_SIZE = 80;
const GROUND_COLOR = 0x7cc35a;
const TILE_COLOR = 0x9ad66e;
const SELECTED_TILE_COLOR = 0xffd447;
/** Lo justo por encima del suelo para que la baldosa no parpadee con el. */
const TILE_LIFT = 0.005;

export class Stage {
  readonly object = new THREE.Group();
  private readonly models = new THREE.Group();
  private shown: Shown[] = [];
  private selected: Shown | null = null;

  constructor(private library: GlbLibrary) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2), toonMaterial(GROUND_COLOR));
    ground.receiveShadow = true;
    this.object.add(ground, this.models);
  }

  /** Cambia los modelos cargados (al recargarlos) y vuelve a poner los de ahora. */
  replaceLibrary(library: GlbLibrary, side: OwnerSide): void {
    this.library = library;
    this.show(
      this.shown.map((shown) => shown.entry),
      side,
    );
  }

  /** Pone esos modelos de ese lado en una cuadricula (los que no tengan GLB se saltan). */
  show(entries: readonly ModelEntry[], side: OwnerSide): void {
    this.models.clear();
    this.selected = null;
    const columns = Math.ceil(Math.sqrt(entries.length));
    this.shown = entries.flatMap((entry, index) => {
      const glb = this.copyOf(entry, side);
      if (!glb) return [];
      const slot = new THREE.Vector3((index % columns) * SPACING, 0, Math.floor(index / columns) * SPACING);
      this.place(glb, slot);
      return [{ entry, glb, turret: glb.object.getObjectByName('turret') ?? null, rotor: glb.object.getObjectByName('rotor') ?? null }];
    });
  }

  private copyOf(entry: ModelEntry, side: OwnerSide): GlbUnit | null {
    if (entry.kind === 'building') return this.library.building(entry.id, side);
    return this.library.unit(entry.id, side === 'neutral' ? 'own' : side);
  }

  private place(glb: GlbUnit, slot: THREE.Vector3): void {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), toonMaterial(TILE_COLOR));
    tile.position.copy(slot).setY(TILE_LIFT);
    tile.receiveShadow = true;
    glb.object.position.copy(slot);
    glb.object.userData.tile = tile;
    this.models.add(tile, glb.object);
  }

  /** El centro de lo que se ve y lo que mide (para encuadrarlo con la camara y la sombra). */
  bounds(): { center: THREE.Vector3; radius: number } {
    const box = new THREE.Box3().setFromObject(this.models);
    if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 2 };
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center.setY(0), radius: Math.max(sphere.radius, 1.2) };
  }

  /** Todos a esa animacion (los que la tengan). */
  play(clip: UnitClip): void {
    for (const shown of this.shown) if (shown.glb.clips.some((known) => known.name === clip)) shown.glb.play(clip);
  }

  /** Gira las torretas a ese angulo (grados; 0, al frente). */
  aim(degrees: number): void {
    for (const shown of this.shown) if (shown.turret) shown.turret.rotation.y = THREE.MathUtils.degToRad(degrees);
  }

  /** Avanza las animaciones `seconds` (ya con la velocidad aplicada). */
  update(seconds: number): void {
    for (const shown of this.shown) {
      shown.glb.update(seconds);
      if (shown.rotor) shown.rotor.rotation.y += ROTOR_SPEED * seconds;
    }
  }

  /** Marca el modelo al que pertenece `object` (lo que se ha tocado) y lo devuelve (null si ninguno). */
  select(object: THREE.Object3D | null): ModelEntry | null {
    this.paintTile(this.selected, TILE_COLOR);
    this.selected = object ? (this.shown.find((shown) => isInside(object, shown.glb.object)) ?? null) : null;
    this.paintTile(this.selected, SELECTED_TILE_COLOR);
    return this.selected?.entry ?? null;
  }

  /** Lo que se puede tocar con el raton (los modelos, no el suelo). */
  pickables(): THREE.Object3D[] {
    return this.shown.map((shown) => shown.glb.object);
  }

  /** Datos del modelo marcado (o del unico en escena) para el panel. */
  details(): ModelDetails | null {
    const shown = this.selected ?? (this.shown.length === 1 ? this.shown[0]! : null);
    if (!shown) return null;
    const size = new THREE.Box3().setFromObject(shown.glb.object).getSize(new THREE.Vector3());
    return { entry: shown.entry, clips: shown.glb.clips, size, hasTurret: !!shown.turret };
  }

  private paintTile(shown: Shown | null, color: number): void {
    const tile = shown?.glb.object.userData.tile as THREE.Mesh | undefined;
    if (tile) tile.material = toonMaterial(color);
  }
}

/** Lo que el panel enseña de un modelo: sus animaciones y lo que mide (casillas). */
export interface ModelDetails {
  entry: ModelEntry;
  clips: GlbUnit['clips'];
  size: THREE.Vector3;
  hasTurret: boolean;
}

function isInside(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
