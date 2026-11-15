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
  stem: { ramp: ['#2f7a2a', '#3f9a34', '#5cbf4a'] },
  flower_center: { ramp: ['#c89a10', '#f2c81e', '#ffe866'] },
  petal_white: { ramp: ['#c8ccd8', '#eef2fa', '#ffffff'] },
  petal_pink: { ramp: ['#b8487a', '#ee6aa0', '#ffa0c8'] },
  carrot: { ramp: ['#c85a10', '#ee7a20', '#ff9a40'] },
};

/**
 * Detalles de pixel que salpican la cara de arriba de cada suelo (como en el 2D): cada uno es un
 * «stamp» de Ashfox. Cada variante de un suelo los reparte en otros sitios (con su semilla), asi las
 * casillas no se ven todas iguales.
 */
const GROUND_DETAILS = {
  grass: [
    { name: 'tuft', pixels: 'd.d/.d.', colors: { d: '#3f8526' }, weight: 4 },
    { name: 'daisy', pixels: '.w./wyw/.w.', colors: { w: '#f2f5ff', y: '#ffd447' }, weight: 2 },
    { name: 'poppy', pixels: 'r', colors: { r: '#ff5a50' }, weight: 2 },
    { name: 'buttercup', pixels: 'y', colors: { y: '#ffe866' }, weight: 3 },
    { name: 'clearing', pixels: 'll./lll', colors: { l: '#a8e05a' }, weight: 2 },
  ],
  sand: [
    { name: 'ripple', pixels: 'ddddd', colors: { d: '#d29540' }, weight: 4 },
    { name: 'dune', pixels: '..ddd/dd...', colors: { d: '#d29540' }, weight: 3 },
    { name: 'shine', pixels: 'll', colors: { l: '#ffeab0' }, weight: 3 },
    { name: 'pebble', pixels: 'pq', colors: { p: '#8a7a66', q: '#b8a68c' }, weight: 2 },
  ],
  snow: [
    { name: 'crack', pixels: 'c.../.cc./...c', colors: { c: '#9fc0e4' }, weight: 3 },
    { name: 'drift', pixels: 'bbb', colors: { b: '#d6e6f6' }, weight: 4 },
    { name: 'sparkle', pixels: 's', colors: { s: '#bcd6f0' }, weight: 3 },
  ],
  forest_floor: [
    { name: 'leaves', pixels: 'o.y/.o.', colors: { o: '#b06a2a', y: '#c8a030' }, weight: 3 },
    { name: 'moss', pixels: 'mm/m.', colors: { m: '#2a6420' }, weight: 4 },
    { name: 'mushroom', pixels: 'rw', colors: { r: '#e8323a', w: '#fff2e0' }, weight: 1 },
  ],
};
/** Cuantos detalles lleva una casilla de cada suelo. */
const DETAILS_PER_TILE = { grass: 9, sand: 7, snow: 6, forest_floor: 8 };

/** Azar con semilla (mulberry32): la misma variante sale siempre igual. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const stampSize = (pixels) => {
  const rows = pixels.split('/');
  return [rows[0].length, rows.length];
};

/** Los detalles de una variante: de cada clase, en que sitios de la cara de arriba (16 x 16) va. */
function groundStamps(ground, seed) {
  const random = seeded(seed);
  const details = GROUND_DETAILS[ground];
  const bag = details.flatMap((detail) => Array.from({ length: detail.weight }, () => detail));
  const spots = new Map(details.map((detail) => [detail.name, []]));
  for (let count = 0; count < DETAILS_PER_TILE[ground]; count++) {
    const detail = bag[Math.floor(random() * bag.length)];
    const [width, height] = stampSize(detail.pixels);
    spots.get(detail.name).push([Math.floor(random() * (17 - width)), Math.floor(random() * (17 - height))]);
  }
  return details
    .filter((detail) => spots.get(detail.name).length > 0)
    .map(({ name, pixels, colors }) => ({ name, face: 'up', pixels, colors, at: spots.get(name) }));
}

/** Las variantes de un suelo: `tile_<nombre>_<n>`, cada una con sus detalles y sus manchas en otro sitio. */
function groundVariants(name, ground, side, count) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `tile_${name}_${index}`,
      land(ground, side, groundStamps(ground, 101 + index * 37), index * 17 + 3),
    ]),
  );
}

const EYES = { name: 'eyes', face: 'north', pixels: 'k..k', colors: { k: '#141824' }, at: [[0, 1]] };

/** Una casilla de tierra: el bloque de abajo (sus lados se ven en las orillas) y la capa de arriba. */
function land(top, side, stamps = [], phase = 7) {
  return {
    cubes: [
      { name: 'base', origin: [-8, -8, -8], size: [16, 10, 16], paint: side, phase },
      { name: 'top', origin: [-8, 2, -8], size: [16, 2, 16], paint: top, stamps, phase },
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

/**
 * Una flor en (x, z): tallo y, arriba, cuatro petalos en cruz alrededor del centro amarillo (vista
 * desde arriba, una flor de pixel como las del 2D).
 */
function flower(id, [x, z], height, petal) {
  const top = height;
  const petals = [
    [x - 1, z],
    [x + 1, z],
    [x, z - 1],
    [x, z + 1],
  ];
  return [
    { name: `${id}_stem`, origin: [x, 0, z], size: [1, height, 1], paint: 'stem' },
    { name: `${id}_center`, origin: [x, top, z], size: [1, 1, 1], paint: 'flower_center' },
    ...petals.map(([px, pz], index) => ({ name: `${id}_petal${index}`, origin: [px, top, pz], size: [1, 1, 1], paint: petal })),
  ];
}

/** Una mata baja de hojas en (x, z). */
const leaves = (id, [x, z], width) => ({
  name: `${id}_leaves`,
  origin: [x - width / 2, 0, z - width / 2],
  size: [width, 1, width],
  paint: 'leaf',
});

/** Separacion minima entre flores (en las dos direcciones): si no, sus petalos se tapan. */
const FLOWER_SPACING = 3;

/** Hasta `count` sitios de `spot()` separados al menos `spacing` entre si (los que no caben se dejan). */
function spreadSpots(spot, count, spacing) {
  const chosen = [];
  for (let tries = 0; tries < count * 20 && chosen.length < count; tries++) {
    const [x, z] = spot();
    if (chosen.every(([cx, cz]) => Math.max(Math.abs(cx - x), Math.abs(cz - z)) >= spacing)) chosen.push([x, z]);
  }
  return chosen;
}

/** Un macizo de flores: unas matas de hojas y flores de distintas alturas repartidas (con su semilla). */
function flowerPatch(petals, seed) {
  const random = seeded(seed);
  const spot = () => [Math.floor(random() * 11) - 5, Math.floor(random() * 11) - 5];
  const clumps = [leaves('a', spot(), 4), leaves('b', spot(), 3), leaves('c', spot(), 3)];
  const blooms = spreadSpots(spot, 6, FLOWER_SPACING).map((at, index) =>
    flower(`f${index}`, at, 2 + Math.floor(random() * 3), petals[index % petals.length]),
  );
  return { cubes: [...clumps, ...blooms.flat()] };
}

export const MODELS = {
  ...groundVariants('grass', 'grass', 'earth', 4),
  ...groundVariants('forest', 'forest_floor', 'earth', 3),
  // La cara de arriba de la arena la dibuja un shader en el juego (src/view3d/sand.ts): basta una.
  ...groundVariants('sand', 'sand', 'sandstone', 1),
  ...groundVariants('snow', 'snow', 'ice_rock', 3),
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
  flowers_red: flowerPatch(['petal_red', 'petal_red', 'petal_white'], 11),
  flowers_yellow: flowerPatch(['petal_yellow', 'petal_yellow', 'petal_white'], 23),
  flowers_purple: flowerPatch(['petal_purple', 'petal_pink'], 37),
  flowers_mixed: flowerPatch(['petal_red', 'petal_yellow', 'petal_purple', 'petal_white', 'petal_pink'], 53),
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
