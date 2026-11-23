/**
 * [CAMBIO] Las zonas de los puntos de control en el tablero, como dice systems/board/boardScene.ts
 * (`ControlZoneLook`): un borde dorado por fuera (como en el minimapa), por dentro de el una cinta del
 * color de su dueño y un banderin suyo en cada esquina, que asoma por encima del bosque y del relieve.
 * De nadie, todo dorado. Sin velo en las casillas: azul se confundiria con a donde se puede ir y rojo
 * con la amenaza. Disputada (se ven enemigos dentro), el borde late en rojo: si sigue asi al acabar la
 * ronda, no paga. Solo dibuja lo que se le dice; no va con las piezas que se tocan (el raton atraviesa
 * la zona hasta su casilla).
 */
import * as THREE from 'three';
import { samePos } from '../../../core/geom';
import type { Pos } from '../../../core/model';
import type { OwnerSide } from '../../../ui/sides';
import type { ControlZoneLook } from '../../systems/board/boardScene';
import { highestIn, stripsOn, type MarkGround } from '../fx/groundFit';
import { flatMaterial, INK_COLOR, instanced, unitBox, type StripSize } from '../fx/markParts';
import { outlineSides } from '../fx/tileOutline';
import { buildModel, type BlockModel, type TeamPaint } from './blocks';
import { SIDE_PAINT } from './sidePaint';

/** El dorado del borde (el de los puntos de control en el minimapa). */
const GOLD = 0xffd34d;
const GOLD_DARK = 0xc99a1e;
/** Hacia donde late el borde de una zona disputada. */
const CONTESTED_COLOR = 0xff4d45;
/** Latidos por segundo del borde disputado. */
const CONTESTED_PULSE = 1.2;

/** Por debajo de las marcas del turno (fx/highlights.ts), que se pintan encima de la zona. */
const LIFT = 0.006;
/** El borde: tinta por debajo, que asome a los lados, y el dorado encima (como el cursor). */
const BORDER_INK: StripSize = { width: 0.26, height: 0.04 };
const BORDER_GOLD: StripSize = { width: 0.11, height: 0.065 };
/** La cinta del dueño, pegada al dorado por dentro (algo mas baja: el dorado manda). */
const OWNER_BAND: StripSize = { width: 0.1, height: 0.055 };
/** Donde va cada tira, desde el centro de su casilla (0,5: el borde; la tinta asoma un poco por fuera). */
const BORDER_INSET = 0.52;
const BAND_INSET = BORDER_INSET - BORDER_GOLD.width;

/** De que color es la zona de cada lado; la de nadie, dorada (el gris de lo neutral no se veria en la nieve). */
const ZONE_PAINT: Readonly<Record<OwnerSide, TeamPaint>> = {
  own: SIDE_PAINT.own,
  ally: SIDE_PAINT.ally,
  enemy: SIDE_PAINT.enemy,
  neutral: { team: GOLD, teamDark: GOLD_DARK },
};

/** La parte del banderin que ondea (gira sobre el mastil). */
const CLOTH = 'cloth';

/** Lo que mide de lado la peana del banderin. */
const PENNANT_BASE = 0.14;
/** Un banderin algo menor que el de destino (fx/destinationFlags.ts): mastil, pomo y tela con su franja. */
const PENNANT: BlockModel = {
  blocks: [
    { size: [PENNANT_BASE, 0.04, PENNANT_BASE], at: [0, 0, 0], paint: 'stone' },
    { size: [0.05, 0.7, 0.05], at: [0, 0.04, 0], paint: 'wood' },
    { size: [0.09, 0.09, 0.09], at: [0, 0.74, 0], paint: 'light' },
    { size: [0.34, 0.24, 0.035], at: [0.19, 0.48, 0], paint: 'team', part: CLOTH },
    { size: [0.34, 0.05, 0.041], at: [0.19, 0.48, 0], paint: 'teamDark', part: CLOTH },
  ],
};

/** Donde va el banderin en su casilla de esquina: sobre la esquina del borde dorado. */
const PENNANT_REACH = BORDER_INSET - BORDER_GOLD.width / 2;
/** Cuanto gira la tela al ondear (radianes), lo rapido (vueltas por segundo) y el desfase de cada uno. */
const SWAY_ANGLE = 0.3;
const SWAY_SPEED = 0.5;
const PHASE_PER_PENNANT = 0.37;

/** Las cuatro esquinas de la zona (cada eje, -1 o 1). */
const CORNERS: readonly Pos[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

/** Una zona puesta: su objeto, lo que late y lo que ondea. */
interface PlacedZone {
  readonly group: THREE.Group;
  readonly side: OwnerSide;
  readonly tiles: readonly Pos[];
  readonly border: THREE.MeshBasicMaterial;
  /** Sus materiales planos (los cartoon de los banderines se comparten: esos no se tiran). */
  readonly materials: readonly THREE.Material[];
  readonly cloths: readonly THREE.Object3D[];
  readonly phase: number;
  isContested: boolean;
}

export class ControlZonesView {
  readonly object = new THREE.Group();
  /** Por casilla del centro: solo se rehace la que cambia (de dueño o de casillas). */
  private readonly zones = new Map<string, PlacedZone>();
  private seconds = 0;
  private readonly gold = new THREE.Color(GOLD);
  private readonly contested = new THREE.Color(CONTESTED_COLOR);

  constructor(private readonly ground: MarkGround) {}

  sync(looks: readonly ControlZoneLook[]): void {
    const wanted = new Map(looks.map((look) => [look.key, look]));
    for (const [key, zone] of this.zones) if (!stillFits(zone, wanted.get(key))) this.remove(key, zone);
    for (const look of looks) {
      const zone = this.zones.get(look.key) ?? this.add(look);
      zone.isContested = look.isContested;
    }
  }

  /** Cada fotograma: los banderines ondean y el borde de las disputadas late. */
  update(seconds: number): void {
    this.seconds += seconds;
    for (const zone of this.zones.values()) {
      zone.cloths.forEach((cloth, index) => {
        cloth.rotation.y = Math.sin((this.seconds * SWAY_SPEED + zone.phase + index * PHASE_PER_PENNANT) * Math.PI * 2) * SWAY_ANGLE;
      });
      const beat = zone.isContested ? (1 - Math.cos(this.seconds * CONTESTED_PULSE * Math.PI * 2)) / 2 : 0;
      zone.border.color.lerpColors(this.gold, this.contested, beat);
    }
  }

  private add(look: ControlZoneLook): PlacedZone {
    const paint = ZONE_PAINT[look.side];
    const band = flatMaterial(new THREE.Color(paint.team).getHex(), 1);
    const ink = flatMaterial(INK_COLOR, 1);
    const border = flatMaterial(GOLD, 1);
    const group = new THREE.Group();
    group.add(
      this.stripsOf(look.tiles, ink, BORDER_INK, BORDER_INSET),
      this.stripsOf(look.tiles, border, BORDER_GOLD, BORDER_INSET),
      this.stripsOf(look.tiles, band, OWNER_BAND, BAND_INSET),
    );
    const pennants = cornersOf(look.tiles).map((corner) => this.pennantAt(corner, paint));
    group.add(...pennants);
    const zone: PlacedZone = {
      group,
      side: look.side,
      tiles: look.tiles,
      border,
      materials: [band, ink, border],
      cloths: pennants.flatMap((pennant) => pennant.getObjectByName(CLOTH) ?? []),
      phase: (look.center.x + look.center.y) * PHASE_PER_PENNANT,
      isContested: look.isContested,
    };
    this.zones.set(look.key, zone);
    this.object.add(group);
    return zone;
  }

  /** Una tira en cada lado de fuera de la zona, a `inset` del centro de su casilla (en trozos sobre el relieve). */
  private stripsOf(tiles: readonly Pos[], material: THREE.Material, strip: StripSize, inset: number): THREE.InstancedMesh {
    const placement = { inset, length: 1, lift: LIFT };
    const pieces = outlineSides(tiles).flatMap(({ pos, side }) => stripsOn(this.ground, pos, side, placement, strip));
    const mesh = instanced(unitBox(), material, pieces.length);
    pieces.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.count = pieces.length;
    return mesh;
  }

  /** El banderin de una esquina, con la tela hacia fuera de la zona (no tapa lo que hay dentro), sobre lo mas alto de su peana. */
  private pennantAt(corner: ZoneCorner, paint: TeamPaint): THREE.Group {
    const pennant = buildModel(PENNANT, paint);
    const x = corner.tile.x + corner.toward.x * PENNANT_REACH;
    const z = corner.tile.y + corner.toward.y * PENNANT_REACH;
    pennant.position.set(x, highestIn(this.ground, { x, z, halfX: PENNANT_BASE / 2, halfZ: PENNANT_BASE / 2 }), z);
    // La tela sale hacia +x del modelo: girada, apunta en diagonal hacia fuera de la esquina.
    pennant.rotation.y = Math.atan2(-corner.toward.y, corner.toward.x);
    return pennant;
  }

  /** Sus bloques y losas son de geometria propia, y sus materiales planos tambien. */
  private remove(key: string, zone: PlacedZone): void {
    this.object.remove(zone.group);
    zone.group.traverse((part) => {
      if (isMesh(part)) part.geometry.dispose();
    });
    for (const material of zone.materials) material.dispose();
    this.zones.delete(key);
  }
}

const isMesh = (part: THREE.Object3D): part is THREE.Mesh => part instanceof THREE.Mesh;

/** La zona puesta sigue valiendo: el mismo dueño y las mismas casillas (si no, se rehace). */
const stillFits = (zone: PlacedZone, look: ControlZoneLook | undefined): boolean =>
  look !== undefined && zone.side === look.side && sameTiles(zone.tiles, look.tiles);

function sameTiles(placed: readonly Pos[], wanted: readonly Pos[]): boolean {
  return placed.length === wanted.length && placed.every((pos, index) => wanted[index] !== undefined && samePos(pos, wanted[index]));
}

/** Una esquina de la zona: su casilla y hacia donde queda la esquina desde su centro. */
interface ZoneCorner {
  readonly tile: Pos;
  readonly toward: Pos;
}

/** Las casillas de las cuatro esquinas de la zona (si el borde del mapa la corta, las de lo que queda). */
function cornersOf(tiles: readonly Pos[]): ZoneCorner[] {
  const xs = tiles.map((pos) => pos.x);
  const ys = tiles.map((pos) => pos.y);
  const edge = (values: readonly number[], toward: number): number => (toward < 0 ? Math.min(...values) : Math.max(...values));
  return CORNERS.map((toward) => ({ tile: { x: edge(xs, toward.x), y: edge(ys, toward.y) }, toward }));
}
