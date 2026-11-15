// Los edificios para Ashfox, a semejanza de los del 2D (public/assets/img/flat/bld_*): enteros del
// color de su dueño (turquesa lo propio y aliado, rojo lo enemigo, gris lo de nadie), con su rejilla
// de ventanas. Un modelo por edificio y lado: `<edificio en minusculas>_<lado>` (lado: blue, red o neutral). Miran
// al norte (-z: ahi van puertas y ventanas) y se apoyan en y = 0 sobre su casilla (de -8 a 8). Lo
// escribe generate.mjs.

/** Los colores de cada lado: el del edificio, el de sus remates y el de las ventanas encendidas. */
const SIDES = {
  blue: { body: ['#0f5a6e', '#1f9fb4', '#5fd6e0'], trim: ['#0a3c4c', '#16788a', '#2fb4c6'] },
  red: { body: ['#6e1414', '#b8282a', '#ee5a50'], trim: ['#4a0c0c', '#86181a', '#c23a36'] },
  neutral: { body: ['#55585e', '#8f949c', '#c8ccd2'], trim: ['#3a3d42', '#62666e', '#8f949c'] },
};

const WINDOW = '#14202c';
const LIT = '#ffe08a';

export const PAINTS = {
  pavement: {
    ramp: ['#8a857a', '#b9b2a0', '#d6cfbd'],
    blotch: { ramp: ['#7a756a', '#9a958a', '#b0aa9a'], scale: [2, 1, 2], density: 0.15 },
  },
  asphalt: { ramp: ['#1c2028', '#2a2e38', '#3c4250'] },
  glass: { ramp: ['#4f9fc8', '#9fe3ff', '#e6f8ff'] },
  metal: { ramp: ['#4e5666', '#8a93a6', '#c3cbd9'] },
  ...Object.fromEntries(
    Object.entries(SIDES).flatMap(([side, colors]) => [
      [`body_${side}`, { ramp: colors.body }],
      [`ribbed_${side}`, { ramp: colors.body, blotch: { ramp: colors.trim, scale: [1, 2, 1], density: 0.3 } }],
      [`trim_${side}`, { ramp: colors.trim }],
    ]),
  ),
};

/** Ventanas en rejilla (w oscura, l encendida) y una puerta. Cada stamp va en las caras que se digan. */
const windowGrid = (name, face, rows, at) => ({ name, face, pixels: rows.join('/'), colors: { w: WINDOW, l: LIT }, at });
const door = (face, at) => ({ name: 'door', face, pixels: 'dd/dd/dd', colors: { d: WINDOW }, at: [at] });

const TOWER_WINDOWS = ['w.w.l.w.', '........', 'w.l.w.w.', '........', 'w.w.w.l.', '........', 'l.w.w.w.', '........', 'w.w.l.w.'];
const PLINTH = { name: 'plinth', origin: [-7, 0, -7], size: [14, 1, 14], paint: 'pavement' };

function city(side) {
  return [
    PLINTH,
    {
      name: 'tower',
      origin: [-4, 1, -4],
      size: [8, 13, 8],
      paint: `body_${side}`,
      stamps: [
        windowGrid('front_windows', 'north', TOWER_WINDOWS, [[0, 1]]),
        windowGrid('side_windows', 'east', TOWER_WINDOWS, [[0, 1]]),
        door('north', [3, 10]),
      ],
    },
    { name: 'roof', origin: [-4.5, 14, -4.5], size: [9, 1, 9], paint: `trim_${side}` },
    { name: 'annex', origin: [4, 1, -2], size: [3, 5, 6], paint: `trim_${side}` },
  ];
}

function base(side) {
  return [
    { name: 'platform', origin: [-7, 0, -7], size: [14, 3, 14], paint: `trim_${side}` },
    {
      name: 'tall',
      origin: [-6, 3, -3],
      size: [5, 13, 5],
      paint: `body_${side}`,
      stamps: [windowGrid('tall_windows', 'north', ['w.l.', '....', 'w.w.', '....', 'l.w.', '....', 'w.w.'], [[1, 2]])],
    },
    {
      name: 'short',
      origin: [1, 3, -1],
      size: [5, 9, 5],
      paint: `body_${side}`,
      stamps: [windowGrid('short_windows', 'north', ['w.w.', '....', 'l.w.', '....', 'w.l.'], [[1, 2]])],
    },
    { name: 'antenna', origin: [-4, 16, -1], size: [1, 3, 1], paint: 'metal' },
    { name: 'gate', origin: [-1.5, 3, -6], size: [3, 2, 1], paint: 'asphalt' },
  ];
}

function factory(side) {
  const teeth = [-6, -2, 2].flatMap((x, index) => [
    { name: `roof${index}`, origin: [x, 7, -4], size: [4, 1, 9], paint: `trim_${side}` },
    { name: `skylight${index}`, origin: [x + 2, 8, -4], size: [2, 2, 9], paint: 'glass' },
  ]);
  return [
    PLINTH,
    {
      name: 'hall',
      origin: [-6, 1, -4],
      size: [12, 6, 9],
      paint: `body_${side}`,
      stamps: [windowGrid('hall_windows', 'north', ['w.w.w.l.w.w.'], [[0, 1]]), door('north', [5, 3])],
    },
    ...teeth,
    { name: 'chimney', origin: [4, 1, 4], size: [2, 11, 2], paint: 'pavement' },
    { name: 'chimney_cap', origin: [3.5, 12, 3.5], size: [3, 1, 3], paint: `trim_${side}` },
  ];
}

function oil(side) {
  return [
    PLINTH,
    { name: 'deck', origin: [-6, 1, -4], size: [12, 2, 8], paint: `trim_${side}` },
    { name: 'leg_left', origin: [-5, 3, -1], size: [2, 8, 2], paint: `body_${side}` },
    { name: 'leg_right', origin: [3, 3, -1], size: [2, 8, 2], paint: `body_${side}` },
    { name: 'beam', origin: [-6, 11, -2], size: [12, 2, 4], paint: `body_${side}` },
    { name: 'cap', origin: [-1.5, 13, -1.5], size: [3, 2, 3], paint: `trim_${side}` },
    {
      name: 'drill',
      origin: [-1, 3, -0.5],
      size: [2, 8, 1],
      paint: 'metal',
      stamps: [{ name: 'brace', face: 'north', pixels: 'k./.k/k./.k/k./.k/k./.k', colors: { k: WINDOW }, at: [[0, 0]] }],
    },
  ];
}

function stronghold(side) {
  const ribbed = `ribbed_${side}`;
  return [
    PLINTH,
    {
      name: 'dome0',
      origin: [-6, 1, -6],
      size: [12, 4, 12],
      paint: ribbed,
      stamps: [{ name: 'slits', face: 'north', pixels: 'kkk......kkk', colors: { k: WINDOW }, at: [[0, 1]] }],
    },
    { name: 'dome1', origin: [-5, 5, -5], size: [10, 3, 10], paint: ribbed },
    { name: 'dome2', origin: [-4, 8, -4], size: [8, 2, 8], paint: ribbed },
    { name: 'dome3', origin: [-2.5, 10, -2.5], size: [5, 1, 5], paint: `body_${side}` },
    { name: 'entrance', origin: [-1.5, 1, -7], size: [3, 3, 1], paint: `trim_${side}` },
  ];
}

function airport(side) {
  return [
    {
      name: 'runway',
      origin: [-7, 0, -7],
      size: [14, 1, 14],
      paint: 'asphalt',
      stamps: [{ name: 'dashes', face: 'up', pixels: 'ww..ww..ww', colors: { w: '#f2f5ff' }, at: [[2, 11]] }],
    },
    { name: 'tower', origin: [-6, 1, -6], size: [3, 10, 3], paint: `body_${side}` },
    { name: 'cab', origin: [-6.5, 11, -6.5], size: [4, 2, 4], paint: 'glass' },
    { name: 'cab_roof', origin: [-6.5, 13, -6.5], size: [4, 1, 4], paint: `trim_${side}` },
    {
      name: 'hangar',
      origin: [-1, 1, -6],
      size: [7, 5, 7],
      paint: `body_${side}`,
      stamps: [{ name: 'hangar_door', face: 'north', pixels: '.kkkkk./.kkkkk./.kkkkk.', colors: { k: WINDOW }, at: [[0, 2]] }],
    },
    { name: 'hangar_roof', origin: [0, 6, -6], size: [5, 1, 7], paint: `trim_${side}` },
  ];
}

const BUILDINGS = { City: city, Base: base, Factory: factory, Oil: oil, Stronghold: stronghold, Airport: airport };

export const MODELS = Object.fromEntries(
  Object.entries(BUILDINGS).flatMap(([building, cubesOf]) =>
    Object.keys(SIDES).map((side) => [`${building.toLowerCase()}_${side}`, { cubes: cubesOf(side) }]),
  ),
);
