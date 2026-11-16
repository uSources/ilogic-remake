/**
 * Modelos hechos de bloques, descritos como datos: cada bloque dice su tamaño, donde va su base, de
 * que se pinta y, si va inclinado, cuanto. El color del equipo no va en el modelo ('team'): lo pone
 * quien lo construye segun el lado de su dueño, asi un mismo modelo vale para todos los equipos. Los
 * bloques con `part` van juntos en un grupo con ese nombre, para animarlos aparte (la torreta del
 * tanque, el rotor del helicoptero).
 */
import * as THREE from 'three';
import { toonBox } from '../core/toon';

/** De que se pinta un bloque: el color de su equipo (claro u oscuro) o un material fijo. */
export type BlockPaint =
  | 'team'
  | 'teamDark'
  | 'metal'
  | 'dark'
  | 'stone'
  | 'light'
  | 'skin'
  | 'wood'
  | 'glass'
  | 'leaf'
  | 'leafDark'
  | 'pine'
  | 'snow'
  | 'cactus'
  | 'petal';

export interface Block {
  /** Ancho (x), alto (y) y fondo (z), en casillas. */
  size: THREE.Vector3Tuple;
  /** Donde va el centro de su base: el modelo mira hacia +z y su suelo es y = 0. */
  at: THREE.Vector3Tuple;
  paint: BlockPaint;
  /** Inclinacion hacia arriba (radianes, girando sobre su centro): un cañon que apunta al cielo. */
  pitch?: number;
  /** Giro sobre el eje vertical (radianes). */
  yaw?: number;
  /** Grupo con nombre al que va (para animarlo): todos los de la misma parte giran juntos. */
  part?: string;
}

export interface BlockModel {
  blocks: readonly Block[];
  /** A que altura va sobre el suelo (los aviones vuelan); sin poner, en el suelo. */
  hover?: number;
}

/** Los colores de un equipo en 3D. */
export interface TeamPaint {
  team: THREE.ColorRepresentation;
  teamDark: THREE.ColorRepresentation;
}

/** Los materiales fijos (lo que no es del equipo). */
const FIXED_PAINT: Readonly<Record<Exclude<BlockPaint, keyof TeamPaint>, number>> = {
  metal: 0x8a93a6,
  dark: 0x2b3142,
  stone: 0xb9b2a0,
  light: 0xe9e4d4,
  skin: 0xf1c79b,
  wood: 0x8a5a3a,
  glass: 0x9fe3ff,
  leaf: 0x5cbf4a,
  leafDark: 0x3b8f3e,
  pine: 0x2f6b4f,
  snow: 0xf4f7fb,
  cactus: 0x6fb35a,
  petal: 0xff7aa8,
};

export const colorOf = (paint: BlockPaint, teamPaint: TeamPaint): THREE.ColorRepresentation =>
  paint === 'team' || paint === 'teamDark' ? teamPaint[paint] : FIXED_PAINT[paint];

/** Donde va el bloque dentro del modelo: su centro (la base en `at`) y su giro. */
export function blockMatrix(block: Block): THREE.Matrix4 {
  const [x, y, z] = block.at;
  const center = new THREE.Vector3(x, y + block.size[1] / 2, z);
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(block.pitch ?? 0), block.yaw ?? 0, 0, 'YXZ'));
  return new THREE.Matrix4().compose(center, turn, new THREE.Vector3(1, 1, 1));
}

function blockMesh(block: Block, teamPaint: TeamPaint): THREE.Mesh {
  const box = toonBox(block.size, colorOf(block.paint, teamPaint));
  blockMatrix(block).decompose(box.position, box.quaternion, box.scale);
  return box;
}

/** El grupo de una parte (lo crea la primera vez que se pide). */
function partGroup(model: THREE.Group, name: string): THREE.Group {
  const existing = model.children.find((child): child is THREE.Group => child instanceof THREE.Group && child.name === name);
  if (existing) return existing;
  const part = new THREE.Group();
  part.name = name;
  model.add(part);
  return part;
}

/** El modelo hecho objeto 3D, pintado con los colores de ese equipo (los bloques, dentro de un grupo a su altura de vuelo). */
export function buildModel(model: BlockModel, teamPaint: TeamPaint): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = model.hover ?? 0;
  root.add(body);
  for (const block of model.blocks) {
    const parent = block.part ? partGroup(body, block.part) : body;
    parent.add(blockMesh(block, teamPaint));
  }
  return root;
}
