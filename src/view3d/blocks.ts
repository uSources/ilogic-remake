/**
 * Modelos hechos de bloques, descritos como datos: cada bloque dice su tamaño, donde va su base y de
 * que se pinta. El color del equipo no va en el modelo ('team'): lo pone quien lo construye segun el
 * lado de su dueño, asi un mismo modelo vale para todos los equipos. Los bloques con `part` van juntos
 * en un grupo con ese nombre, para animarlos aparte (la torreta del tanque, la bandera).
 */
import * as THREE from 'three';
import { toonBox } from './toon';

/** De que se pinta un bloque: el color de su equipo (claro u oscuro) o un material fijo. */
export type BlockPaint =
  'team' | 'teamDark' | 'metal' | 'dark' | 'stone' | 'light' | 'wood' | 'leaf' | 'leafDark' | 'pine' | 'snow' | 'cactus' | 'petal';

export interface Block {
  /** Ancho (x), alto (y) y fondo (z), en casillas. */
  size: THREE.Vector3Tuple;
  /** Donde va el centro de su base: el modelo mira hacia +z y su suelo es y = 0. */
  at: THREE.Vector3Tuple;
  paint: BlockPaint;
  /** Grupo con nombre al que va (para animarlo): todos los de la misma parte giran juntos. */
  part?: string;
}

export interface BlockModel {
  blocks: readonly Block[];
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
  wood: 0x8a5a3a,
  leaf: 0x5cbf4a,
  leafDark: 0x3b8f3e,
  pine: 0x2f6b4f,
  snow: 0xf4f7fb,
  cactus: 0x6fb35a,
  petal: 0xff7aa8,
};

export const colorOf = (paint: BlockPaint, teamPaint: TeamPaint): THREE.ColorRepresentation =>
  paint === 'team' || paint === 'teamDark' ? teamPaint[paint] : FIXED_PAINT[paint];

function blockMesh(block: Block, teamPaint: TeamPaint): THREE.Mesh {
  const box = toonBox(block.size, colorOf(block.paint, teamPaint));
  const [x, y, z] = block.at;
  box.position.set(x, y + block.size[1] / 2, z);
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

/** El modelo hecho objeto 3D, pintado con los colores de ese equipo. */
export function buildModel(model: BlockModel, teamPaint: TeamPaint): THREE.Group {
  const root = new THREE.Group();
  for (const block of model.blocks) {
    const parent = block.part ? partGroup(root, block.part) : root;
    parent.add(blockMesh(block, teamPaint));
  }
  return root;
}
