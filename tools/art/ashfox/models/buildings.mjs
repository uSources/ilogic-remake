// Los edificios para Ashfox, a semejanza de los del 2D (public/assets/img/flat/bld_*): enteros del
// color de su dueño (turquesa lo propio y aliado, rojo lo enemigo, gris lo de nadie), con su rejilla
// de ventanas. Algunos se mueven (su animacion 'idle', en bucle): la bomba del pozo cabecea, los
// radares giran y las banderas ondean. El humo de la fabrica lo pone el juego (particulas). Un modelo por edificio y lado: `<edificio en minusculas>_<lado>` (lado: blue, red o neutral). Miran
// al norte (-z: ahi van puertas y ventanas) y se apoyan en y = 0 sobre su casilla (de -8 a 8). Lo
// escribe generate.mjs.

import { loopMotion, spin, sway } from './motions.mjs';

/** Los colores de cada lado: el del edificio y el de sus remates (rampa y borde claro), como en el 2D. */
const SIDES = {
  blue: { body: ['#1a8ea2', '#1f9fb4', '#2cb0c4'], bodyRim: '#6ad8e4', trim: ['#126c7e', '#16788a', '#1f889a'], trimRim: '#2fb4c6' },
  red: { body: ['#a42424', '#b8282a', '#c8383a'], bodyRim: '#ee6a60', trim: ['#741416', '#86181a', '#962420'], trimRim: '#c23a36' },
  neutral: { body: ['#868a92', '#8f949c', '#9ca0a8'], bodyRim: '#c8ccd2', trim: ['#5a5e66', '#62666e', '#6e727a'], trimRim: '#8f949c' },
};

const WINDOW = '#14202c';
const LIT = '#ffe08a';

export const PAINTS = {
  pavement: {
    ramp: ['#aea896', '#b9b2a0', '#c4bdaa'],
    blotch: { ramp: ['#9a958a', '#a8a290', '#b0aa9a'], scale: [2, 1, 2], density: 0.1 },
  },
  asphalt: { ramp: ['#1c2028', '#2a2e38', '#3c4250'] },
  window_glass: { ramp: ['#8ad4f4', '#9fe3ff', '#b8ecff'] },
  metal: { ramp: ['#4e5666', '#8a93a6', '#c3cbd9'] },
  ...Object.fromEntries(
    Object.entries(SIDES).flatMap(([side, colors]) => [
      [`body_${side}`, { ramp: colors.body, rim: colors.bodyRim }],
      [`trim_${side}`, { ramp: colors.trim, rim: colors.trimRim }],
    ]),
  ),
};

/** Ventanas en rejilla (w oscura, l encendida) y una puerta. Cada stamp va en las caras que se digan. */
const windowGrid = (name, face, rows, at) => ({ name, face, pixels: rows.join('/'), colors: { w: WINDOW, l: LIT }, at });
const door = (face, at) => ({ name: 'door', face, pixels: 'ddd/ddd/ddd', colors: { d: WINDOW }, at: [at] });

/** La ciudad: cuatro columnas de ventanas (alguna encendida); de frente, la ultima fila es la puerta. */
const CITY_WINDOWS = [
  '.w.l.w.w.',
  '.w.l.w.w.',
  '.........',
  '.w.w.w.l.',
  '.w.w.w.l.',
  '.........',
  '.l.w.w.w.',
  '.l.w.w.w.',
  '.........',
  '.w.w.l.w.',
  '.w.w.l.w.',
];
const CITY_SIDE_WINDOWS = [...CITY_WINDOWS, '.........', '.w.w.w.w.', '.w.w.w.w.'];
const PLINTH = { name: 'plinth', origin: [-7, 0, -7], size: [14, 1, 14], paint: 'pavement' };

function city(side) {
  const trim = `trim_${side}`;
  return [
    PLINTH,
    {
      name: 'tower',
      origin: [-4.5, 1, -4.5],
      size: [9, 15, 9],
      paint: `body_${side}`,
      stamps: [
        windowGrid('front_windows', 'north', CITY_WINDOWS, [[0, 1]]),
        door('north', [3, 12]),
        ...['east', 'west', 'south'].map((face) => windowGrid('side_windows', face, CITY_SIDE_WINDOWS, [[0, 1]])),
      ],
    },
    { name: 'awning', origin: [-2.5, 4, -6], size: [5, 1, 2], paint: trim },
    { name: 'parapet', origin: [-5, 16, -5], size: [10, 1, 10], paint: trim },
    { name: 'skylight', origin: [-2, 17, -2], size: [4, 1, 4], paint: 'window_glass' },
  ];
}

/** El hueso fijo del edificio y los que se mueven, colgados de el. */
const withBones = (moving) => [{ name: 'body', parent: 'root', pivot: [0, 0, 0] }, ...moving.map((bone) => ({ parent: 'body', ...bone }))];
/** Un radar: una barra que gira a saltos sobre su eje vertical (se ve igual cada media vuelta). */
const radarSpin = (bone) => spin(bone, 2.4, { axis: 1, symmetry: 180, sign: 1, steps: 8 });
/** Una bandera: ondea a un lado y al otro (en lo que dura el bucle de su edificio: todas sus pistas lo cubren entero). */
const flagWave = (bone, duration) => sway(bone, [0, 22, 4], duration);

function base(side) {
  const cubes = [
    { name: 'platform', origin: [-7, 0, -7], size: [14, 3, 14], paint: `trim_${side}` },
    {
      name: 'tall',
      origin: [-6, 3, -3],
      size: [5, 13, 5],
      paint: `body_${side}`,
      stamps: [windowGrid('tall_windows', 'north', ['www', '...', 'wlw', '...', 'www', '...', 'lww', '...', 'www'], [[1, 2]])],
    },
    {
      name: 'short',
      origin: [1, 3, -1],
      size: [5, 9, 5],
      paint: `body_${side}`,
      stamps: [windowGrid('short_windows', 'north', ['www', '...', 'wwl', '...', 'www'], [[1, 2]])],
    },
    { name: 'antenna', origin: [-4, 16, -1], size: [1, 3, 1], paint: 'metal' },
    { name: 'flag', bone: 'flag', origin: [-3, 17, -0.5], size: [3, 2, 1], paint: `body_${side}` },
    { name: 'gate', origin: [-1.5, 3, -6], size: [3, 2, 1], paint: 'asphalt' },
    { name: 'radar_post', origin: [3, 12, 1], size: [1, 1, 1], paint: 'metal' },
    { name: 'radar_dish', bone: 'radar', origin: [1.5, 13, 1], size: [4, 2, 1], paint: 'metal' },
  ];
  return {
    cubes,
    bones: withBones([
      { name: 'flag', pivot: [-3, 18, 0] },
      { name: 'radar', pivot: [3.5, 13, 1.5] },
    ]),
    motions: { idle: loopMotion(2.4, [flagWave('flag', 2.4), radarSpin('radar')]) },
  };
}

/** Un diente del tejado de sierra: un prisma a 45 grados medio hundido (un poco por dentro de la nave, para no pelear con su cara), con cristales en una vertiente. */
const sawTooth = (side, x, index) => ({
  name: `tooth${index}`,
  origin: [x, 5, -3.5],
  size: [4, 4, 8],
  paint: `trim_${side}`,
  rotation: [0, 0, 45],
  pivot: [x + 2, 7, 0.5],
  stamps: [{ name: 'glazing', face: 'east', pixels: 'gggggggg/gggggggg', colors: { g: '#9fe3ff' }, at: [[0, 1]] }],
});

/** La fabrica: nave con dos filas de ventanas y puerta, tejado de sierra y chimenea (el humo lo pone el juego). */
function factory(side) {
  return [
    PLINTH,
    {
      name: 'hall',
      origin: [-6, 1, -4],
      size: [12, 6, 9],
      paint: `body_${side}`,
      stamps: [windowGrid('hall_windows', 'north', ['.ww.ww.wl.ww', '............', '.ww.lw.ww.ww'], [[0, 1]]), door('north', [1, 3])],
    },
    ...[-6, -2, 2].map((x, index) => sawTooth(side, x, index)),
    { name: 'chimney', origin: [4, 1, 4], size: [2, 11, 2], paint: 'pavement' },
    { name: 'chimney_cap', origin: [3.5, 12, 3.5], size: [3, 1, 3], paint: `trim_${side}` },
  ];
}

function oil(side) {
  const cubes = [
    PLINTH,
    { name: 'deck', origin: [-6, 1, -4], size: [12, 2, 8], paint: `trim_${side}` },
    { name: 'leg_left', origin: [-5, 3, -1], size: [2, 8, 2], paint: `body_${side}` },
    { name: 'leg_right', origin: [3, 3, -1], size: [2, 8, 2], paint: `body_${side}` },
    { name: 'beam', bone: 'pump', origin: [-6, 11, -2], size: [12, 2, 4], paint: `body_${side}` },
    { name: 'cap', bone: 'pump', origin: [-1.5, 13, -1.5], size: [3, 2, 3], paint: `trim_${side}` },
    {
      name: 'drill',
      origin: [-1, 3, -0.5],
      size: [2, 8, 1],
      paint: 'metal',
      stamps: [{ name: 'brace', face: 'north', pixels: 'k./.k/k./.k/k./.k/k./.k', colors: { k: WINDOW }, at: [[0, 0]] }],
    },
  ];
  // La bomba cabecea sobre lo alto de las patas.
  return { cubes, bones: withBones([{ name: 'pump', pivot: [0, 12, 0] }]), motions: { idle: loopMotion(2, [sway('pump', [0, 0, 9], 2)]) } };
}

/** El fuerte: una cupula de anillos (escalones cada vez mas estrechos) con dos troneras y la entrada. */
function stronghold(side) {
  const body = `body_${side}`;
  const rings = [
    [13, 3],
    [12, 3],
    [10, 2],
    [8, 1],
    [6, 1],
  ];
  let floor = 1;
  const dome = rings.map(([width, height], index) => {
    const ring = { name: `ring${index}`, origin: [-width / 2, floor, -width / 2], size: [width, height, width], paint: body };
    floor += height;
    return ring;
  });
  dome[1].stamps = [{ name: 'slits', face: 'north', pixels: '.kkk....kkk.', colors: { k: WINDOW }, at: [[0, 1]] }];
  const cubes = [
    PLINTH,
    ...dome,
    { name: 'entrance', origin: [-2.5, 1, -7.5], size: [5, 3, 1], paint: `trim_${side}`, stamps: [door('north', [1, 0])] },
    { name: 'pole', origin: [-0.5, floor, -0.5], size: [1, 4, 1], paint: 'metal' },
    { name: 'flag', bone: 'flag', origin: [0.5, floor + 2, -0.5], size: [3, 2, 1], paint: body },
  ];
  return {
    cubes,
    bones: withBones([{ name: 'flag', pivot: [0.5, floor + 3, 0] }]),
    motions: { idle: loopMotion(1.4, [flagWave('flag', 1.4)]) },
  };
}

/** El aeropuerto: torre de control (cabina de cristal y radar) y hangar de tejado redondo, junto a la pista. */
function airport(side) {
  const body = `body_${side}`;
  const trim = `trim_${side}`;
  const cubes = [
    {
      name: 'runway',
      origin: [-7, 0, -7],
      size: [14, 1, 14],
      paint: 'asphalt',
      stamps: [{ name: 'dashes', face: 'up', pixels: 'ww..ww..ww', colors: { w: '#f2f5ff' }, at: [[2, 11]] }],
    },
    { name: 'tower', origin: [-6.5, 1, -6.5], size: [4, 9, 4], paint: body },
    { name: 'cab', origin: [-7, 10, -7], size: [5, 3, 5], paint: 'window_glass' },
    { name: 'cab_roof', origin: [-7, 13, -7], size: [5, 1, 5], paint: trim },
    { name: 'cab_top', origin: [-6, 14, -6], size: [3, 1, 3], paint: trim },
    { name: 'radar_dish', bone: 'radar', origin: [-6.5, 15, -5], size: [4, 1, 1], paint: 'metal' },
    {
      name: 'hangar',
      origin: [-1.5, 1, -6],
      size: [8, 4, 8],
      paint: body,
      stamps: [{ name: 'hangar_door', face: 'north', pixels: '.kkkkkk./.kkkkkk./.kkkkkk.', colors: { k: WINDOW }, at: [[0, 1]] }],
    },
    { name: 'hangar_roof', origin: [-0.5, 5, -6], size: [6, 1, 8], paint: body },
    { name: 'hangar_ridge', origin: [0.5, 6, -6], size: [4, 1, 8], paint: trim },
  ];
  return {
    cubes,
    bones: withBones([{ name: 'radar', pivot: [-4.5, 15, -4.5] }]),
    motions: { idle: loopMotion(2.4, [radarSpin('radar')]) },
  };
}

const BUILDINGS = { City: city, Base: base, Factory: factory, Oil: oil, Stronghold: stronghold, Airport: airport };

export const MODELS = Object.fromEntries(
  Object.entries(BUILDINGS).flatMap(([building, cubesOf]) =>
    Object.keys(SIDES).map((side) => {
      // Los que no se mueven solo dan sus cubos; los que si, tambien sus huesos y su animacion.
      const built = cubesOf(side);
      return [`${building.toLowerCase()}_${side}`, Array.isArray(built) ? { cubes: built } : built];
    }),
  ),
);
