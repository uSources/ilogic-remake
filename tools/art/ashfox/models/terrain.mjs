// El terreno y su decorado para Ashfox, a semejanza del terreno 2D (public/assets/img/wang y flat):
// hierba lima con flores y borde de tierra, bosque de copas verde oscuro, agua azul con vetas, arena,
// nieve con grietas azules, montañas por capas y el decorado suelto (cactus, flores, muñeco de nieve).
// Medidas en unidades de Ashfox: 16 = una casilla. Las casillas van de -8 a 8 en x y z y su cara de
// arriba es el suelo; el decorado se apoya en y = 0 (encima de la casilla). Lo escribe generate.mjs.

/** Rampa de tres tonos (sombra, medio, luz) y, si lleva, sus manchas (patron blotch de Ashfox). */
export const PAINTS = {
  grass: { ramp: ['#4f9a2e', '#7cc63e', '#a8e05a'], blotch: { ramp: ['#3f8526', '#5fae34', '#8fd14f'], scale: [2, 2, 2], density: 0.18 } },
  earth: { ramp: ['#5a3420', '#8a5530', '#b47a45'], blotch: { ramp: ['#4a2a18', '#6e4228', '#8f5b36'], scale: [2, 1, 2], density: 0.2 } },
  forest_floor: {
    ramp: ['#2f6f24', '#468f2f', '#62ae3c'],
    blotch: { ramp: ['#255a1d', '#357a26', '#4e9630'], scale: [2, 2, 2], density: 0.25 },
  },
  sand: { ramp: ['#d99a3c', '#f2c262', '#ffe08e'], blotch: { ramp: ['#c4842e', '#dca24a', '#f0bd62'], scale: [3, 2, 3], density: 0.18 } },
  sandstone: {
    ramp: ['#9a5a2a', '#c47a3c', '#e29b55'],
    blotch: { ramp: ['#7e4620', '#a2602e', '#c47a3c'], scale: [4, 1, 4], density: 0.3 },
  },
  snow: { ramp: ['#bcd3ec', '#e6f0fb', '#ffffff'], blotch: { ramp: ['#9fc0e4', '#bcd6f0', '#d6e8f8'], scale: [3, 1, 3], density: 0.12 } },
  ice_rock: {
    ramp: ['#2c4c7c', '#4a72a8', '#7aa2d6'],
    blotch: { ramp: ['#203a62', '#36588a', '#56809e'], scale: [2, 2, 2], density: 0.2 },
  },
  water: { ramp: ['#1550b0', '#1f6fd8', '#3e94f0'], blotch: { ramp: ['#3e94f0', '#6ab4ff', '#9ad0ff'], scale: [5, 1, 1], density: 0.12 } },
  deep: { ramp: ['#0b3480', '#1048a6', '#1c5ec4'], blotch: { ramp: ['#1c5ec4', '#2a72d8', '#3e88ea'], scale: [5, 1, 1], density: 0.1 } },
  shallow: {
    ramp: ['#58c6c0', '#8ee0d6', '#c6f4ea'],
    blotch: { ramp: ['#e8d6a0', '#f4e4b4', '#fff2cc'], scale: [4, 2, 4], density: 0.25 },
  },
  ice: { ramp: ['#9ad6ee', '#cdeffa', '#f2fcff'], blotch: { ramp: ['#6fb8dc', '#86c8e6', '#a8dcf0'], scale: [4, 1, 1], density: 0.12 } },
  leaf: { ramp: ['#25661f', '#3c8f2e', '#62bd44'], blotch: { ramp: ['#4fae3a', '#78d055', '#a2e670'], scale: [2, 2, 2], density: 0.25 } },
  trunk: { ramp: ['#4a2c18', '#6e4224', '#8e5a32'] },
  pine: { ramp: ['#1d3f6e', '#2e5a96', '#4a7cc0'], blotch: { ramp: ['#3e6eb0', '#5e8ed0', '#8ab0ea'], scale: [2, 1, 2], density: 0.25 } },
  snowcap: { ramp: ['#d6e6f6', '#f0f6ff', '#ffffff'] },
  rock: { ramp: ['#454a55', '#676e7b', '#8f97a5'], blotch: { ramp: ['#3d7a2a', '#5a9e38', '#7cc24a'], scale: [4, 1, 4], density: 0.22 } },
  mesa: { ramp: ['#a8501e', '#d0712c', '#ee9a48'], blotch: { ramp: ['#8a3e16', '#b05a22', '#d07434'], scale: [6, 1, 6], density: 0.3 } },
  mesa_light: { ramp: ['#d0782e', '#eea050', '#ffc46e'] },
  snowrock: {
    ramp: ['#55657e', '#7a8ca8', '#a6b6cc'],
    blotch: { ramp: ['#cfdef0', '#e6f0fa', '#ffffff'], scale: [3, 2, 3], density: 0.3 },
  },
  cactus: { ramp: ['#2f7a34', '#45a046', '#6cc860'], blotch: { ramp: ['#2a6a2e', '#3a8a3c', '#58b052'], scale: [1, 3, 1], density: 0.3 } },
  petal_red: { ramp: ['#b02030', '#e83a48', '#ff7a80'] },
  petal_yellow: { ramp: ['#c89a10', '#f2c81e', '#ffe866'] },
  petal_purple: { ramp: ['#6a2a9a', '#9a46d0', '#c48af0'] },
  hat: { ramp: ['#141824', '#262c3c', '#3c4458'] },
  scarf: { ramp: ['#9a1c22', '#d8323a', '#ff6a62'] },
  carrot: { ramp: ['#c85a10', '#ee7a20', '#ff9a40'] },
};

/** Puntitos de flores en la hierba (como las del 2D). */
const MEADOW_DOTS = {
  name: 'meadow',
  face: 'up',
  pixels: 'y...r/.....',
  colors: { y: '#ffe866', r: '#ff6a62' },
  at: [
    [2, 3],
    [9, 11],
    [10, 2],
    [4, 12],
  ],
};
const EYES = { name: 'eyes', face: 'north', pixels: 'k..k', colors: { k: '#141824' }, at: [[0, 1]] };

/** Una casilla de tierra: el bloque de abajo (sus lados se ven en las orillas) y la capa de arriba. */
function land(top, side, stamps = []) {
  return {
    cubes: [
      { name: 'base', origin: [-8, -8, -8], size: [16, 10, 16], paint: side },
      { name: 'top', origin: [-8, 2, -8], size: [16, 2, 16], paint: top, stamps },
    ],
  };
}

/** Una casilla de agua (o hielo): un solo bloque, mas bajo que la tierra. */
const liquid = (paint, top) => ({ cubes: [{ name: 'water', origin: [-8, -8, -8], size: [16, 8 + top, 16], paint }] });

/** Un arbol (o pino) en (x, z): tronco y copas apiladas, de mas ancha a mas estrecha. */
function tree(id, [x, z], crowns, crownPaint, capPaint) {
  const cubes = [{ name: `${id}_trunk`, origin: [x - 1, 0, z - 1], size: [2, 3, 2], paint: 'trunk' }];
  let y = 2;
  crowns.forEach(([width, height], index) => {
    const isCap = capPaint && index === crowns.length - 1;
    cubes.push({
      name: `${id}_crown${index}`,
      origin: [x - width / 2, y, z - width / 2],
      size: [width, height, width],
      paint: isCap ? capPaint : crownPaint,
      phase: index * 13 + Math.abs(x),
    });
    y += height;
  });
  return cubes;
}

/** Una montaña por capas centrada en la casilla. */
function mountain(layers) {
  let y = 0;
  return {
    cubes: layers.map(([width, height, paint], index) => {
      const cube = { name: `layer${index}`, origin: [-width / 2, y, -width / 2], size: [width, height, width], paint, phase: index * 31 };
      y += height;
      return cube;
    }),
  };
}

/** Una mata de flores en (x, z): hojas y unos petalos encima. */
function bush(id, [x, z], petal) {
  const petals = [
    [x - 2, z - 2],
    [x + 1, z - 1],
    [x - 1, z + 1],
    [x + 1, z + 1],
  ];
  return [
    { name: `${id}_leaves`, origin: [x - 3, 0, z - 3], size: [6, 2, 6], paint: 'leaf' },
    ...petals.map(([px, pz], index) => ({ name: `${id}_petal${index}`, origin: [px, 2, pz], size: [1, 1, 1], paint: petal })),
  ];
}

const flowers = (petal) => ({ cubes: [...bush('a', [-3, -2], petal), ...bush('b', [3, 3], petal)] });

export const MODELS = {
  tile_grass: land('grass', 'earth', [MEADOW_DOTS]),
  tile_forest: land('forest_floor', 'earth'),
  tile_sand: land('sand', 'sandstone'),
  tile_snow: land('snow', 'ice_rock'),
  tile_water: liquid('water', 1),
  tile_deep: liquid('deep', 0),
  tile_shallow: liquid('shallow', 2),
  tile_ice: liquid('ice', 2),
  trees: {
    cubes: [
      ...tree(
        'a',
        [-4, -3],
        [
          [7, 4],
          [5, 3],
        ],
        'leaf',
      ),
      ...tree(
        'b',
        [4, -2],
        [
          [6, 4],
          [4, 3],
        ],
        'leaf',
      ),
      ...tree(
        'c',
        [0, 4],
        [
          [8, 5],
          [5, 3],
        ],
        'leaf',
      ),
    ],
  },
  pines: {
    cubes: [
      ...tree(
        'a',
        [-4, -3],
        [
          [8, 3],
          [6, 3],
          [4, 3],
          [2, 2],
        ],
        'pine',
        'snowcap',
      ),
      ...tree(
        'b',
        [4, 3],
        [
          [7, 3],
          [5, 3],
          [3, 3],
          [2, 2],
        ],
        'pine',
        'snowcap',
      ),
    ],
  },
  mount_grass: mountain([
    [14, 5, 'rock'],
    [10, 5, 'rock'],
    [6, 4, 'rock'],
    [3, 2, 'snowcap'],
  ]),
  mount_mesa: mountain([
    [15, 4, 'mesa'],
    [13, 4, 'mesa_light'],
    [11, 4, 'mesa'],
  ]),
  mount_snow: mountain([
    [14, 5, 'snowrock'],
    [10, 5, 'snowrock'],
    [6, 4, 'snowcap'],
    [3, 2, 'snowcap'],
  ]),
  cactus: {
    cubes: [
      { name: 'trunk', origin: [-3, 0, -2], size: [2, 10, 2], paint: 'cactus' },
      { name: 'arm_left', origin: [-5, 4, -2], size: [2, 2, 2], paint: 'cactus' },
      { name: 'arm_left_up', origin: [-5, 6, -2], size: [2, 3, 2], paint: 'cactus' },
      { name: 'arm_right', origin: [-1, 5, -2], size: [2, 2, 2], paint: 'cactus' },
      { name: 'arm_right_up', origin: [-1, 7, -2], size: [2, 2, 2], paint: 'cactus' },
      { name: 'round', origin: [2, 0, 1], size: [4, 3, 4], paint: 'cactus' },
      { name: 'bloom', origin: [3, 3, 2], size: [2, 1, 2], paint: 'petal_red' },
    ],
  },
  flowers_red: flowers('petal_red'),
  flowers_yellow: flowers('petal_yellow'),
  flowers_purple: flowers('petal_purple'),
  snowman: {
    cubes: [
      { name: 'body', origin: [-3, 0, -3], size: [6, 5, 6], paint: 'snowcap' },
      { name: 'head', origin: [-2, 5, -2], size: [4, 4, 4], paint: 'snowcap', stamps: [EYES] },
      { name: 'scarf', origin: [-2.5, 4.5, -2.5], size: [5, 1, 5], paint: 'scarf' },
      { name: 'nose', origin: [-0.5, 6.5, -3], size: [1, 1, 1], paint: 'carrot' },
      { name: 'brim', origin: [-2.5, 9, -2.5], size: [5, 1, 5], paint: 'hat' },
      { name: 'hat', origin: [-1.5, 10, -1.5], size: [3, 3, 3], paint: 'hat' },
    ],
  },
};
