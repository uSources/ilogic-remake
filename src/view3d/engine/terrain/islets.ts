/**
 * Islotes en el mar, cerca del tablero: que el mapa parezca un trozo de un mundo de juguete y no lo
 * unico que hay. Cada islote es una sierra pequeña de la tierra del tema: se calcula con el mismo
 * relieve que las montañas del tablero (relief.ts, massif.ts), con su color por alturas, roca en las
 * laderas empinadas y manchas (reliefColors.ts). Siempre los mismos en cada partida. No son del mapa.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { toonVertexColored } from '../core/toon';
import { columnsOf, visibleFacesGeometry } from './columnFaces';
import { buildRelief } from './relief';
import type { ReliefMap, ReliefStyle } from './reliefGrid';

const ISLET_COUNT = 14;
/** A cuantas casillas del borde del tablero pueden estar (ni pegados ni perdidos en la niebla). */
const ISLET_DISTANCE = { near: 6, far: 34 } as const;
/** Radio de un islote (casillas). */
const ISLET_RADIUS = { small: 2, large: 4.5 } as const;
/** Altura de la playa (casillas): la base del islote, justo sobre el mar. */
const BEACH_TOP = 0.02;
/** Casillas de margen alrededor del islote, para que sus faldas caigan al mar sin salirse del mapa. */
const ISLET_MARGIN = 2;

/** Arena de la playa, tierra de encima y roca del pico, por tema (id de themes.json). */
interface IsletColors {
  beach: number;
  land: number;
  peak: number;
}

const GREEN_ISLET: IsletColors = { beach: 0xf2d38a, land: 0x6fae3c, peak: 0x8c8676 };
const ISLET_BY_THEME: Readonly<Record<string, IsletColors>> = {
  Forest: { beach: 0xe8c880, land: 0x4f8f34, peak: 0x8c8676 },
  Swamp: { beach: 0x8a7650, land: 0x58702e, peak: 0x6e6a58 },
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

/** Las casillas de un islote, con sus coordenadas desde su centro (un poco irregular, no un circulo). */
function isletFootprint({ radius }: Islet, random: () => number): Pos[] {
  const reach = Math.ceil(radius);
  const footprint: Pos[] = [];
  for (let dx = -reach; dx <= reach; dx++)
    for (let dy = -reach; dy <= reach; dy++) {
      const inside = 1 - Math.hypot(dx, dy) / radius + (random() - 0.5) * 0.3;
      if (inside > 0) footprint.push({ x: dx, y: dy });
    }
  return footprint;
}

/** El estilo de relieve de un islote: playa, tierra y roca como una montaña del tema. */
function isletStyle(colors: IsletColors): ReliefStyle {
  return {
    shape: 'peak',
    bands: [
      { from: 0, color: colors.beach },
      { from: 0.3, color: colors.land },
      { from: 1.3, color: colors.peak },
    ],
    cliff: colors.peak,
  };
}

/** El relieve de un islote, en su propia rejilla y movido a su sitio en el mar. */
function isletMesh(islet: Islet, style: ReliefStyle, random: () => number): THREE.InstancedMesh {
  const footprint = isletFootprint(islet, random);
  const reach = Math.ceil(islet.radius);
  const offset = reach + ISLET_MARGIN;
  const size = 2 * offset + 1;
  const map: ReliefMap = {
    width: size,
    height: size,
    tiles: footprint.map((pos) => ({ pos: { x: pos.x + offset, y: pos.y + offset }, style })),
    groundAt: () => BEACH_TOP,
    canSpill: () => true,
  };
  const view = buildRelief(map);
  view.mesh.position.set(islet.at.x - offset, 0, islet.at.y - offset);
  return view.mesh;
}

/** Un islote con solo las caras que se ven de sus columnas (y su color por vertice). */
function visibleIsletMesh(mesh: THREE.InstancedMesh): THREE.Mesh {
  const geometry = visibleFacesGeometry(columnsOf(mesh));
  // Solo su geometria: el material es el cartoon blanco que comparte con el relieve del tablero.
  mesh.geometry.dispose();
  const visible = new THREE.Mesh(geometry, toonVertexColored());
  visible.castShadow = true;
  visible.receiveShadow = true;
  return visible;
}

/** Los islotes, con la tierra del tema (id de themes.json): cada uno con solo sus caras visibles, para que la camara deje fuera los que no se ven. */
export function buildIslets(islets: readonly Islet[], theme: string): THREE.Group {
  const style = isletStyle(ISLET_BY_THEME[theme] ?? GREEN_ISLET);
  const random = seededRandom(13);
  const group = new THREE.Group();
  for (const islet of islets) group.add(visibleIsletMesh(isletMesh(islet, style, random)));
  return group;
}
