// Los edificios para Ashfox, con la estetica del juego (docs/ESTETICA.md): a 32 unidades por casilla
// (`detail: 2`), del color de su dueño (turquesa lo propio y aliado, rojo lo enemigo, gris lo de
// nadie), como en el 2D (public/assets/img/flat/bld_*), y con mucho detalle: lo pequeño pintado y lo
// que sobresale en 3D. Algunos se mueven (su animacion 'idle', en bucle): la bomba del petroleo
// cabecea y sus contrapesos giran, los radares giran y las banderas y la manga de viento ondean. El
// humo de la fabrica lo pone el juego (particulas). Un modelo por edificio y lado:
// `<edificio en minusculas>_<lado>` (blue, red o neutral). Miran al norte (-z: ahi van puertas y
// ventanas) y se apoyan en y = 0 sobre su casilla (de -16 a 16). Lo escribe generate.mjs.

import { loopMotion, spin, sway } from './motions.mjs';

const DETAIL = 2;

/** Los colores de cada lado: el del edificio y el de sus remates (rampa y borde claro), como en el 2D. */
const SIDES = {
  blue: { body: ['#1a8ea2', '#1f9fb4', '#2cb0c4'], bodyRim: '#6ad8e4', trim: ['#126c7e', '#16788a', '#1f889a'], trimRim: '#2fb4c6' },
  red: { body: ['#a42424', '#b8282a', '#c8383a'], bodyRim: '#ee6a60', trim: ['#741416', '#86181a', '#962420'], trimRim: '#c23a36' },
  neutral: { body: ['#868a92', '#8f949c', '#9ca0a8'], bodyRim: '#c8ccd2', trim: ['#5a5e66', '#62666e', '#6e727a'], trimRim: '#8f949c' },
};

const WINDOW = '#14202c';
const LIT = '#ffe08a';
const FRAME = '#e8ecf2';
const STRIPE_YELLOW = '#e8c020';
const STRIPE_BLACK = '#1a1e28';
const DARK_METAL = '#3a4050';
const RED_LIGHT = '#d8323a';

export const PAINTS = {
  pavement: {
    ramp: ['#aea896', '#b9b2a0', '#c4bdaa'],
    blotch: { ramp: ['#9a958a', '#a8a290', '#b0aa9a'], scale: [2, 1, 2], density: 0.1 },
  },
  asphalt: { ramp: ['#1c2028', '#2a2e38', '#3c4250'] },
  window_glass: { ramp: ['#8ad4f4', '#9fe3ff', '#b8ecff'] },
  metal: { ramp: ['#4e5666', '#8a93a6', '#c3cbd9'] },
  brick: { ramp: ['#8a3a2a', '#9e4630', '#b05638'] },
  oil_black: { ramp: ['#14161c', '#1c1f27', '#262a34'] },
  windsock: { ramp: ['#d8601c', '#ee7a2a', '#ff9a4a'] },
  ...Object.fromEntries(
    Object.entries(SIDES).flatMap(([side, colors]) => [
      [`body_${side}`, { ramp: colors.body, rim: colors.bodyRim }],
      [`trim_${side}`, { ramp: colors.trim, rim: colors.trimRim }],
    ]),
  ),
};

// ---- Piezas comunes ----

/** Una sola pieza pintada en una cara (`pixels` con filas separadas por /), en (x, y) desde arriba a la izquierda. */
const mark = (name, face, pixels, colors, at) => ({ name, face, pixels, colors, at: [at] });
const FACES_AROUND = ['north', 'south', 'east', 'west'];

/**
 * Una rejilla de ventanas de `cols` por `rows` (cada una de 2×3 con su marco claro arriba), algunas
 * encendidas (a saltos, siempre las mismas), para una cara.
 */
function windowGrid(cols, rows, seed = 0) {
  const lines = [];
  for (let row = 0; row < rows; row++) {
    const cells = (pick) => [...Array(cols)].map((_, col) => pick(col)).join('.');
    const isLit = (col) => (col * 7 + row * 3 + seed) % 5 === 0;
    lines.push(
      `.${cells(() => 'ff')}.`,
      `.${cells((col) => (isLit(col) ? 'll' : 'ww'))}.`,
      `.${cells((col) => (isLit(col) ? 'll' : 'ww'))}.`,
    );
    if (row < rows - 1) lines.push('.'.repeat(cols * 3 + 1));
  }
  return lines.join('/');
}
const WINDOW_COLORS = { w: WINDOW, l: LIT, f: FRAME };

/** Franjas de peligro (amarillo y negro, en diagonal) de ese ancho y alto. */
const hazardStripes = (width, height) =>
  [...Array(height)].map((_, row) => [...Array(width)].map((_, x) => ((x + row) % 6 < 3 ? 'y' : 'k')).join('')).join('/');

/** El suelo del edificio: una losa de acera con el bordillo oscuro alrededor. */
const plinth = (size = 28) => ({
  name: 'plinth',
  origin: [-size / 2, 0, -size / 2],
  size: [size, 2, size],
  paint: 'pavement',
  stamps: FACES_AROUND.map((face) => mark(`curb${size}`, face, 'k'.repeat(size), { k: '#7a7468' }, [0, 1])),
});

/** Un arbusto en una maceta. */
const planter = (name, [x, z]) => [
  { name: `${name}_pot`, origin: [x, 2, z], size: [4, 2, 4], paint: 'brick' },
  { name: `${name}_bush`, origin: [x - 0.5, 4, z - 0.5], size: [5, 4, 5], paint: 'leaf' },
];

/** Una farola: el poste y la lampara. */
const streetLamp = (name, [x, z]) => [
  { name: `${name}_post`, origin: [x, 2, z], size: [1, 10, 1], paint: 'metal' },
  { name: `${name}_light`, origin: [x - 1, 12, z - 1], size: [3, 2, 3], paint: 'lamp' },
];

/** El hueso fijo del edificio y los que se mueven, colgados de el. */
const withBones = (moving) => [{ name: 'body', parent: 'root', pivot: [0, 0, 0] }, ...moving.map((bone) => ({ parent: 'body', ...bone }))];
/** Un radar: una antena que gira a saltos sobre su eje vertical (se ve igual cada media vuelta). */
const radarSpin = (bone, duration = 2.4) => spin(bone, duration, { axis: 1, symmetry: 180, sign: 1, steps: 8 });
/** Una bandera: ondea a un lado y al otro (en lo que dura el bucle de su edificio). */
const flagWave = (bone, duration) => sway(bone, [0, 22, 4], duration);

/** Donde gira la bandera de un mastil: junto al poste, en lo alto de la tela. */
const flagPivot = ([x, y, z], height) => [x + 1, y + height - 2, z + 0.5];

/** Un mastil con su bandera (del color del lado, con una franja clara), que ondea en su hueso. */
const flagpole = (side, name, [x, y, z], height) => [
  { name: `${name}_pole`, origin: [x, y, z], size: [1, height, 1], paint: 'metal' },
  { name: `${name}_ball`, origin: [x - 0.5, y + height, z - 0.5], size: [2, 1, 2], paint: 'lamp' },
  {
    name: `${name}_cloth`,
    bone: name,
    origin: [x + 1, y + height - 5, z],
    size: [7, 4, 1],
    paint: `body_${side}`,
    stamps: ['north', 'south'].map((face) => mark('flag_stripe', face, 'wwwwwww', { w: FRAME }, [0, 1])),
  },
];

// ---- La ciudad: un edificio de oficinas ----

/** La torre: ventanas en rejilla (algunas encendidas) en las cuatro caras, la entrada de cristal con su marquesina y el remate. */
function cityTower(side) {
  const size = [18, 28, 18];
  return [
    {
      name: 'tower',
      origin: [-9, 2, -9],
      size,
      paint: `body_${side}`,
      stamps: [
        ...FACES_AROUND.map((face, index) => mark(`city_windows_${face}`, face, windowGrid(5, 5, index), WINDOW_COLORS, [1, 1])),
        mark('city_door', 'north', 'dddddd/dggggd/dggggd/dggggd/dggggd', { d: '#2a3a48', g: '#9fe3ff' }, [6, 23]),
      ],
    },
    { name: 'canopy', origin: [-6, 9, -12], size: [12, 1, 4], paint: `trim_${side}` },
    ...[-1, 1].map((sideSign) => ({
      name: `canopy_post_${sideSign < 0 ? 'left' : 'right'}`,
      origin: [sideSign < 0 ? -5.5 : 4.5, 2, -11.5],
      size: [1, 7, 1],
      paint: 'metal',
    })),
    { name: 'parapet', origin: [-10, 30, -10], size: [20, 2, 20], paint: `trim_${side}` },
    { name: 'roof', origin: [-9, 32, -9], size: [18, 1, 18], paint: 'asphalt' },
  ];
}

/** El tejado: aparatos de aire con su rejilla, el deposito de agua y la antena con la luz roja. */
const CITY_ROOF = [
  ...[
    [-7, -6],
    [-1, -6],
  ].map(([x, z], index) => ({
    name: `air_unit_${index}`,
    origin: [x, 33, z],
    size: [4, 2, 3],
    paint: 'metal',
    stamps: [mark('air_grille', 'north', 'k.k./.k.k', { k: DARK_METAL }, [0, 0])],
  })),
  {
    name: 'water_tank',
    origin: [2, 33, 1],
    size: [5, 5, 5],
    paint: 'trunk',
    stamps: [mark('tank_hoops', 'north', 'kkkkk/...../kkkkk', { k: '#3a2416' }, [0, 1])],
  },
  { name: 'antenna', origin: [-6, 33, 5], size: [1, 9, 1], paint: 'metal' },
  { name: 'antenna_light', origin: [-6, 42, 5], size: [1, 1, 1], paint: 'warhead' },
];

const city = (side) => ({
  cubes: [
    plinth(),
    ...cityTower(side),
    ...CITY_ROOF,
    ...planter('planter_left', [-13, -13]),
    ...planter('planter_right', [9, -13]),
    ...streetLamp('lamp', [12, 10]),
  ],
});

// ---- El petroleo: una bomba de balancin ----

/**
 * La bomba de balancin (el «caballito»): sobre su bancada, el caballete en A sostiene el balancin, que
 * cabecea (hueso `pump`); delante, la cabeza curva con el cable hasta el pozo (hueso `bridle`);
 * detras, la caja de engranajes con los contrapesos, que giran (hueso `crank`), y el motor.
 */
const PUMP_PIVOT = [0, 20, -3];
const CRANK_PIVOT = [9, 9, -3];
/** Donde cuelga el cable del cabezal: va en su propio hueso, que gira al reves que el balancin, asi baja siempre recto al pozo (y entra en el, para que no se despegue al subir). */
const BRIDLE_TOP = [-16, 14, -3];
const PUMP_NOD = 10;
/**
 * Las bielas: cuelgan de la cola del balancin (en su propio hueso, que gira al reves, asi bajan rectas)
 * hasta la manivela, entre los contrapesos.
 */
const PITMAN_TOP = [10, 20, -3];

function pumpjack(side) {
  const body = `body_${side}`;
  const trim = `trim_${side}`;
  const [px, py, pz] = PUMP_PIVOT;
  return [
    {
      name: 'skid',
      origin: [-14, 2, -7],
      size: [27, 2, 8],
      paint: 'oil_black',
      stamps: [mark('skid_stripes', 'north', hazardStripes(27, 2), { y: STRIPE_YELLOW, k: STRIPE_BLACK }, [0, 0])],
    },
    ...[-1, 1].flatMap((sideSign) => {
      const label = sideSign < 0 ? 'front' : 'back';
      return [-1, 1].map((x) =>
        limbBetween(`samson_${label}_${x < 0 ? 'left' : 'right'}`, 'body', [px + x * 4, 4, pz + sideSign * 3], [px, py - 1, pz], 2, trim),
      );
    }),
    { name: 'samson_saddle', origin: [px - 2, py - 3, pz - 2], size: [4, 2, 4], paint: 'metal' },
    { name: 'samson_bearing', bone: 'pump', origin: [px - 1.5, py - 1, pz - 2.5], size: [3, 1, 5], paint: 'metal' },
    { name: 'equalizer', bone: 'pump', origin: [PITMAN_TOP[0] - 1, py - 1, pz - 4], size: [2, 1, 8], paint: 'metal' },
    ...[-1, 1].map((sideSign) => ({
      name: `pitman_${sideSign < 0 ? 'front' : 'back'}`,
      bone: 'pitman',
      origin: [PITMAN_TOP[0] - 0.5, CRANK_PIVOT[1], pz + sideSign * 3 - 0.5],
      size: [1, py - 1 - CRANK_PIVOT[1], 1],
      paint: 'gun',
    })),
    {
      name: 'walking_beam',
      bone: 'pump',
      origin: [-13, py, pz - 1.5],
      size: [25, 3, 3],
      paint: body,
      stamps: ['north', 'south'].map((face) => mark('beam_rivets', face, '.r....r....r....r....r..', { r: SIDES[side].trim[0] }, [0, 1])),
    },
    {
      name: 'horse_head',
      bone: 'pump',
      origin: [-16, py - 6, pz - 2],
      size: [4, 11, 4],
      paint: body,
      stamps: [mark('head_face', 'west', 'kkkk', { k: SIDES[side].trim[0] }, [0, 0])],
    },
    { name: 'horse_head_tip', bone: 'pump', origin: [-17, py - 4, pz - 1.5], size: [1, 7, 3], paint: trim },
    { name: 'bridle', bone: 'bridle', origin: [BRIDLE_TOP[0] - 0.5, 4, pz - 0.5], size: [1, BRIDLE_TOP[1] - 4, 1], paint: 'gun' },
    {
      name: 'gearbox',
      origin: [6, 4, pz - 2.5],
      size: [6, 7, 5],
      paint: trim,
      stamps: [mark('gearbox_plate', 'north', 'hh/hh', { h: '#c3cbd9' }, [2, 2])],
    },
    ...[-1, 1].map((sideSign) => ({
      name: `counterweight_${sideSign < 0 ? 'front' : 'back'}`,
      bone: 'crank',
      origin: [CRANK_PIVOT[0] - 3, CRANK_PIVOT[1] - 5, CRANK_PIVOT[2] + sideSign * 4.5 - 0.5],
      size: [6, 7, 1],
      paint: 'oil_black',
      stamps: [mark('weight_stripe', sideSign < 0 ? 'north' : 'south', 'yyyyyy', { y: STRIPE_YELLOW }, [0, 0])],
    })),
    ...[-1, 1].map((sideSign) => ({
      name: `crank_hub_${sideSign < 0 ? 'front' : 'back'}`,
      bone: 'crank',
      origin: [CRANK_PIVOT[0] - 1, CRANK_PIVOT[1] - 1, CRANK_PIVOT[2] + sideSign * 3.5 - 0.5],
      size: [2, 2, 1],
      paint: 'metal',
    })),
    {
      name: 'motor',
      origin: [8, 4, 2],
      size: [5, 4, 4],
      paint: 'metal',
      stamps: [mark('motor_fins', 'east', 'k.k./k.k.', { k: DARK_METAL }, [0, 1])],
    },
    { name: 'wellhead', origin: [-18, 2, pz - 1.5], size: [3, 5, 3], paint: 'metal' },
    { name: 'wellhead_valve', origin: [-18.5, 5, pz - 2], size: [4, 1, 4], paint: 'warhead' },
  ];
}

/**
 * Una pieza recta de un punto a otro (una pata, un tubo): un cubo de esa seccion girado para que vaya
 * de `from` a `to` (el mismo calculo que los brazos de las unidades).
 */
function limbBetween(name, bone, from, to, section, paint) {
  const [dx, dy, dz] = to.map((value, axis) => value - from[axis]);
  const length = Math.max(1, Math.round(Math.hypot(dx, dy, dz)));
  const toDegrees = (radians) => Math.round((radians * 180) / Math.PI / 0.5) * 0.5;
  return {
    name,
    bone,
    origin: [from[0] - section / 2, from[1] - section / 2, from[2] - length],
    size: [section, section, length],
    paint,
    rotation: [toDegrees(Math.atan2(dy, -dz)), toDegrees(Math.asin(-dx / length)), 0],
    pivot: from,
  };
}

/** El deposito de crudo (redondeado: dos piezas en cruz), con su escalera, la tuberia hasta el pozo y los bidones. */
function oilStorage(side) {
  return [
    {
      name: 'tank',
      origin: [-12, 2, 4],
      size: [12, 12, 8],
      paint: `body_${side}`,
      stamps: ['north', 'south'].map((face) => mark('tank_band', face, 'kkkkkkkkkkkk', { k: SIDES[side].trim[0] }, [0, 3])),
    },
    { name: 'tank_round', origin: [-10, 2, 2], size: [8, 12, 12], paint: `body_${side}` },
    { name: 'tank_top', origin: [-9, 14, 3], size: [6, 1, 10], paint: `trim_${side}` },
    {
      name: 'tank_ladder',
      origin: [0, 2, 7],
      size: [1, 12, 2],
      paint: 'metal',
      stamps: [mark('ladder_rungs', 'east', Array(6).fill('kk/..').join('/'), { k: DARK_METAL }, [0, 0])],
    },
    { name: 'pipe_to_tank', origin: [-17, 3, 0], size: [2, 2, 5], paint: 'gun' },
    { name: 'pipe_along', origin: [-15, 3, 3], size: [3, 2, 2], paint: 'gun' },
    ...[0, 1, 2].map((index) => ({
      name: `barrel_${index}`,
      origin: [4 + index * 3.5, 2, 9],
      size: [3, 5, 3],
      paint: index === 1 ? 'warhead' : 'oil_black',
      stamps: [mark('barrel_band', 'north', 'kkk/.../kkk', { k: '#3a3a3a' }, [0, 1])],
    })),
  ];
}

const oil = (side) => ({
  cubes: [plinth(), ...pumpjack(side), ...oilStorage(side)],
  bones: withBones([
    { name: 'pump', pivot: PUMP_PIVOT },
    { name: 'bridle', parent: 'pump', pivot: BRIDLE_TOP },
    { name: 'pitman', parent: 'pump', pivot: PITMAN_TOP },
    { name: 'crank', pivot: CRANK_PIVOT },
  ]),
  motions: {
    idle: loopMotion(2.4, [
      sway('pump', [0, 0, PUMP_NOD], 2.4),
      sway('bridle', [0, 0, -PUMP_NOD], 2.4),
      sway('pitman', [0, 0, -PUMP_NOD], 2.4),
      spin('crank', 2.4, { axis: 2, symmetry: 360, steps: 8, sign: 1 }),
    ]),
  },
});

// ---- La fabrica ----

/** Un diente del tejado de sierra: un prisma a 45 grados medio hundido en la nave (medio bloque mas corto que ella por cada lado, para no pelear con sus paredes ni sus ventanas), con cristales en una vertiente. */
const SAW_TOOTH = 7;
const sawTooth = (side, centerX, index) => ({
  name: `tooth${index}`,
  origin: [centerX - SAW_TOOTH / 2, 14 - SAW_TOOTH / 2, -8.5],
  size: [SAW_TOOTH, SAW_TOOTH, 17],
  paint: `trim_${side}`,
  rotation: [0, 0, 45],
  pivot: [centerX, 14, 0],
  stamps: [mark('glazing', 'east', Array(3).fill('g'.repeat(17)).join('/'), { g: '#9fe3ff' }, [0, 2])],
});

/** La nave: ventanas en fila, el gran porton con franjas de peligro, la oficina pegada y el tejado de sierra. */
function factoryHall(side) {
  return [
    {
      name: 'hall',
      origin: [-13, 2, -9],
      size: [26, 12, 18],
      paint: `body_${side}`,
      stamps: [
        mark('hall_windows', 'north', windowGrid(7, 1, 1), WINDOW_COLORS, [2, 1]),
        mark('loading_door', 'north', ['kkkkkkkkkk', ...Array(5).fill('k........k')].join('/'), { k: SIDES[side].trim[0] }, [8, 6]),
        ...['east', 'west'].map((face) => mark('hall_side_windows', face, windowGrid(5, 1, 2), WINDOW_COLORS, [1, 1])),
      ],
    },
    {
      name: 'roller_door',
      origin: [-4, 2, -10],
      size: [8, 6, 1],
      paint: 'metal',
      stamps: [mark('roller_lines', 'north', Array(3).fill('kkkkkkkk/........').join('/'), { k: DARK_METAL }, [0, 0])],
    },
    {
      name: 'door_stripes',
      origin: [-5, 8, -10.5],
      size: [10, 1, 1],
      paint: 'lamp',
      stamps: [mark('door_hazard', 'north', 'ykykykykyk', { y: STRIPE_YELLOW, k: STRIPE_BLACK }, [0, 0])],
    },
    ...[-8, 0, 8].map((x, index) => sawTooth(side, x, index)),
    {
      name: 'office',
      origin: [-14, 2, -14],
      size: [8, 8, 5],
      paint: `trim_${side}`,
      stamps: [
        mark('office_windows', 'north', windowGrid(2, 1, 3), WINDOW_COLORS, [0, 1]),
        mark('office_door', 'north', 'dd/dd/dd', { d: WINDOW }, [5, 5]),
      ],
    },
  ];
}

/** Las chimeneas de ladrillo, con franjas blancas y rojas arriba (el humo lo pone el juego), el silo y la tuberia. */
const FACTORY_STACKS = [
  ...[
    [5, 12, 26],
    [11, 12, 20],
  ].flatMap(([x, z, height], index) => [
    {
      name: `stack_${index}`,
      origin: [x - 2, 2, z - 2],
      size: [4, height, 4],
      paint: 'brick',
      stamps: FACES_AROUND.map((face) => mark('stack_bands', face, 'wwww/rrrr/wwww', { w: FRAME, r: RED_LIGHT }, [0, 1])),
    },
    { name: `stack_cap_${index}`, origin: [x - 2.5, 2 + height, z - 2.5], size: [5, 1, 5], paint: 'oil_black' },
  ]),
  {
    name: 'silo',
    origin: [-13, 2, 9],
    size: [6, 14, 6],
    paint: 'metal',
    stamps: [mark('silo_bands', 'north', 'kkkkkk/....../....../kkkkkk', { k: DARK_METAL }, [0, 3])],
  },
  { name: 'silo_top', origin: [-12, 16, 10], size: [4, 2, 4], paint: 'metal' },
  { name: 'silo_pipe', origin: [-7, 12, 11], size: [6, 2, 2], paint: 'gun' },
];

const factory = (side) => ({ cubes: [plinth(), ...factoryHall(side), ...FACTORY_STACKS, ...streetLamp('lamp', [12, -13])] });

// ---- El fuerte: un bunker en cupula ----

/** La cupula de anillos (cada vez mas estrechos), con troneras alrededor, la escotilla y el periscopio arriba. */
const DOME_RINGS = [
  [22, 6],
  [19, 5],
  [16, 4],
  [12, 3],
  [8, 2],
];
/** Lo alto de la cupula (encima de la losa). */
const DOME_TOP = 2 + DOME_RINGS.reduce((total, [, height]) => total + height, 0);
const BUNKER_FLAG = [-5, DOME_TOP - 2, 2];
const BUNKER_FLAG_HEIGHT = 10;

function bunkerDome(side) {
  const body = `body_${side}`;
  const rings = DOME_RINGS;
  let floor = 2;
  const dome = rings.map(([width, height], index) => {
    const ring = {
      name: `ring${index}`,
      origin: [-width / 2, floor, -width / 2],
      size: [width, height, width],
      paint: index % 2 ? `trim_${side}` : body,
    };
    floor += height;
    return ring;
  });
  dome[1].stamps = FACES_AROUND.map((face) => mark(`slits_${face}`, face, '.kkk...kkkk...kkk..', { k: WINDOW }, [0, 2]));
  return [
    ...dome,
    {
      name: 'hatch',
      origin: [-3, floor, -3],
      size: [6, 1, 6],
      paint: 'metal',
      stamps: [mark('hatch_wheel', 'up', '.k./kkk/.k.', { k: DARK_METAL }, [1, 1])],
    },
    {
      name: 'periscope',
      origin: [3, floor - 1, -3],
      size: [2, 4, 2],
      paint: 'gun',
      stamps: [mark('periscope_glass', 'north', 'gg', { g: '#9fe3ff' }, [0, 0])],
    },
    ...flagpole(side, 'flag', BUNKER_FLAG, BUNKER_FLAG_HEIGHT),
  ];
}

/** La entrada: el tunel blindado con su puerta y franjas, y sacos terreros a los dos lados. */
function bunkerEntrance(side) {
  const sandbags = [-1, 1].flatMap((sideSign) =>
    [0, 1].map((row) => ({
      name: `sandbags_${sideSign < 0 ? 'left' : 'right'}_${row}`,
      origin: [sideSign < 0 ? -12 + row : 5, 2 + row * 3, -14],
      size: [7 - row, 3, 3],
      paint: 'sandbag',
      stamps: [mark(`sandbag_seams${7 - row}`, 'north', 'd'.repeat(7 - row), { d: '#a88a5a' }, [0, 0])],
    })),
  );
  return [
    {
      name: 'entrance',
      origin: [-5, 2, -15],
      size: [10, 8, 4],
      paint: `trim_${side}`,
      stamps: [
        mark('bunker_door', 'north', ['kkkkkk', ...Array(5).fill('kmmmmk')].join('/'), { k: STRIPE_BLACK, m: '#4e5666' }, [2, 2]),
        mark('entrance_hazard', 'north', 'ykykykykyk', { y: STRIPE_YELLOW, k: STRIPE_BLACK }, [0, 0]),
      ],
    },
    ...sandbags,
  ];
}

const stronghold = (side) => ({
  cubes: [plinth(), ...bunkerDome(side), ...bunkerEntrance(side)],
  bones: withBones([{ name: 'flag', pivot: flagPivot(BUNKER_FLAG, BUNKER_FLAG_HEIGHT) }]),
  motions: { idle: loopMotion(1.4, [flagWave('flag', 1.4)]) },
});

// ---- El aeropuerto ----

/** La pista: asfalto con la linea discontinua blanca, el borde amarillo y las luces. */
const RUNWAY = [
  {
    name: 'runway',
    origin: [-16, 0, -16],
    size: [32, 2, 32],
    paint: 'asphalt',
    stamps: [
      mark('runway_dashes', 'up', 'ww...ww...ww...ww...ww...ww', { w: '#f2f5ff' }, [3, 27]),
      mark('runway_edge', 'up', 'y'.repeat(30), { y: STRIPE_YELLOW }, [1, 30]),
    ],
  },
  ...[-14, -6, 2, 10].map((x, index) => ({
    name: `runway_light_${index}`,
    origin: [x, 2, 13],
    size: [1, 1, 1],
    paint: index % 2 ? 'lamp' : 'warhead',
  })),
];

/** La torre de control: fuste con ventanas, la cabina de cristal con su marco, el tejado, el radar y la luz. */
function controlTower(side) {
  return [
    {
      name: 'tower',
      origin: [-14, 2, -14],
      size: [8, 18, 8],
      paint: `body_${side}`,
      stamps: [
        mark('tower_windows', 'north', windowGrid(2, 3, 2), WINDOW_COLORS, [0, 3]),
        mark('tower_door', 'north', 'dd/dd/dd', { d: WINDOW }, [3, 15]),
      ],
    },
    { name: 'cab_floor', origin: [-15, 20, -15], size: [10, 1, 10], paint: `trim_${side}` },
    {
      name: 'cab',
      origin: [-15, 21, -15],
      size: [10, 5, 10],
      paint: 'window_glass',
      stamps: FACES_AROUND.map((face) =>
        mark(
          'cab_mullions',
          face,
          ['k...k....k', 'k...k....k', 'k...k....k', 'k...k....k', 'k...k....k'].join('/'),
          { k: '#2a3a48' },
          [0, 0],
        ),
      ),
    },
    { name: 'cab_roof', origin: [-15.5, 26, -15.5], size: [11, 1, 11], paint: `trim_${side}` },
    { name: 'radar_mast', origin: [-11, 27, -11], size: [2, 2, 2], paint: 'metal' },
    {
      name: 'radar_dish',
      bone: 'radar',
      origin: [-14, 29, -10.5],
      size: [8, 3, 1],
      paint: 'metal',
      stamps: [mark('radar_grid', 'north', 'k.k.k.k./.k.k.k.k/k.k.k.k.', { k: DARK_METAL }, [0, 0])],
    },
  ];
}

/** El hangar: nave del equipo con el tejado redondeado a escalones y el gran porton con franjas. */
function hangar(side) {
  const body = `body_${side}`;
  return [
    {
      name: 'hangar',
      origin: [-3, 2, -10],
      size: [18, 9, 16],
      paint: body,
      stamps: [
        mark(
          'hangar_door',
          'north',
          ['yyyyyyyyyyyyyy', ...Array(6).fill('kkkkkkkkkkkkkk')].join('/'),
          { y: STRIPE_YELLOW, k: '#2a2e38' },
          [2, 2],
        ),
      ],
    },
    { name: 'hangar_roof_1', origin: [-2, 11, -10], size: [16, 2, 16], paint: body },
    { name: 'hangar_roof_2', origin: [0, 13, -10], size: [12, 2, 16], paint: `trim_${side}` },
    { name: 'hangar_roof_3', origin: [3, 15, -10], size: [6, 1, 16], paint: `trim_${side}` },
  ];
}

/** La manga de viento: el poste y la manga naranja con franjas blancas, que ondea. */
const WINDSOCK = [
  { name: 'windsock_pole', origin: [12, 2, 9], size: [1, 12, 1], paint: 'metal' },
  {
    name: 'windsock',
    bone: 'windsock',
    origin: [13, 12, 8.5],
    size: [6, 2, 2],
    paint: 'windsock',
    stamps: [mark('windsock_bands', 'north', '..ww..', { w: FRAME }, [0, 0])],
  },
];

const airport = (side) => ({
  cubes: [...RUNWAY, ...controlTower(side), ...hangar(side), ...WINDSOCK],
  bones: withBones([
    { name: 'radar', pivot: [-10, 29, -10] },
    { name: 'windsock', pivot: [13, 13, 9.5] },
  ]),
  motions: { idle: loopMotion(2.4, [radarSpin('radar'), sway('windsock', [0, 15, 6], 2.4)]) },
});

// ---- La base: el cuartel general ----

/** Los dos edificios del cuartel: el alto con ventanas y la puerta, el bajo, la pasarela que los une, el radar y la antena. */
function headquarters(side) {
  const body = `body_${side}`;
  const trim = `trim_${side}`;
  return [
    { name: 'platform', origin: [-14, 2, -12], size: [28, 3, 24], paint: trim },
    {
      name: 'tall',
      origin: [-12, 5, -6],
      size: [10, 24, 10],
      paint: body,
      stamps: [
        ...['north', 'east', 'west', 'south'].map((face, index) =>
          mark(`tall_windows_${face}`, face, windowGrid(3, 5, index), WINDOW_COLORS, [0, 1]),
        ),
        mark('tall_door', 'north', 'dddd/dggd/dggd/dggd', { d: '#2a3a48', g: '#9fe3ff' }, [3, 20]),
      ],
    },
    { name: 'tall_roof', origin: [-12.5, 29, -6.5], size: [11, 1, 11], paint: trim },
    {
      name: 'short',
      origin: [2, 5, -4],
      size: [10, 14, 10],
      paint: body,
      stamps: ['north', 'east', 'south'].map((face, index) =>
        mark(`short_windows_${face}`, face, windowGrid(3, 3, index + 2), WINDOW_COLORS, [0, 1]),
      ),
    },
    { name: 'short_roof', origin: [1.5, 19, -4.5], size: [11, 1, 11], paint: trim },
    { name: 'skybridge', origin: [-2, 14, -2], size: [4, 4, 4], paint: 'window_glass' },
    { name: 'radar_mast', origin: [6, 20, 0], size: [2, 3, 2], paint: 'metal' },
    {
      name: 'radar_dish',
      bone: 'radar',
      origin: [3, 23, 0.5],
      size: [8, 4, 1],
      paint: 'metal',
      stamps: [mark('radar_grid', 'north', 'k.k.k.k./.k.k.k.k/k.k.k.k./.k.k.k.k', { k: DARK_METAL }, [0, 0])],
    },
    { name: 'antenna', origin: [-10, 30, 1], size: [1, 8, 1], paint: 'metal' },
    { name: 'antenna_light', origin: [-10, 38, 1], size: [1, 1, 1], paint: 'warhead' },
  ];
}

/** La entrada del cuartel: la garita y la barrera con franjas, y los sacos a los lados. */
const BASE_GATE = [
  {
    name: 'guard_box',
    origin: [6, 5, -12],
    size: [5, 6, 4],
    paint: 'metal',
    stamps: [mark('guard_window', 'north', 'gg/gg', { g: '#9fe3ff' }, [1, 1])],
  },
  { name: 'guard_roof', origin: [5.5, 11, -12.5], size: [6, 1, 5], paint: 'asphalt' },
  {
    name: 'barrier',
    origin: [-6, 8, -14],
    size: [12, 1, 1],
    paint: 'lamp',
    stamps: [mark('barrier_stripes', 'north', 'ykykykykykyk', { y: RED_LIGHT, k: FRAME }, [0, 0])],
  },
  { name: 'barrier_post', origin: [5, 5, -14], size: [1, 4, 1], paint: 'metal' },
  ...[-14, -10].map((x, index) => ({
    name: `base_sandbags_${index}`,
    origin: [x, 5, -12],
    size: [4, 3, 3],
    paint: 'sandbag',
    stamps: [mark('base_sandbag_seam', 'north', 'dddd', { d: '#a88a5a' }, [0, 0])],
  })),
];

const BASE_FLAG = [12, 5, 8];
const BASE_FLAG_HEIGHT = 14;

const base = (side) => ({
  cubes: [...headquarters(side), ...BASE_GATE, ...flagpole(side, 'flag', BASE_FLAG, BASE_FLAG_HEIGHT)],
  bones: withBones([
    { name: 'flag', pivot: flagPivot(BASE_FLAG, BASE_FLAG_HEIGHT) },
    { name: 'radar', pivot: [7, 23, 1] },
  ]),
  motions: { idle: loopMotion(2.4, [flagWave('flag', 2.4), radarSpin('radar')]) },
});

const BUILDINGS = { City: city, Base: base, Factory: factory, Oil: oil, Stronghold: stronghold, Airport: airport };

export const MODELS = Object.fromEntries(
  Object.entries(BUILDINGS).flatMap(([building, build]) =>
    Object.keys(SIDES).map((side) => [`${building.toLowerCase()}_${side}`, { detail: DETAIL, ...build(side) }]),
  ),
);
