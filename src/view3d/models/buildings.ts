/** Los edificios en bloques, por su id de buildings.json. Ocupan su casilla y miran hacia +z. */
import type { Block, BlockModel } from '../blocks';

/** El suelo de piedra de todos los edificios. */
const PLINTH: Block = { size: [0.92, 0.08, 0.92], at: [0, 0, 0], paint: 'stone' };

/** Una casita con su tejado del equipo. */
function house(x: number, z: number, width: number, height: number): Block[] {
  return [
    { size: [width, height, width], at: [x, 0.08, z], paint: 'light' },
    { size: [width + 0.06, 0.07, width + 0.06], at: [x, 0.08 + height, z], paint: 'team' },
    { size: [0.08, 0.1, 0.02], at: [x, 0.08, z + width / 2], paint: 'dark' },
  ];
}

const BASE: BlockModel = {
  blocks: [
    PLINTH,
    { size: [0.62, 0.42, 0.56], at: [0.04, 0.08, 0.06], paint: 'light' },
    { size: [0.7, 0.08, 0.64], at: [0.04, 0.5, 0.06], paint: 'team' },
    { size: [0.18, 0.22, 0.03], at: [0.04, 0.08, 0.35], paint: 'dark' },
    { size: [0.24, 0.66, 0.24], at: [-0.28, 0.08, -0.28], paint: 'light' },
    { size: [0.3, 0.1, 0.3], at: [-0.28, 0.74, -0.28], paint: 'team' },
    { size: [0.035, 0.42, 0.035], at: [-0.28, 0.84, -0.28], paint: 'metal' },
    { size: [0.24, 0.14, 0.03], at: [-0.15, 1.1, -0.28], paint: 'team', part: 'flag' },
  ],
};

const CITY: BlockModel = {
  blocks: [PLINTH, ...house(-0.2, -0.18, 0.34, 0.36), ...house(0.22, 0.12, 0.3, 0.24), ...house(-0.18, 0.24, 0.24, 0.18)],
};

const OIL: BlockModel = {
  blocks: [
    PLINTH,
    { size: [0.05, 0.62, 0.05], at: [-0.12, 0.08, -0.12], paint: 'metal' },
    { size: [0.05, 0.62, 0.05], at: [0.12, 0.08, -0.12], paint: 'metal' },
    { size: [0.3, 0.05, 0.05], at: [0, 0.7, -0.12], paint: 'metal' },
    { size: [0.46, 0.06, 0.06], at: [0, 0.56, 0.02], paint: 'dark', yaw: 0.2 },
    { size: [0.26, 0.24, 0.26], at: [0.22, 0.08, 0.22], paint: 'team' },
    { size: [0.16, 0.12, 0.16], at: [-0.24, 0.08, 0.24], paint: 'dark' },
  ],
};

const FACTORY: BlockModel = {
  blocks: [
    PLINTH,
    { size: [0.76, 0.32, 0.6], at: [0, 0.08, 0.06], paint: 'light' },
    { size: [0.78, 0.1, 0.2], at: [0, 0.4, -0.12], paint: 'team' },
    { size: [0.78, 0.1, 0.2], at: [0, 0.4, 0.12], paint: 'teamDark' },
    { size: [0.3, 0.2, 0.03], at: [0, 0.08, 0.37], paint: 'dark' },
    { size: [0.14, 0.62, 0.14], at: [0.28, 0.08, -0.32], paint: 'stone' },
    { size: [0.16, 0.06, 0.16], at: [0.28, 0.62, -0.32], paint: 'team' },
  ],
};

const STRONGHOLD: BlockModel = {
  blocks: [
    PLINTH,
    { size: [0.74, 0.36, 0.74], at: [0, 0.08, 0], paint: 'stone' },
    ...[-0.3, 0, 0.3].flatMap((x): Block[] => [
      { size: [0.12, 0.1, 0.12], at: [x, 0.44, -0.31], paint: 'stone' },
      { size: [0.12, 0.1, 0.12], at: [x, 0.44, 0.31], paint: 'stone' },
    ]),
    { size: [0.76, 0.05, 0.76], at: [0, 0.36, 0], paint: 'team' },
    { size: [0.035, 0.36, 0.035], at: [0, 0.44, 0], paint: 'metal' },
    { size: [0.22, 0.13, 0.03], at: [0.12, 0.66, 0], paint: 'team', part: 'flag' },
  ],
};

const AIRPORT: BlockModel = {
  blocks: [
    { size: [0.96, 0.06, 0.96], at: [0, 0, 0], paint: 'dark' },
    ...[-0.3, -0.05, 0.2].map((z): Block => ({ size: [0.06, 0.01, 0.14], at: [0.1, 0.06, z], paint: 'light' })),
    { size: [0.2, 0.5, 0.2], at: [-0.32, 0.06, -0.3], paint: 'light' },
    { size: [0.28, 0.12, 0.28], at: [-0.32, 0.56, -0.3], paint: 'glass' },
    { size: [0.3, 0.05, 0.3], at: [-0.32, 0.68, -0.3], paint: 'team' },
    { size: [0.3, 0.18, 0.3], at: [-0.32, 0.06, 0.28], paint: 'teamDark' },
  ],
};

export const BUILDING_MODELS: Readonly<Record<string, BlockModel>> = {
  Base: BASE,
  City: CITY,
  Oil: OIL,
  Factory: FACTORY,
  Stronghold: STRONGHOLD,
  Airport: AIRPORT,
};
