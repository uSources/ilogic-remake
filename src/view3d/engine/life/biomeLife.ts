/**
 * Lo que vive en el tablero sin ser de la partida: las motas que vuelan cerca de lo que se mira
 * (motes.ts), los animalitos sentados en el decorado o en el suelo (critters.ts) y los que se van volando
 * (travellers.ts). Que lleva cada terreno lo dicen sus piezas (terrain/pieces.ts) y que es cada cosa,
 * kinds.ts; aqui se junta todo: una bandada por clase de mota o de viajero y unas copias por clase de
 * animal. Lo crea el terreno, porque los animales se oscurecen con la niebla como el decorado en el que
 * se sientan.
 */
import * as THREE from 'three';
import { terrainAt } from '../../../core/gameContent';
import { mapGrid } from '../../../core/mapGrid';
import type { GameState, Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import { groupBy } from '../core/groupBy';
import type { GlbLibrary } from '../pieces/glbModels';
import { pieceAt, type TerrainPiece } from '../terrain/pieces';
import { shade, tileNoise } from '../terrain/placed';
import { Critters, type CritterKind, type CritterSeat, type CritterSpot, type SeatEdge } from './critters';
import { MoteSwarm, type MoteKind } from './motes';
import { Travellers, type TravelGround, type TravellerKind } from './travellers';

/** Lo que la vida del bioma pregunta al terreno (y, de eso, lo de los viajeros: el suelo de cada sitio). */
export interface LifeGround extends TravelGround {
  /** Las casillas del mapa. */
  positions: readonly Pos[];
  /** Donde va el decorado de una casilla, o null si no lleva (ahi se sientan los animales; los del suelo, en `groundOf`). */
  decorPlaceOf: (pos: Pos) => THREE.Matrix4 | null;
}

/** Con que numero de `tileNoise` decide cada sitio del decorado si lleva animal (y el siguiente, hacia donde mira). */
const SEAT_SALT = 8;
const SALTS_PER_SEAT = 2;
/** Y con cual se elige, en el suelo, el primer cuarto de vuelta que se prueba (el mismo para todos los de la casilla: van juntos). */
const QUARTER_SALT = 40;
const QUARTERS = 4;

/** Las casillas de cada clase de lo que `kindsOf` dice que lleva una pieza. */
function tilesByKind<Kind>(
  s: GameState,
  positions: readonly Pos[],
  kindsOf: (piece: TerrainPiece) => readonly Kind[] | undefined,
): Map<Kind, Pos[]> {
  const pairs = positions.flatMap((pos) => (kindsOf(pieceAt(s, pos)) ?? []).map((kind) => ({ kind, pos })));
  const byKind = groupBy(pairs, (pair) => pair.kind);
  return new Map([...byKind].map(([kind, tiles]) => [kind, tiles.map((pair) => pair.pos)]));
}

/** Las casillas de cada clase de mota (las que la llevan en su pieza). */
export const tilesByMote = (s: GameState, positions: readonly Pos[]): Map<MoteKind, Pos[]> =>
  tilesByKind(s, positions, (piece) => piece.motes);

/** Las casillas de cada clase de viajero (de donde salen). */
export const tilesByTraveller = (s: GameState, positions: readonly Pos[]): Map<TravellerKind, Pos[]> =>
  tilesByKind(s, positions, (piece) => piece.travellers);

/**
 * La casilla de al lado por la que queda `at` desde el centro de `pos` (por donde se aleja mas). Un sitio
 * justo en el centro no queda por ningun lado: da `pos`, y el animal del borde no se sienta ahi.
 */
function sideToward(pos: Pos, at: THREE.Vector3): Pos {
  const across = at.x - pos.x;
  const along = at.z - pos.y;
  return Math.abs(across) >= Math.abs(along) ? { x: pos.x + Math.sign(across), y: pos.y } : { x: pos.x, y: pos.y + Math.sign(along) };
}

/** Si la casilla de al lado (`side`) es lo que pide un sitio del borde. */
const EDGE_SIDES: Readonly<Record<SeatEdge, (s: GameState, pos: Pos, side: Pos) => boolean>> = {
  otherTerrain: (s, pos, side) => terrainAt(s, side).id !== terrainAt(s, pos).id,
  water: (s, _pos, side) => terrainAt(s, side).isWater,
};

/** La casilla de al lado por la que queda un sitio del borde, si es lo que pide; null si no (otra cosa, el borde del mapa). */
function edgeSide(s: GameState, pos: Pos, at: THREE.Vector3, edge: SeatEdge): Pos | null {
  const side = sideToward(pos, at);
  return mapGrid(s).contains(side) && EDGE_SIDES[edge](s, pos, side) ? side : null;
}

/**
 * Donde puede ir un sitio en una casilla: en su decorado (si lleva) o, en el suelo, girado alrededor
 * del centro cada cuarto de vuelta, empezando por uno al azar.
 */
function placesOf(seat: CritterSeat, pos: Pos, ground: LifeGround): THREE.Matrix4[] {
  if (!seat.onTheGround) {
    const decorPlace = ground.decorPlaceOf(pos);
    return decorPlace ? [decorPlace] : [];
  }
  const center = ground.groundOf(pos);
  const first = Math.floor(tileNoise(pos, QUARTER_SALT) * QUARTERS);
  return Array.from({ length: QUARTERS }, (_, step) =>
    new THREE.Matrix4().makeRotationY(((first + step) * Math.PI) / 2).setPosition(center),
  );
}

/** Lo que hace falta para sentar a los animales de una casilla. */
interface Seating {
  s: GameState;
  pos: Pos;
  ground: LifeGround;
}

/**
 * El animal de un sitio puesto asi, mirando a cualquier lado o, los del borde, fuera: a la casilla de
 * ese lado (los modelos miran al norte, -z), con lo que baja su suelo. Null si ahi no vale.
 */
function spotIn(seating: Seating, seat: CritterSeat, place: THREE.Matrix4, headingSalt: number): CritterSpot | null {
  const { s, pos, ground } = seating;
  const at = new THREE.Vector3(...seat.at).applyMatrix4(place);
  if (!seat.edge) return { pos, at, heading: tileNoise(pos, headingSalt) * Math.PI * 2, drop: 0 };
  const side = edgeSide(s, pos, at, seat.edge);
  if (!side) return null;
  return { pos, at, heading: Math.atan2(pos.x - side.x, pos.y - side.y), drop: Math.max(0, at.y - ground.groundOf(side).y) };
}

/** Los animales de una casilla: en cada sitio donde se sientan y les toca (siempre igual). */
function seatedAt(s: GameState, pos: Pos, ground: LifeGround): { kind: CritterKind; spot: CritterSpot }[] {
  return (pieceAt(s, pos).critters ?? []).flatMap((seat, index) => {
    const salt = SEAT_SALT + index * SALTS_PER_SEAT;
    if (tileNoise(pos, salt) >= seat.share) return [];
    const spot = placesOf(seat, pos, ground)
      .map((place) => spotIn({ s, pos, ground }, seat, place, salt + 1))
      .find((found) => found !== null);
    return spot ? [{ kind: seat.kind, spot }] : [];
  });
}

/** Los sitios de los animales de cada clase. */
export function spotsByCritter(s: GameState, ground: LifeGround): Map<CritterKind, CritterSpot[]> {
  const seated = ground.positions.flatMap((pos) => seatedAt(s, pos, ground));
  const byKind = groupBy(seated, (critter) => critter.kind);
  return new Map([...byKind].map(([kind, critters]) => [kind, critters.map((critter) => critter.spot)]));
}

export class BiomeLife {
  readonly object = new THREE.Group();
  private readonly swarms: readonly MoteSwarm[];
  private readonly critters: readonly Critters[];
  private readonly travellers: readonly Travellers[];

  constructor(s: GameState, library: GlbLibrary, ground: LifeGround) {
    this.swarms = [...tilesByMote(s, ground.positions)].map(([kind, tiles]) => new MoteSwarm(kind, tiles, ground.groundOf));
    this.critters = [...spotsByCritter(s, ground)].map(([kind, spots]) => new Critters(library, kind, spots));
    this.travellers = [...tilesByTraveller(s, ground.positions)].map(([kind, tiles]) => new Travellers(library, kind, tiles, ground));
    const parts = [
      ...this.swarms.map((swarm) => swarm.object),
      ...this.critters.flatMap((group) => group.placed.map((placed) => placed.mesh)),
      ...this.travellers.map((flock) => flock.object),
    ];
    if (parts.length) this.object.add(...parts);
  }

  /** Mueve lo que vive cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    for (const swarm of this.swarms) swarm.update(seconds, center, radius, camera, viewportHeight);
    for (const group of this.critters) group.update(seconds);
    for (const flock of this.travellers) flock.update(seconds, center, radius);
  }

  /** Oscurece los animales de las casillas que no se ven (como su decorado). */
  showSeen(seen: Grid<boolean>): void {
    shade(
      this.critters.flatMap((group) => group.placed),
      seen,
    );
  }
}
