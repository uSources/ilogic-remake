import type { MovementMotion, TerrainType } from '../../core/content';

/**
 * Como se planta una unidad en su casilla segun el terreno (puro, con test en tests/terrainPose.test.ts):
 * en el agua se hunde un poco, en lo alto de un acantilado sube y lo que vuela no se ve afectado.
 */
export interface TerrainPose {
  /** Pixeles que sube el dibujo (en lo alto de un acantilado). */
  lift: number;
  /** Pixeles de abajo que quedan bajo el agua (se recortan y se pinta la linea del agua). */
  wade: number;
  /** El primer plano del terreno (copas, rocas) le tapa los pies. */
  showsFront: boolean;
}

/** En el agua: hundida lo justo para que se note sin tapar la cifra de vida. */
const WADE_PX = 5;
/** En lo alto de un acantilado. */
const LIFT_PX = 3;
/**
 * Terrenos de acantilado, por id (terrain.json): el arte nuevo esta dibujado para los terrenos del
 * juego y los nombra por su id, como las tablas de ui/terrainArt.ts.
 */
const CLIFFS: ReadonlySet<string> = new Set(['GrassCliff', 'SnowCliff', 'SandCliff']);

const FLYING: TerrainPose = { lift: 0, wade: 0, showsFront: false };

export function terrainPose(terrain: Pick<TerrainType, 'id' | 'isWater'>, motion: MovementMotion): TerrainPose {
  if (motion === 'fly') return FLYING;
  return {
    lift: CLIFFS.has(terrain.id) ? LIFT_PX : 0,
    wade: terrain.isWater ? WADE_PX : 0,
    showsFront: true,
  };
}
