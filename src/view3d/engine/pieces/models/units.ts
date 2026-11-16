/**
 * Las unidades en bloques, por su id de units.json. Miran hacia +z; los aviones vuelan (`hover`). Las
 * partes con nombre se animan aparte: 'turret' gira hacia a quien dispara, 'rotor' da vueltas.
 */
import type { BlockModel } from '../blocks';
import { crate, lifted, tracks, trooper, wheels } from './parts';

/** Inclinaciones con nombre (radianes): un cañon de artilleria y unos misiles que apuntan al cielo. */
const RAISED = 0.55;
const STEEP = 0.9;
/** Altura de vuelo: la sombra en el suelo dice en que casilla esta. */
const FLYING = 0.75;

const SOLDIER: BlockModel = { blocks: [...trooper([-0.16, 0.08]), ...trooper([0.16, 0.08]), ...trooper([0, -0.16])] };
const BAZOOKA: BlockModel = { blocks: [...trooper([-0.14, 0], 'bazooka'), ...trooper([0.16, -0.06], 'bazooka')] };
const SHIELD: BlockModel = { blocks: [...trooper([-0.14, 0.04], 'shield'), ...trooper([0.16, -0.04], 'shield')] };
const MORTAR: BlockModel = {
  blocks: [
    ...trooper([-0.18, -0.06], 'none'),
    ...trooper([0.2, -0.1], 'none'),
    { size: [0.22, 0.03, 0.22], at: [0, 0, 0.12], paint: 'dark' },
    { size: [0.08, 0.26, 0.08], at: [0, 0.02, 0.12], paint: 'metal', pitch: -0.4 },
  ],
};
const BIKER: BlockModel = {
  blocks: [
    { size: [0.06, 0.2, 0.2], at: [0, 0, -0.22], paint: 'dark' },
    { size: [0.06, 0.2, 0.2], at: [0, 0, 0.22], paint: 'dark' },
    { size: [0.14, 0.1, 0.42], at: [0, 0.12, 0], paint: 'team' },
    { size: [0.16, 0.04, 0.04], at: [0, 0.26, 0.18], paint: 'metal' },
    ...lifted(trooper([0, -0.04], 'none'), 0.2),
  ],
};

const TANK: BlockModel = {
  blocks: [
    ...tracks(0.74, 0.8, 0.2),
    { size: [0.56, 0.18, 0.72], at: [0, 0.1, 0], paint: 'team' },
    { size: [0.4, 0.06, 0.1], at: [0, 0.28, 0.3], paint: 'teamDark' },
    { size: [0.36, 0.18, 0.38], at: [0, 0.28, -0.04], paint: 'teamDark', part: 'turret' },
    { size: [0.08, 0.08, 0.46], at: [0, 0.33, 0.33], paint: 'metal', part: 'turret' },
    { size: [0.1, 0.06, 0.1], at: [-0.1, 0.46, -0.1], paint: 'metal', part: 'turret' },
  ],
};
const LIGHT_TANK: BlockModel = {
  blocks: [
    ...tracks(0.58, 0.66, 0.16),
    { size: [0.42, 0.14, 0.6], at: [0, 0.08, 0], paint: 'team' },
    { size: [0.26, 0.13, 0.28], at: [0, 0.22, -0.04], paint: 'teamDark', part: 'turret' },
    { size: [0.06, 0.06, 0.32], at: [0, 0.26, 0.24], paint: 'metal', part: 'turret' },
  ],
};
const AMPHIBIOUS_TANK: BlockModel = {
  blocks: [
    { size: [0.7, 0.16, 0.86], at: [0, 0, 0], paint: 'teamDark' },
    { size: [0.5, 0.06, 0.12], at: [0, 0.04, 0.46], paint: 'teamDark' },
    { size: [0.58, 0.14, 0.64], at: [0, 0.16, -0.04], paint: 'team' },
    { size: [0.32, 0.16, 0.34], at: [0, 0.3, -0.06], paint: 'light', part: 'turret' },
    { size: [0.07, 0.07, 0.42], at: [0, 0.35, 0.28], paint: 'metal', part: 'turret' },
  ],
};
const ARTILLERY: BlockModel = {
  blocks: [
    ...tracks(0.64, 0.72),
    { size: [0.48, 0.14, 0.66], at: [0, 0.08, 0], paint: 'team' },
    { size: [0.3, 0.16, 0.3], at: [0, 0.22, -0.1], paint: 'teamDark', part: 'turret' },
    { size: [0.09, 0.09, 0.6], at: [0, 0.32, 0.18], paint: 'metal', pitch: RAISED, part: 'turret' },
  ],
};
const MISSILE_TRUCK: BlockModel = {
  blocks: [
    ...wheels(0.5, 0.8, 0.18),
    { size: [0.46, 0.08, 0.84], at: [0, 0.1, 0], paint: 'dark' },
    { size: [0.42, 0.2, 0.22], at: [0, 0.18, 0.3], paint: 'team' },
    { size: [0.36, 0.06, 0.04], at: [0, 0.3, 0.42], paint: 'glass' },
    { size: [0.4, 0.08, 0.46], at: [0, 0.18, -0.12], paint: 'teamDark', part: 'turret' },
    { size: [0.1, 0.1, 0.5], at: [-0.1, 0.36, -0.1], paint: 'light', pitch: STEEP, part: 'turret' },
    { size: [0.1, 0.1, 0.5], at: [0.1, 0.36, -0.1], paint: 'light', pitch: STEEP, part: 'turret' },
  ],
};
const ANTIAIR: BlockModel = {
  blocks: [
    ...tracks(0.64, 0.7),
    { size: [0.48, 0.14, 0.64], at: [0, 0.08, 0], paint: 'team' },
    { size: [0.34, 0.14, 0.3], at: [0, 0.22, -0.04], paint: 'teamDark', part: 'turret' },
    { size: [0.05, 0.05, 0.42], at: [-0.08, 0.36, 0.12], paint: 'metal', pitch: STEEP, part: 'turret' },
    { size: [0.05, 0.05, 0.42], at: [0.08, 0.36, 0.12], paint: 'metal', pitch: STEEP, part: 'turret' },
  ],
};
const JEEP: BlockModel = {
  blocks: [
    ...wheels(0.44, 0.66, 0.16),
    { size: [0.4, 0.14, 0.66], at: [0, 0.08, 0], paint: 'team' },
    { size: [0.36, 0.1, 0.04], at: [0, 0.22, 0.1], paint: 'glass' },
    { size: [0.04, 0.12, 0.04], at: [0, 0.22, -0.16], paint: 'dark', part: 'turret' },
    { size: [0.04, 0.04, 0.24], at: [0, 0.32, -0.08], paint: 'metal', part: 'turret' },
  ],
};
const TRANSPORT: BlockModel = {
  blocks: [
    ...wheels(0.5, 0.86, 0.18),
    { size: [0.46, 0.22, 0.24], at: [0, 0.1, 0.32], paint: 'team' },
    { size: [0.38, 0.06, 0.04], at: [0, 0.24, 0.44], paint: 'glass' },
    { size: [0.5, 0.32, 0.56], at: [0, 0.1, -0.12], paint: 'teamDark' },
    { size: [0.52, 0.04, 0.58], at: [0, 0.42, -0.12], paint: 'light' },
  ],
};
const SUPPLIER: BlockModel = {
  blocks: [
    ...wheels(0.5, 0.82, 0.18),
    { size: [0.46, 0.22, 0.24], at: [0, 0.1, 0.3], paint: 'team' },
    { size: [0.38, 0.06, 0.04], at: [0, 0.24, 0.42], paint: 'glass' },
    { size: [0.5, 0.06, 0.5], at: [0, 0.1, -0.12], paint: 'teamDark' },
    crate([-0.11, -0.02], 0.16, 0.18),
    crate([0.11, -0.2], 0.16, 0.18),
    crate([-0.1, -0.22], 0.16, 0.16, 'light'),
    crate([0.04, -0.1], 0.34, 0.14),
  ],
};
const BARRICADE: BlockModel = {
  blocks: [
    { size: [0.86, 0.22, 0.3], at: [0, 0, 0], paint: 'stone' },
    { size: [0.26, 0.16, 0.26], at: [-0.28, 0.22, 0], paint: 'stone' },
    { size: [0.26, 0.16, 0.26], at: [0.28, 0.22, 0], paint: 'stone' },
    { size: [0.88, 0.05, 0.32], at: [0, 0.12, 0], paint: 'team' },
  ],
};

const LIGHT_FIGHTER: BlockModel = {
  hover: FLYING,
  blocks: [
    { size: [0.16, 0.12, 0.62], at: [0, 0, 0], paint: 'team' },
    { size: [0.7, 0.04, 0.22], at: [0, 0.04, -0.02], paint: 'teamDark' },
    { size: [0.04, 0.16, 0.14], at: [0, 0.1, -0.24], paint: 'teamDark' },
    { size: [0.1, 0.06, 0.14], at: [0, 0.12, 0.12], paint: 'glass' },
  ],
};
const FIGHTER: BlockModel = {
  hover: FLYING,
  blocks: [
    { size: [0.2, 0.14, 0.8], at: [0, 0, 0], paint: 'team' },
    { size: [0.86, 0.04, 0.28], at: [0, 0.04, -0.06], paint: 'teamDark' },
    { size: [0.04, 0.18, 0.16], at: [-0.08, 0.12, -0.32], paint: 'teamDark' },
    { size: [0.04, 0.18, 0.16], at: [0.08, 0.12, -0.32], paint: 'teamDark' },
    { size: [0.34, 0.03, 0.12], at: [0, 0.06, -0.34], paint: 'teamDark' },
    { size: [0.12, 0.07, 0.18], at: [0, 0.14, 0.16], paint: 'glass' },
  ],
};
const BOMBER: BlockModel = {
  hover: FLYING,
  blocks: [
    { size: [0.26, 0.2, 0.84], at: [0, 0, 0], paint: 'team' },
    { size: [0.96, 0.05, 0.26], at: [0, 0.08, 0.02], paint: 'teamDark' },
    { size: [0.1, 0.1, 0.18], at: [-0.28, 0.0, 0.06], paint: 'dark' },
    { size: [0.1, 0.1, 0.18], at: [0.28, 0.0, 0.06], paint: 'dark' },
    { size: [0.4, 0.04, 0.14], at: [0, 0.12, -0.36], paint: 'teamDark' },
    { size: [0.04, 0.2, 0.14], at: [0, 0.16, -0.36], paint: 'teamDark' },
    { size: [0.16, 0.06, 0.14], at: [0, 0.2, 0.28], paint: 'glass' },
  ],
};
const HELICOPTER: BlockModel = {
  hover: FLYING * 0.8,
  blocks: [
    { size: [0.3, 0.24, 0.42], at: [0, 0, 0.06], paint: 'team' },
    { size: [0.26, 0.12, 0.08], at: [0, 0.08, 0.28], paint: 'glass' },
    { size: [0.08, 0.08, 0.44], at: [0, 0.12, -0.34], paint: 'teamDark' },
    { size: [0.03, 0.14, 0.1], at: [0, 0.14, -0.54], paint: 'teamDark' },
    { size: [0.04, 0.05, 0.4], at: [-0.13, -0.08, 0.06], paint: 'dark' },
    { size: [0.04, 0.05, 0.4], at: [0.13, -0.08, 0.06], paint: 'dark' },
    { size: [0.04, 0.06, 0.04], at: [0, 0.24, 0.06], paint: 'metal' },
    { size: [0.9, 0.02, 0.06], at: [0, 0.3, 0.06], paint: 'dark', part: 'rotor' },
    { size: [0.06, 0.02, 0.9], at: [0, 0.3, 0.06], paint: 'dark', part: 'rotor' },
  ],
};

export const UNIT_MODELS: Readonly<Record<string, BlockModel>> = {
  Soldier: SOLDIER,
  BSoldier: BAZOOKA,
  SSoldier: SHIELD,
  MSoldier: MORTAR,
  FSoldier: BIKER,
  Tank: TANK,
  LTank: LIGHT_TANK,
  WTank: AMPHIBIOUS_TANK,
  Artillery: ARTILLERY,
  Missile_truck: MISSILE_TRUCK,
  Antiair: ANTIAIR,
  Car: JEEP,
  Transport: TRANSPORT,
  Supplier: SUPPLIER,
  Blocker: BARRICADE,
  LFighter: LIGHT_FIGHTER,
  Fighter: FIGHTER,
  Bomber: BOMBER,
  THelicopter: HELICOPTER,
};
