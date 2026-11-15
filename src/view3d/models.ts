/**
 * Que modelo de bloques lleva cada tipo de unidad y de edificio (por su id de units.json y
 * buildings.json). Uno nuevo es una entrada mas; un tipo sin entrada se ve con el generico, asi
 * cualquier contenido se puede mirar en 3D aunque aun no tenga modelo propio.
 */
import type { BlockModel } from './blocks';

const TANK: BlockModel = {
  blocks: [
    { size: [0.2, 0.2, 0.8], at: [-0.27, 0, 0], paint: 'dark' },
    { size: [0.2, 0.2, 0.8], at: [0.27, 0, 0], paint: 'dark' },
    { size: [0.56, 0.18, 0.72], at: [0, 0.1, 0], paint: 'team' },
    { size: [0.4, 0.06, 0.1], at: [0, 0.28, 0.3], paint: 'teamDark' },
    { size: [0.36, 0.18, 0.38], at: [0, 0.28, -0.04], paint: 'teamDark', part: 'turret' },
    { size: [0.08, 0.08, 0.46], at: [0, 0.33, 0.33], paint: 'metal', part: 'turret' },
    { size: [0.1, 0.06, 0.1], at: [-0.1, 0.46, -0.1], paint: 'metal', part: 'turret' },
  ],
};

const BASE: BlockModel = {
  blocks: [
    { size: [0.92, 0.1, 0.92], at: [0, 0, 0], paint: 'stone' },
    { size: [0.62, 0.42, 0.56], at: [0.04, 0.1, 0.06], paint: 'light' },
    { size: [0.7, 0.08, 0.64], at: [0.04, 0.52, 0.06], paint: 'team' },
    { size: [0.18, 0.22, 0.03], at: [0.04, 0.1, 0.35], paint: 'dark' },
    { size: [0.24, 0.66, 0.24], at: [-0.28, 0.1, -0.28], paint: 'light' },
    { size: [0.3, 0.1, 0.3], at: [-0.28, 0.76, -0.28], paint: 'team' },
    { size: [0.035, 0.42, 0.035], at: [-0.28, 0.86, -0.28], paint: 'metal' },
    { size: [0.24, 0.14, 0.03], at: [-0.15, 1.12, -0.28], paint: 'team', part: 'flag' },
  ],
};

/** Lo que no tiene modelo propio: una caja del color del equipo. */
const GENERIC_UNIT: BlockModel = { blocks: [{ size: [0.5, 0.4, 0.5], at: [0, 0, 0], paint: 'team' }] };
const GENERIC_BUILDING: BlockModel = {
  blocks: [
    { size: [0.9, 0.1, 0.9], at: [0, 0, 0], paint: 'stone' },
    { size: [0.6, 0.5, 0.6], at: [0, 0.1, 0], paint: 'light' },
    { size: [0.66, 0.08, 0.66], at: [0, 0.6, 0], paint: 'team' },
  ],
};

const UNIT_MODELS: Readonly<Record<string, BlockModel>> = { Tank: TANK };
const BUILDING_MODELS: Readonly<Record<string, BlockModel>> = { Base: BASE };

export const unitModelOf = (unitType: string): BlockModel => UNIT_MODELS[unitType] ?? GENERIC_UNIT;
export const buildingModelOf = (buildingType: string): BlockModel => BUILDING_MODELS[buildingType] ?? GENERIC_BUILDING;
