// El terreno y su decorado para Ashfox, a semejanza del terreno 2D (public/assets/img/wang):
// hierba lima con flores y borde de tierra, bosque de copas verde oscuro, agua azul con vetas, nieve
// con grietas azules y el decorado suelto (cactus, flores, muñeco de nieve). El pantano tiene lo suyo
// (al final): suelo oliva con charcos, agua turbia, cipreses con musgo colgando, nenufares, juncos y
// ranas. Las montañas y la arena no son modelos: son relieve que dibuja el juego
// (src/view3d/engine/terrain/relief.ts).
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
  // El pantano: verdes oliva y apagados, barro y agua turbia (el bosque es verde vivo y el agua, azul).
  marsh: { ramp: ['#55702e', '#68863a', '#7c9a46'], blotch: { ramp: ['#465e26', '#587630', '#6c8c3a'], scale: [2, 2, 2], density: 0.2 } },
  bog_floor: {
    ramp: ['#3e5626', '#4c6a2e', '#5c7c36'],
    blotch: { ramp: ['#324a20', '#3e5a26', '#4c6a2e'], scale: [2, 2, 2], density: 0.25 },
  },
  mud: { ramp: ['#3e2e20', '#54402c', '#6a5238'], blotch: { ramp: ['#33261a', '#463424', '#5a4430'], scale: [2, 1, 2], density: 0.2 } },
  swamp_water: {
    ramp: ['#2c5a48', '#356a52', '#3f7a5c'],
    blotch: { ramp: ['#5e8c3e', '#74a24a', '#8ab858'], scale: [2, 1, 2], density: 0.12 },
  },
  swamp_deep: {
    ramp: ['#1c4436', '#244e3e', '#2c5a48'],
    blotch: { ramp: ['#2c5a48', '#346650', '#3e7258'], scale: [5, 1, 1], density: 0.1 },
  },
  swamp_shallow: {
    ramp: ['#3e6a50', '#4a785a', '#588866'],
    blotch: { ramp: ['#5a5038', '#6a5e44', '#7a6e52'], scale: [4, 2, 4], density: 0.25 },
  },
  swamp_leaf: {
    ramp: ['#34502a', '#426434', '#527840'],
    blotch: { ramp: ['#5a7c3c', '#6c9046', '#80a452'], scale: [2, 2, 2], density: 0.22 },
  },
  hanging_moss: { ramp: ['#5e6e46', '#728256', '#869868'] },
  swamp_trunk: { ramp: ['#3c3228', '#50443a', '#66584a'] },
  snag: { ramp: ['#5a5248', '#6e6658', '#827a6a'] },
  lily_pad: { ramp: ['#24663a', '#2e7a44', '#3a8e50'] },
  reed: { ramp: ['#5a7a2a', '#6e9034', '#86a842'] },
  cattail: { ramp: ['#4a2c16', '#5e3a1e', '#744a28'] },
  frog: { ramp: ['#5a9a1e', '#74b42a', '#92cc3c'] },
  frog_eye: { ramp: ['#141824', '#1e2232', '#2a2e40'] },
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
  marsh: [
    { name: 'puddle', pixels: '.pp./pppp/.pp.', colors: { p: '#2c5a48' }, weight: 3 },
    { name: 'duckweed', pixels: 'pg/gp', colors: { p: '#2c5a48', g: '#8ab858' }, weight: 2 },
    { name: 'sedge', pixels: 'r.r/.r.', colors: { r: '#8eaa48' }, weight: 4 },
    { name: 'mud', pixels: 'mm/m.', colors: { m: '#54402c' }, weight: 2 },
    { name: 'bogflower', pixels: 'w', colors: { w: '#e8ecd8' }, weight: 2 },
  ],
  bog_floor: [
    { name: 'pool', pixels: 'pp/pp', colors: { p: '#244e3e' }, weight: 3 },
    { name: 'roots', pixels: 'rr../.rrr', colors: { r: '#50443a' }, weight: 3 },
    { name: 'bogmoss', pixels: 'mm/m.', colors: { m: '#6c9046' }, weight: 3 },
    { name: 'toadstool', pixels: 'yw', colors: { y: '#d8c060', w: '#f4ecd0' }, weight: 1 },
  ],
};
/** Cuantos detalles lleva una casilla de cada suelo. */
const DETAILS_PER_TILE = { grass: 9, snow: 6, forest_floor: 8, marsh: 9, bog_floor: 8 };

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

/**
 * El pantano, a 32 unidades por casilla (`detail: 2`): las casillas van de -16 a 16 y el decorado se
 * apoya en y = 0. Lo que tiene de pantano y no de bosque: cipreses de base ancha con musgo colgando y
 * troncos secos, nenufares en el agua, juncos con sus espadañas y ranas pequeñas.
 */
const SWAMP_DETAIL = 2;

/** Cada cuanto cuelga una barba de musgo a lo largo del borde de una copa (unidades) y lo que mide de ancho. */
const MOSS_STEP = 3;
const MOSS_WIDTH = 2;

/**
 * El fleco de musgo que cuelga alrededor de una copa (ancho `width`, cara de abajo en `bottom`): barbas
 * casi juntas y de largos distintos en sus cuatro lados, como una cortina rota. Es lo que mas dice
 * «pantano» desde la camara (unas pocas sueltas parecian patas de mesa).
 */
function hangingMoss(id, [x, z], width, bottom, seed) {
  const random = seeded(seed);
  const half = width / 2;
  const sides = [
    (along, length) => ({ origin: [x - half + along, bottom - length, z - half], size: [MOSS_WIDTH, length, 1] }),
    (along, length) => ({ origin: [x + half - 1, bottom - length, z - half + along], size: [1, length, MOSS_WIDTH] }),
    (along, length) => ({ origin: [x - half + along, bottom - length, z + half - 1], size: [MOSS_WIDTH, length, 1] }),
    (along, length) => ({ origin: [x - half, bottom - length, z - half + along], size: [1, length, MOSS_WIDTH] }),
  ];
  const slots = Array.from({ length: Math.floor((width - MOSS_WIDTH) / MOSS_STEP) + 1 }, (_, index) => index * MOSS_STEP);
  return sides.flatMap((side, sideIndex) =>
    slots
      .filter(() => random() < 0.8)
      .map((along) => ({ name: `${id}_moss${sideIndex}_${along}`, ...side(along, 3 + Math.floor(random() * 6)), paint: 'hanging_moss' })),
  );
}

/** Un cipres del pantano en (x, z): base ensanchada, tronco alto, copas anchas y planas y musgo colgando de la de abajo. */
function cypress(id, [x, z], trunk, crowns, seed) {
  const cubes = [
    { name: `${id}_flare`, origin: [x - 3, 0, z - 3], size: [6, 3, 6], paint: 'swamp_trunk' },
    { name: `${id}_trunk`, origin: [x - 2, 3, z - 2], size: [4, trunk, 4], paint: 'swamp_trunk' },
  ];
  const bottom = 3 + trunk - 1;
  let y = bottom;
  crowns.forEach(([width, height], index) => {
    cubes.push({
      name: `${id}_crown${index}`,
      origin: [x - width / 2, y, z - width / 2],
      size: [width, height, width],
      paint: 'swamp_leaf',
      phase: index * 13 + Math.abs(x),
    });
    y += height;
  });
  return [...cubes, ...hangingMoss(id, [x, z], crowns[0][0], bottom, seed)];
}

/** Un tronco seco en (x, z): el palo gris, una rama con su ramita hacia arriba, un muñon y musgo colgando de la rama. */
const snag = (id, [x, z]) => [
  { name: `${id}_trunk`, origin: [x - 1.5, 0, z - 1.5], size: [3, 13, 3], paint: 'snag' },
  { name: `${id}_branch`, origin: [x + 1.5, 8, z - 1], size: [6, 2, 2], paint: 'snag' },
  { name: `${id}_twig`, origin: [x + 5.5, 10, z - 1], size: [2, 4, 2], paint: 'snag' },
  { name: `${id}_stub`, origin: [x - 4.5, 5, z - 1], size: [3, 2, 2], paint: 'snag' },
  { name: `${id}_moss`, origin: [x + 3, 4, z - 0.5], size: [2, 4, 1], paint: 'hanging_moss' },
];

/** Las «rodillas» del cipres: las puntas de raiz que asoman del suelo alrededor. */
const knee = (id, [x, z], height) => ({ name: `${id}_knee`, origin: [x - 1, 0, z - 1], size: [2, height, 2], paint: 'swamp_trunk' });

/**
 * Un nenufar en (x, z), plano sobre el agua: un cuadrado con una tira en cada lado (redondeado a
 * escalones, como un circulo de pixel) y la muesca oscura de la hoja.
 */
function lilyPad(id, [x, z], radius) {
  const core = radius * 2 - 2;
  const strip = radius * 2 - 4;
  const notch = {
    name: `notch_${core}`,
    face: 'up',
    pixels: Array(radius - 1)
      .fill('n')
      .join('/'),
    colors: { n: '#1c4436' },
    at: [[radius - 1, 0]],
  };
  return [
    { name: `${id}_pad`, origin: [x - radius + 1, 0, z - radius + 1], size: [core, 1, core], paint: 'lily_pad', stamps: [notch] },
    { name: `${id}_north`, origin: [x - radius + 2, 0, z - radius], size: [strip, 1, 1], paint: 'lily_pad' },
    { name: `${id}_south`, origin: [x - radius + 2, 0, z + radius - 1], size: [strip, 1, 1], paint: 'lily_pad' },
    { name: `${id}_west`, origin: [x - radius, 0, z - radius + 2], size: [1, 1, strip], paint: 'lily_pad' },
    { name: `${id}_east`, origin: [x + radius - 1, 0, z - radius + 2], size: [1, 1, strip], paint: 'lily_pad' },
  ];
}

/** La flor del nenufar encima de su hoja: el corazon amarillo y cuatro petalos alrededor, como una copa. */
const lilyFlower = (id, [x, z], petal) => [
  { name: `${id}_heart`, origin: [x - 1, 1, z - 1], size: [2, 1, 2], paint: 'flower_center' },
  { name: `${id}_petal_n`, origin: [x - 1, 1, z - 2], size: [2, 2, 1], paint: petal },
  { name: `${id}_petal_s`, origin: [x - 1, 1, z + 1], size: [2, 2, 1], paint: petal },
  { name: `${id}_petal_w`, origin: [x - 2, 1, z - 1], size: [1, 2, 2], paint: petal },
  { name: `${id}_petal_e`, origin: [x + 1, 1, z - 1], size: [1, 2, 2], paint: petal },
];

/** Un capullo cerrado encima de su hoja. */
const lilyBud = (id, [x, z], petal) => ({ name: `${id}_bud`, origin: [x - 1, 1, z - 1], size: [2, 3, 2], paint: petal });

/**
 * Hojas de nenufar con flores y capullos. Todas llevan una hoja grande en el centro, libre: ahi se
 * sienta la rana cuando la hay (`seat` de la casilla en src/view3d/engine/terrain/pieces.ts).
 */
const lilies = (pads, blooms) => ({
  detail: SWAMP_DETAIL,
  cubes: [...lilyPad('center', [0, 0], 5), ...pads.flatMap(([id, at, radius]) => lilyPad(id, at, radius)), ...blooms.flat()],
});

/** Una mata de juncos en (x, z): tallos de alturas distintas y, en algunos, la espadaña marron arriba. */
function reedClump(id, [x, z], stems) {
  return stems.flatMap(([dx, dz, height, headed], index) => {
    const stem = { name: `${id}_stem${index}`, origin: [x + dx, 0, z + dz], size: [1, height, 1], paint: 'reed' };
    if (!headed) return [stem];
    return [stem, { name: `${id}_head${index}`, origin: [x + dx - 0.5, height - 1, z + dz - 0.5], size: [2, 3, 2], paint: 'cattail' }];
  });
}

/** Una flor de lirio en lo alto de un tallo (morada, como los lirios de agua). */
const iris = (id, [x, z], height) => [
  { name: `${id}_stem`, origin: [x, 0, z], size: [1, height, 1], paint: 'reed' },
  { name: `${id}_bloom`, origin: [x - 0.5, height, z - 0.5], size: [2, 2, 2], paint: 'petal_purple' },
];

/** Las matas de juncos de una casilla. Dejan libre la esquina de (8, 8): ahi se sienta la rana. */
const reeds = (cubes) => ({ detail: SWAMP_DETAIL, cubes });

export const MODELS = {
  ...groundVariants('grass', 'grass', 'earth', 4),
  ...groundVariants('forest', 'forest_floor', 'earth', 3),
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
  ...groundVariants('marsh', 'marsh', 'mud', 3),
  ...groundVariants('bog', 'bog_floor', 'mud', 3),
  tile_swamp_water: liquid('swamp_water', 1),
  tile_swamp_deep: liquid('swamp_deep', 0),
  tile_swamp_shallow: liquid('swamp_shallow', 2),
  swamp_trees_0: {
    detail: SWAMP_DETAIL,
    cubes: [
      ...cypress(
        'a',
        [-6, -5],
        11,
        [
          [16, 4],
          [11, 3],
          [6, 2],
        ],
        3,
      ),
      ...cypress(
        'b',
        [8, 8],
        7,
        [
          [12, 3],
          [8, 3],
        ],
        5,
      ),
      ...snag('c', [9, -10]),
      knee('k1', [-1, 4], 3),
      knee('k2', [-12, 6], 2),
      knee('k3', [2, 12], 2),
    ],
  },
  swamp_trees_1: {
    detail: SWAMP_DETAIL,
    cubes: [
      ...cypress(
        'a',
        [3, -3],
        12,
        [
          [18, 4],
          [13, 3],
          [7, 3],
        ],
        11,
      ),
      ...cypress(
        'b',
        [-9, 9],
        6,
        [
          [10, 3],
          [6, 2],
        ],
        13,
      ),
      ...snag('c', [-11, -9]),
      knee('k1', [9, 9], 3),
      knee('k2', [12, 4], 2),
      knee('k3', [-3, 7], 2),
    ],
  },
  lilies_0: lilies(
    [
      ['a', [-10, -9], 3],
      ['b', [9, -8], 4],
      ['c', [-9, 9], 3],
      ['d', [10, 9], 3],
    ],
    [lilyFlower('fa', [-9, 9], 'petal_pink'), lilyFlower('fb', [9, -8], 'petal_white')],
  ),
  lilies_1: lilies(
    [
      ['a', [-9, 6], 4],
      ['b', [9, 9], 3],
      ['c', [8, -10], 3],
    ],
    [lilyFlower('fa', [-9, 6], 'petal_white'), [lilyBud('ba', [8, -10], 'petal_pink')]],
  ),
  lilies_2: lilies(
    [
      ['a', [-10, -6], 4],
      ['b', [-6, 11], 3],
      ['c', [10, 3], 3],
      ['d', [4, -11], 3],
    ],
    [lilyFlower('fa', [10, 3], 'petal_pink'), [lilyBud('ba', [-6, 11], 'petal_white')]],
  ),
  cattails: reeds([
    ...reedClump(
      'a',
      [-8, -8],
      [
        [0, 0, 12, true],
        [2, 1, 9, false],
        [-1, 2, 10, true],
        [1, -2, 7, false],
      ],
    ),
    ...reedClump(
      'b',
      [7, -6],
      [
        [0, 0, 10, true],
        [-2, 1, 8, false],
        [1, 2, 11, true],
      ],
    ),
    ...reedClump(
      'c',
      [-7, 8],
      [
        [0, 0, 9, false],
        [2, -1, 11, true],
        [-1, -2, 7, false],
      ],
    ),
    ...iris('i1', [-1, -11], 8),
    ...iris('i2', [12, 1], 7),
    ...iris('i3', [-12, 1], 6),
  ]),
  reeds: reeds([
    ...reedClump(
      'a',
      [-9, -7],
      [
        [0, 0, 8, false],
        [2, 1, 6, false],
        [-1, 2, 9, true],
      ],
    ),
    ...reedClump(
      'b',
      [-8, 9],
      [
        [0, 0, 6, false],
        [1, -2, 7, false],
      ],
    ),
  ]),
  frog: {
    detail: SWAMP_DETAIL,
    cubes: [
      {
        name: 'body',
        origin: [-2, 0, -1],
        size: [4, 3, 5],
        paint: 'frog',
        stamps: [{ name: 'spots', face: 'up', pixels: 'd..d/..../.d../...d/d...', colors: { d: '#3e6e16' }, at: [[0, 0]] }],
      },
      {
        name: 'head',
        origin: [-2, 1, -3],
        size: [4, 2, 2],
        paint: 'frog',
        stamps: [{ name: 'throat', face: 'north', pixels: 'llll', colors: { l: '#dce48c' }, at: [[0, 1]] }],
      },
      { name: 'eye_left', origin: [-2, 3, -3], size: [1, 1, 1], paint: 'frog_eye' },
      { name: 'eye_right', origin: [1, 3, -3], size: [1, 1, 1], paint: 'frog_eye' },
      { name: 'thigh_left', origin: [-3, 0, 1], size: [1, 2, 3], paint: 'frog' },
      { name: 'thigh_right', origin: [2, 0, 1], size: [1, 2, 3], paint: 'frog' },
      { name: 'foot_left', origin: [-3, 0, -1], size: [1, 1, 2], paint: 'frog' },
      { name: 'foot_right', origin: [2, 0, -1], size: [1, 1, 2], paint: 'frog' },
      { name: 'hand_left', origin: [-2, 0, -3], size: [1, 1, 1], paint: 'frog' },
      { name: 'hand_right', origin: [1, 0, -3], size: [1, 1, 1], paint: 'frog' },
    ],
  },
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
