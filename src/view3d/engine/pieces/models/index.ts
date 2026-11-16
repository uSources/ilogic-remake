/**
 * Que modelo de bloques lleva cada tipo de unidad y de edificio (units.ts y buildings.ts, por su id
 * de units.json y buildings.json). Uno nuevo es una entrada mas; un tipo sin entrada se ve con el
 * generico, asi cualquier contenido se puede mirar en 3D aunque aun no tenga modelo propio.
 */
import type { BlockModel } from '../blocks';
import { BUILDING_MODELS } from './buildings';
import { UNIT_MODELS } from './units';

const GENERIC_UNIT: BlockModel = { blocks: [{ size: [0.5, 0.4, 0.5], at: [0, 0, 0], paint: 'team' }] };
const GENERIC_BUILDING: BlockModel = {
  blocks: [
    { size: [0.9, 0.1, 0.9], at: [0, 0, 0], paint: 'stone' },
    { size: [0.6, 0.5, 0.6], at: [0, 0.1, 0], paint: 'light' },
    { size: [0.66, 0.08, 0.66], at: [0, 0.6, 0], paint: 'team' },
  ],
};

export const unitModelOf = (unitType: string): BlockModel => UNIT_MODELS[unitType] ?? GENERIC_UNIT;
export const buildingModelOf = (buildingType: string): BlockModel => BUILDING_MODELS[buildingType] ?? GENERIC_BUILDING;
