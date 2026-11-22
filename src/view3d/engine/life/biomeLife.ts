/**
 * Lo que vive en el tablero sin ser de la partida: las motas que vuelan cerca de lo que se mira
 * (motes.ts) y los animalitos sentados en el decorado (critters.ts). Que lleva cada terreno lo dicen
 * sus piezas (terrain/pieces.ts) y que es cada cosa, kinds.ts; aqui se junta todo: una bandada por clase
 * de mota y unas copias por clase de animal. Lo crea el terreno, porque los animales se oscurecen con
 * la niebla como el decorado en el que se sientan.
 */
import * as THREE from 'three';
import type { GameState, Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import { groupBy } from '../core/groupBy';
import type { GlbLibrary } from '../pieces/glbModels';
import { pieceAt } from '../terrain/pieces';
import { shade, tileNoise } from '../terrain/placed';
import { Critters, type CritterKind, type CritterSpot } from './critters';
import { MoteSwarm, type MoteKind } from './motes';

/** Lo que la vida del bioma pregunta al terreno. */
export interface LifeGround {
  /** Las casillas del mapa. */
  positions: readonly Pos[];
  /** El punto del suelo de una casilla, nuevo cada vez: de ahi salen las motas y cada una se queda el suyo. */
  groundOf: (pos: Pos) => THREE.Vector3;
  /** Donde va el decorado de una casilla, o null si no lleva (ahi se sientan los animales). */
  decorPlaceOf: (pos: Pos) => THREE.Matrix4 | null;
}

/** Con que numero de `tileNoise` decide cada sitio del decorado si lleva animal (y el siguiente, hacia donde mira). */
const SEAT_SALT = 8;
const SALTS_PER_SEAT = 2;

/** Las casillas de cada clase de mota (las que la llevan en su pieza). */
export function tilesByMote(s: GameState, positions: readonly Pos[]): Map<MoteKind, Pos[]> {
  const pairs = positions.flatMap((pos) => (pieceAt(s, pos).motes ?? []).map((kind) => ({ kind, pos })));
  const byKind = groupBy(pairs, (pair) => pair.kind);
  return new Map([...byKind].map(([kind, tiles]) => [kind, tiles.map((pair) => pair.pos)]));
}

/**
 * Los animales de una casilla con decorado: en cada sitio donde se sientan y les toca (siempre igual),
 * mirando a cualquier lado.
 */
function seatedAt(s: GameState, pos: Pos, decorPlace: THREE.Matrix4 | null): { kind: CritterKind; spot: CritterSpot }[] {
  if (!decorPlace) return [];
  return (pieceAt(s, pos).critters ?? []).flatMap((seat, index) => {
    const salt = SEAT_SALT + index * SALTS_PER_SEAT;
    if (tileNoise(pos, salt) >= seat.share) return [];
    const at = new THREE.Vector3(...seat.at).applyMatrix4(decorPlace);
    return [{ kind: seat.kind, spot: { pos, at, heading: tileNoise(pos, salt + 1) * Math.PI * 2 } }];
  });
}

/** Los sitios de los animales de cada clase. */
export function spotsByCritter(s: GameState, ground: LifeGround): Map<CritterKind, CritterSpot[]> {
  const seated = ground.positions.flatMap((pos) => seatedAt(s, pos, ground.decorPlaceOf(pos)));
  const byKind = groupBy(seated, (critter) => critter.kind);
  return new Map([...byKind].map(([kind, critters]) => [kind, critters.map((critter) => critter.spot)]));
}

export class BiomeLife {
  readonly object = new THREE.Group();
  private readonly swarms: readonly MoteSwarm[];
  private readonly critters: readonly Critters[];

  constructor(s: GameState, library: GlbLibrary, ground: LifeGround) {
    this.swarms = [...tilesByMote(s, ground.positions)].map(([kind, tiles]) => new MoteSwarm(kind, tiles, ground.groundOf));
    this.critters = [...spotsByCritter(s, ground)].map(([kind, spots]) => new Critters(library, kind, spots));
    const parts = [
      ...this.swarms.map((swarm) => swarm.object),
      ...this.critters.flatMap((group) => group.placed.map((placed) => placed.mesh)),
    ];
    if (parts.length) this.object.add(...parts);
  }

  /** Mueve lo que vive cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    for (const swarm of this.swarms) swarm.update(seconds, center, radius, camera, viewportHeight);
    for (const group of this.critters) group.update(seconds);
  }

  /** Oscurece los animales de las casillas que no se ven (como su decorado). */
  showSeen(seen: Grid<boolean>): void {
    shade(
      this.critters.flatMap((group) => group.placed),
      seen,
    );
  }
}
