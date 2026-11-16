/**
 * Islotes de bloques en el mar, cerca del tablero: que el mapa parezca un trozo de un mundo de
 * juguete y no lo unico que hay. Cada islote es un monton de columnas de una casilla (una playa
 * baja y, en medio, un cerro de la tierra del tema), siempre los mismos en cada partida. Todos van en
 * una malla instanciada con el material cartoon; no se tocan (no son del mapa).
 */
import * as THREE from 'three';
import { toonMaterial } from '../core/toon';

const ISLET_COUNT = 14;
/** A cuantas casillas del borde del tablero pueden estar (ni pegados ni perdidos en la niebla). */
const ISLET_DISTANCE = { near: 6, far: 34 } as const;
/** Radio de un islote (casillas). */
const ISLET_RADIUS = { small: 2, large: 4.5 } as const;
/** Altura de la cara de arriba de la playa y de cada escalon del cerro (casillas). */
const BEACH_TOP = 0.02;
const STEP_HEIGHT = 0.5;
/** La base de los bloques, bajo el agua. */
const ISLET_BOTTOM = -0.6;

/** Arena de la playa, tierra de encima y roca del pico, por tema (id de themes.json). */
interface IsletColors {
  beach: number;
  land: number;
  peak: number;
}

const GREEN_ISLET: IsletColors = { beach: 0xf2d38a, land: 0x6fae3c, peak: 0x8c8676 };
const ISLET_BY_THEME: Readonly<Record<string, IsletColors>> = {
  Forest: { beach: 0xe8c880, land: 0x4f8f34, peak: 0x8c8676 },
  Swamp: { beach: 0xc8b47a, land: 0x5e8a3c, peak: 0x7d7a62 },
  Desert: { beach: 0xffe2a0, land: 0xf2c66e, peak: 0xd0712c },
  Snowy: { beach: 0xc6d4e6, land: 0xf4f8ff, peak: 0x9eacc2 },
};

/** Numeros al azar siempre iguales. */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

interface Column {
  x: number;
  z: number;
  top: number;
  color: number;
}

/** Un sitio en el mar alrededor del tablero, a esa distancia de su borde. */
function isletCenter(center: THREE.Vector3, half: THREE.Vector2, random: () => number): THREE.Vector2 {
  const angle = random() * Math.PI * 2;
  const distance = ISLET_DISTANCE.near + random() * (ISLET_DISTANCE.far - ISLET_DISTANCE.near);
  const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  // Hasta el borde del rectangulo del tablero en esa direccion, y de ahi `distance` mas.
  const toEdge = Math.min(half.x / Math.abs(direction.x || 1e-6), half.y / Math.abs(direction.y || 1e-6));
  return new THREE.Vector2(center.x, center.z).addScaledVector(direction, toEdge + distance);
}

/** Donde va un islote (centro en el suelo: x, z) y su radio (casillas). */
export interface Islet {
  at: THREE.Vector2;
  radius: number;
}

/** Donde van los islotes alrededor de un tablero de ese centro y medio lado (casillas): siempre los mismos. */
export function planIslets(center: THREE.Vector3, half: THREE.Vector2): Islet[] {
  const random = seededRandom(7);
  return Array.from({ length: ISLET_COUNT }, () => {
    const at = isletCenter(center, half, random).round();
    return { at, radius: ISLET_RADIUS.small + random() * (ISLET_RADIUS.large - ISLET_RADIUS.small) };
  });
}

/** Las columnas de un islote: cuanto mas cerca del medio, mas alto; el borde, playa. */
function isletColumns({ at, radius }: Islet, colors: IsletColors, random: () => number): Column[] {
  const reach = Math.ceil(radius);
  const columns: Column[] = [];
  for (let dx = -reach; dx <= reach; dx++)
    for (let dz = -reach; dz <= reach; dz++) {
      const inside = 1 - Math.hypot(dx, dz) / radius + (random() - 0.5) * 0.3;
      if (inside <= 0) continue;
      const steps = Math.floor(inside * radius * 0.9);
      const color = steps === 0 ? colors.beach : steps >= 3 ? colors.peak : colors.land;
      columns.push({ x: at.x + dx, z: at.y + dz, top: BEACH_TOP + steps * STEP_HEIGHT, color });
    }
  return columns;
}

/** Los bloques de los islotes, con la tierra del tema (id de themes.json). */
export function buildIslets(islets: readonly Islet[], theme: string): THREE.InstancedMesh {
  const colors = ISLET_BY_THEME[theme] ?? GREEN_ISLET;
  const random = seededRandom(13);
  const columns = islets.flatMap((islet) => isletColumns(islet, colors, random));
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial(0xffffff), columns.length);
  const matrix = new THREE.Matrix4();
  const noTurn = new THREE.Quaternion();
  columns.forEach((column, index) => {
    const height = column.top - ISLET_BOTTOM;
    const at = new THREE.Vector3(column.x, ISLET_BOTTOM + height / 2, column.z);
    mesh.setMatrixAt(index, matrix.compose(at, noTurn, new THREE.Vector3(1, height, 1)));
    mesh.setColorAt(index, new THREE.Color(column.color));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
