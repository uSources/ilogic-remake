/**
 * Las marcas planas apoyadas en el suelo de verdad. El relieve (dunas, montañas) tiene columnas de
 * distinta altura dentro de una misma casilla: una losa o una tira a la altura del centro de la
 * casilla quedaria enterrada a trozos. Como una pieza de plastico rigida, se apoya en lo mas alto que
 * tiene debajo: entera si el suelo sube poco (las dunas) y, en una ladera empinada, en trozos (un
 * cuarto de casilla), cada uno a lo mas alto de lo suyo (entera flotaria por encima de la unidad).
 * Solo cuentas: las piezas, en markParts.ts.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { SUBCELLS } from '../terrain/reliefGrid';
import { slabMatrix, SLAB_HEIGHT, STRIP, stripMatrix, type StripSize } from './markParts';
import { SIDE_STEPS, type TileSide } from './tileOutline';

/** El suelo en el que se apoyan las marcas (lo da el tablero, con el terreno). */
export interface MarkGround {
  /** El punto del suelo en el centro de la casilla (donde se ponen las piezas). */
  groundOf(pos: Pos): THREE.Vector3;
  /** Lo alto del suelo en un punto del mundo (casillas), con el relieve. */
  surfaceAt(x: number, z: number): number;
}

/** En cuantos trozos se parte cada lado de una marca que pisa relieve (cada uno, dos subcasillas). */
export const PIECES_PER_SIDE = 4;
/** Cada cuanto se mira el suelo: una subcasilla del relieve, para no saltarse ninguna columna. */
const PROBE_STEP = 1 / SUBCELLS;
/** Lo que se mete hacia dentro cada sonda de los bordes: la del borde justo seria ya de la columna de al lado. */
const PROBE_MARGIN = 0.01;

/** Un rectangulo del suelo: su centro (x, z del mundo) y lo que mide de medio en cada eje. */
interface GroundArea {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
}

/** Las sondas de un eje: de punta a punta, sin pasar de una subcasilla entre ellas. */
function probesAlong(center: number, half: number): number[] {
  const reach = Math.max(0, half - PROBE_MARGIN);
  const gaps = Math.max(1, Math.ceil((2 * reach) / PROBE_STEP));
  return Array.from({ length: gaps + 1 }, (_, index) => center - reach + (2 * reach * index) / gaps);
}

/** Lo mas alto del suelo en ese rectangulo (sin listas de por medio: se mira muchas veces por marca). */
export function highestIn(ground: MarkGround, area: GroundArea): number {
  const zs = probesAlong(area.z, area.halfZ);
  const highestAcross = (highest: number, x: number): number => zs.reduce((top, z) => Math.max(top, ground.surfaceAt(x, z)), highest);
  return probesAlong(area.x, area.halfX).reduce(highestAcross, -Infinity);
}

/** Lo mas alto de toda la casilla: donde va lo que la cubre entera (el cursor, el anillo, la diana). */
export const tileTop = (ground: MarkGround, pos: Pos): number => highestIn(ground, { x: pos.x, z: pos.y, halfX: 0.5, halfZ: 0.5 });

/** Los trozos de un lado (desplazamientos desde el centro, de -length/2 a length/2) y lo que mide cada uno. */
function piecesOf(length: number): { offsets: number[]; size: number } {
  const size = length / PIECES_PER_SIDE;
  return { offsets: Array.from({ length: PIECES_PER_SIDE }, (_, index) => -length / 2 + size * (index + 0.5)), size };
}

/**
 * Lo que puede subir el suelo bajo una marca para que vaya entera, apoyada en lo mas alto (casillas):
 * lo de una duna. Mas, es una ladera y va en trozos.
 */
const WHOLE_RISE = 0.2;

/** La altura a la que va entera, si el suelo de debajo sube poco (si no, null: en trozos). */
function wholeHeight(heights: readonly number[]): number | null {
  const highest = Math.max(...heights);
  return highest - Math.min(...heights) <= WHOLE_RISE ? highest : null;
}

/**
 * Lo gruesos que son los trozos de una losa en una ladera: casi nada. Las losas son translucidas y los
 * lados de dos trozos que se tocan se pintan uno encima de otro: gruesos, se veria una cuadricula.
 */
const PIECE_HEIGHT = 0.008;

/**
 * Una losa de `size` (de 0 a 1 de la casilla) sobre la casilla, `lift` por encima de lo mas alto de su
 * suelo: entera en llano y en las dunas, y en una ladera en trozos finos, cada uno sobre lo suyo.
 */
export function slabsOn(ground: MarkGround, pos: Pos, size: number, lift: number, height = SLAB_HEIGHT): THREE.Matrix4[] {
  const { offsets, size: pieceSize } = piecesOf(size);
  const half = pieceSize / 2;
  const pieces = offsets.flatMap((dx) => offsets.map((dz) => ({ x: pos.x + dx, z: pos.y + dz })));
  const heights = pieces.map((piece) => highestIn(ground, { ...piece, halfX: half, halfZ: half }));
  const whole = wholeHeight(heights);
  if (whole !== null) return [slabMatrix(new THREE.Vector3(pos.x, whole + lift, pos.y), size, height)];
  const pieceHeight = Math.min(height, PIECE_HEIGHT);
  return pieces.map((piece, index) =>
    slabMatrix(new THREE.Vector3(piece.x, (heights[index] ?? 0) + lift, piece.z), pieceSize, pieceHeight),
  );
}

/** Donde va una tira dentro de su casilla: a `inset` del centro (0,5: el borde), su largo y lo que se levanta del suelo. */
export interface StripPlacement {
  readonly inset: number;
  readonly length: number;
  readonly lift: number;
}

/** Hacia donde va a lo largo una tira de ese lado: las de norte y sur, por x; las de este y oeste, por z. */
const alongSide = (side: TileSide): Pos => (SIDE_STEPS[side].y === 0 ? { x: 0, y: 1 } : { x: 1, y: 0 });

/** Lo que pisa un trozo de tira: `offset` es su centro a lo largo del lado, desde el centro de la casilla. */
function stripPieceArea(pos: Pos, side: TileSide, offset: number, pieceLength: number, inset: number, strip: StripSize): GroundArea {
  const step = SIDE_STEPS[side];
  const along = alongSide(side);
  const across = inset - strip.width / 2;
  return {
    x: pos.x + step.x * across + along.x * offset,
    z: pos.y + step.y * across + along.y * offset,
    halfX: (along.x ? pieceLength : strip.width) / 2,
    halfZ: (along.y ? pieceLength : strip.width) / 2,
  };
}

/**
 * Una tira en el lado `side` de la casilla, como `stripMatrix` (markParts.ts), `lift` por encima de lo
 * mas alto de su suelo: entera en llano y en las dunas, y en una ladera en trozos, cada uno sobre lo suyo.
 */
export function stripsOn(ground: MarkGround, pos: Pos, side: TileSide, placement: StripPlacement, strip = STRIP): THREE.Matrix4[] {
  const { offsets, size } = piecesOf(placement.length);
  const heights = offsets.map((offset) => highestIn(ground, stripPieceArea(pos, side, offset, size, placement.inset, strip)));
  const along = alongSide(side);
  // `stripMatrix` cuenta desde el centro de la casilla: cada trozo, desde su sitio a lo largo del lado.
  const pieceAt = (offset: number, height: number, length: number) => {
    const from = new THREE.Vector3(pos.x + along.x * offset, height + placement.lift, pos.y + along.y * offset);
    return stripMatrix(from, side, placement.inset, length, strip);
  };
  const whole = wholeHeight(heights);
  if (whole !== null) return [pieceAt(0, whole, placement.length)];
  return offsets.map((offset, index) => pieceAt(offset, heights[index] ?? 0, size));
}
