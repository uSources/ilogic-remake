// Las unidades para Ashfox, a semejanza de las del 2D (public/assets/img/u): la infanteria es un
// muñeco chibi (cabeza y casco grandes, gafas, cinturon y su arma) y los vehiculos, de juguete, lisos
// del color de su equipo con el borde de arriba mas claro, como en el pixel art. Un modelo por unidad y
// equipo: `<unidad en minusculas>_<equipo>` (blue o red). Miran al norte (-z) y se apoyan en y = 0.
// Cada uno trae sus animaciones: 'idle' (quieto), 'drive' (moviendose: las piernas andan, las ruedas
// giran, el casco se balancea) y 'fire' (al disparar). La torreta es el hueso 'turret' (la gira el
// juego para apuntar) y el rotor del helicoptero, 'rotor'. Lo escribe generate.mjs.

import { kick, loopMotion, onceMotion, recoil, spin, sway } from './motions.mjs';

/** Los colores de cada equipo: el suyo y el oscuro (rampa de sombra, medio y luz) y sus bordes claros. */
const SIDES = {
  blue: {
    team: ['#2766c4', '#2f74d6', '#3d84e2'],
    teamRim: '#6fb0f2',
    dark: ['#1a468e', '#1f56a8', '#2a64b8'],
    darkRim: '#3f7ccc',
  },
  red: {
    team: ['#b02824', '#c8302a', '#d84038'],
    teamRim: '#f2786c',
    dark: ['#80181a', '#962220', '#a82c28'],
    darkRim: '#c04a40',
  },
};

const BROWN = '#5a3a22';
const EYE = '#1d2a4a';
const SKIN = '#f1c79b';
const LENS = '#a8dcec';
const HUB = '#8a93a6';
const WINDOW_GLASS = '#9fe3ff';
const HEADLIGHT = '#ffe066';
const SLOT = '#141824';

export const PAINTS = {
  skin: { ramp: ['#e4b88c', '#f1c79b', '#f8d4ac'] },
  boot: { ramp: ['#3a3430', '#4c443c', '#5e544a'] },
  gun: { ramp: ['#2a2e38', '#343a46', '#3e4554'] },
  steel: { ramp: ['#7a8394', '#8a93a6', '#9aa3b6'] },
  riot: { ramp: ['#4a505c', '#5a606c', '#6a707c'], rim: '#9aa0ac' },
  tread: { ramp: ['#1a1e28', '#232836', '#2c3242'] },
  tire: { ramp: ['#14171e', '#1c2029', '#252a35'] },
  rubber: { ramp: ['#262a34', '#30353f', '#3a404c'] },
  glass: { ramp: ['#8ad4f4', '#9fe3ff', '#b8ecff'] },
  canvas: { ramp: ['#b8a8a0', '#c8b8b0', '#d6c8c0'] },
  crate: { ramp: ['#94592a', '#a8692f', '#b8783a'] },
  pack: { ramp: ['#6a462a', '#7e5432', '#8e6040'] },
  sandbag: { ramp: ['#c4a670', '#d2b47e', '#dec28e'] },
  missile: { ramp: ['#e2e6ee', '#eef2fa', '#f8faff'] },
  warhead: { ramp: ['#c02830', '#d8323a', '#e8484e'] },
  lamp: { ramp: ['#e8c020', '#f8d838', '#fff070'] },
  blur: { ramp: ['#8fb8d8', '#a8cce6', '#c0dcf0'] },
  ...Object.fromEntries(
    Object.entries(SIDES).flatMap(([side, colors]) => [
      [`team_${side}`, { ramp: colors.team, rim: colors.teamRim }],
      [`dark_${side}`, { ramp: colors.dark, rim: colors.darkRim }],
      // El casco de camuflaje del mortero (el unico con manchas en el 2D).
      [`camo_${side}`, { ramp: colors.team, blotch: { ramp: ['#4a4a2a', '#6a6a3a', '#8a7a4a'], scale: [1, 1, 1], density: 0.5 } }],
    ]),
  ),
};

// ---- Stamps: detalles pintados en las caras ----

const FACES_AROUND = ['north', 'south', 'east', 'west'];
const widthOn = (face, [width, , depth]) => (face === 'north' || face === 'south' ? width : depth);

/** Una banda de un color en la fila `row` de los cuatro lados de un cubo de ese tamaño (cinturones, correas). */
const band = (name, size, row, color) =>
  FACES_AROUND.map((face) => {
    const width = widthOn(face, size);
    return { name: `${name}${width}`, face, pixels: 'x'.repeat(width), colors: { x: color }, at: [[0, row]] };
  });

/** Una sola pieza en una cara (`pixels` con filas separadas por /), en (x, y) desde arriba a la izquierda. */
const mark = (name, face, pixels, colors, at) => ({ name, face, pixels, colors, at: [at] });

/** Los ojos: `rows` de alto (dos, grandes), separados en la cara de una cabeza de ese ancho. */
function eyes(width, rows = 2) {
  const narrow = width < 5;
  const pair = `k${'.'.repeat(narrow ? 2 : width - 4)}k`;
  return mark('eyes', 'north', Array(rows).fill(pair).join('/'), { k: EYE }, [narrow ? 0 : 1, 1]);
}

/** Las gafas sobre el casco: dos cristales delante y la correa marron alrededor, en su fila del medio. */
function goggles(size, row) {
  const width = size[0];
  const front = width >= 7 ? `b${'gg'}b${'gg'}b`.padEnd(width, 'b') : `b${'g'.repeat(width - 2)}b`;
  return [
    ...band('strap', size, row, BROWN).filter((stamp) => stamp.face !== 'north'),
    mark(`goggles${width}`, 'north', front, { b: BROWN, g: LENS }, [0, row]),
  ];
}

// ---- Infanteria: el muñeco chibi ----

/** Los huesos del muñeco: piernas, cuerpo, cabeza y brazos (de las caderas, a 5 de alto). */
const CHIBI_BONES = [
  { name: 'leg_left', parent: 'root', pivot: [-1.5, 5, 0] },
  { name: 'leg_right', parent: 'root', pivot: [1.5, 5, 0] },
  { name: 'torso', parent: 'root', pivot: [0, 5, 0] },
  { name: 'head', parent: 'torso', pivot: [0, 9, 0] },
  { name: 'arm_left', parent: 'torso', pivot: [-3.5, 8.5, 0] },
  { name: 'arm_right', parent: 'torso', pivot: [3.5, 8.5, 0] },
];

const TORSO = [5, 4, 3];
const ARM = [2, 3, 2];
const HELMET = [7, 3, 7];

/**
 * El muñeco de un equipo. `look` dice lo que cambia de uno a otro: la pintura del casco, si lleva
 * gafas (`goggles`), pasamontañas (`mask`), chaleco a rayas (`vest`) o el brazo del arma señalando
 * al frente (`pointing`).
 */
function chibi(side, look = {}) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const torsoStamps = [...band('belt', TORSO, 3, BROWN), ...(look.vest ? band('vest', TORSO, 1, darkColor) : [])];
  const faceStamps = look.mask
    ? [eyes(6, 1), mark('mask', 'north', 'mmmmmm/mmmmmm', { m: darkColor }, [0, 2]), ...maskSides(darkColor)]
    : [eyes(6)];
  const hands = band('hand', ARM, 2, SKIN);
  return [
    { name: 'boot_left', bone: 'leg_left', origin: [-2.5, 0, -1.5], size: [2, 1, 3], paint: 'boot' },
    { name: 'leg_left', bone: 'leg_left', origin: [-2.5, 1, -1], size: [2, 4, 2], paint: dark },
    { name: 'boot_right', bone: 'leg_right', origin: [0.5, 0, -1.5], size: [2, 1, 3], paint: 'boot' },
    { name: 'leg_right', bone: 'leg_right', origin: [0.5, 1, -1], size: [2, 4, 2], paint: dark },
    { name: 'torso', bone: 'torso', origin: [-2.5, 5, -1.5], size: TORSO, paint: team, stamps: torsoStamps },
    { name: 'head', bone: 'head', origin: [-3, 9, -3], size: [6, 4, 6], paint: 'skin', stamps: faceStamps },
    {
      name: 'helmet',
      bone: 'head',
      origin: [-3.5, 12, -3.5],
      size: HELMET,
      paint: look.helmet ?? team,
      stamps: look.goggles ? goggles(HELMET, 1) : [],
    },
    { name: 'helmet_top', bone: 'head', origin: [-2.5, 15, -2.5], size: [5, 1, 5], paint: look.helmet ?? team },
    { name: 'neck_guard', bone: 'head', origin: [-3.5, 10, 2.5], size: [7, 2, 1], paint: look.helmet ?? team },
    { name: 'arm_left', bone: 'arm_left', origin: [-4.5, 6, -1], size: ARM, paint: team, stamps: hands },
    look.pointing
      ? {
          name: 'arm_right',
          bone: 'arm_right',
          origin: [2.5, 7, -5.5],
          size: [2, 2, 5],
          paint: team,
          stamps: [mark('hand', 'north', 'ss/ss', { s: SKIN }, [0, 0])],
        }
      : { name: 'arm_right', bone: 'arm_right', origin: [2.5, 6, -1], size: ARM, paint: team, stamps: hands },
  ];
}

/** El pasamontañas por los lados de la cabeza (las dos filas de abajo). */
const maskSides = (color) => ['east', 'west'].map((face) => mark('mask_side', face, 'mmmmmm/mmmmmm', { m: color }, [0, 2]));

/** Andar: piernas y brazos a destiempo; respirar: la cabeza y el cuerpo; disparar: el brazo del arma. */
const CHIBI_MOTIONS = {
  idle: loopMotion(1.6, [sway('torso', [0, 4, 0], 1.6), sway('head', [3, 0, 2], 1.6)]),
  drive: loopMotion(
    0.5,
    [
      sway('leg_left', [30, 0, 0], 0.5),
      sway('leg_right', [-30, 0, 0], 0.5),
      sway('arm_left', [-25, 0, 0], 0.5),
      sway('torso', [0, 0, 3], 0.5),
    ],
    'linear',
  ),
  fire: onceMotion(0.4, [kick('arm_right', 18), kick('torso', 6)]),
};

/** Lo que lleva aparte, en el suelo (el mortero y sus sacos): no se mueve con el muñeco. */
const GEAR_BONE = { name: 'gear', parent: 'root', pivot: [0, 0, 0] };
const infantry = (side, look, gear) => ({
  bones: [...CHIBI_BONES, GEAR_BONE],
  cubes: [...chibi(side, look), ...gear(side)],
  motions: CHIBI_MOTIONS,
});

/** El fusilero: fusil a la cintura, al frente (culata marron), y mochila. */
const rifleman = (side) =>
  infantry(side, { goggles: true }, () => [
    { name: 'stock', bone: 'arm_right', origin: [1, 6, -3.5], size: [1, 2, 2], paint: 'pack' },
    { name: 'rifle', bone: 'arm_right', origin: [1, 7, -9.5], size: [1, 1, 6], paint: 'gun' },
    {
      name: 'backpack',
      bone: 'torso',
      origin: [-2.5, 5, 1.5],
      size: [5, 4, 2],
      paint: 'pack',
      stamps: [mark('flap', 'south', 'ddddd', { d: BROWN }, [0, 1])],
    },
  ]);

/** El del bazuca: el tubo al hombro, largo, con sus bocas y la mira. */
const bazooka = (side) =>
  infantry(side, { vest: true }, () => [
    { name: 'tube', bone: 'arm_right', origin: [3, 9, -6], size: [2, 2, 11], paint: 'gun' },
    { name: 'muzzle', bone: 'arm_right', origin: [2.5, 8.5, -6.5], size: [3, 3, 1], paint: 'steel' },
    { name: 'breech', bone: 'arm_right', origin: [2.5, 8.5, 4.5], size: [3, 3, 1], paint: 'steel' },
    { name: 'sight', bone: 'arm_right', origin: [3.5, 11, -3], size: [1, 1, 2], paint: 'steel' },
  ]);

/** El del escudo: pasamontañas y un escudo antidisturbios alto, delante a la izquierda, con su mirilla. */
const shield = (side) =>
  infantry(side, { mask: true }, () => [
    {
      name: 'shield',
      bone: 'arm_left',
      origin: [-7.5, 1, -4.5],
      size: [6, 10, 1],
      paint: 'riot',
      stamps: [mark('visor', 'north', 'gggg/gggg', { g: '#2a3a48' }, [1, 2]), mark('rivets', 'north', 'r....r', { r: '#8a909c' }, [0, 8])],
    },
  ]);

/** El del mortero: casco de camuflaje, señala al frente; delante, sacos terreros y el tubo asomando. */
const mortar = (side) =>
  infantry(side, { helmet: `camo_${side}`, goggles: true, pointing: true }, () => [
    { name: 'base_plate', bone: 'gear', origin: [-2, 0, -5.5], size: [4, 1, 3], paint: 'steel' },
    { name: 'tube', bone: 'gear', origin: [-1, 1, -5], size: [2, 5, 2], paint: 'gun', rotation: [-30, 0, 0], pivot: [0, 1, -4] },
    { name: 'sandbags', bone: 'gear', origin: [-5, 0, -8], size: [10, 2, 3], paint: 'sandbag', stamps: [sandbagSeams(10)] },
    { name: 'sandbags_top', bone: 'gear', origin: [-3, 2, -8], size: [6, 2, 3], paint: 'sandbag', stamps: [sandbagSeams(6)] },
  ]);

/** Las juntas entre saco y saco, de frente. */
const sandbagSeams = (width) => mark(`seams${width}`, 'north', `${'..d'.repeat(width / 2).slice(0, width - 1)}`, { d: '#a88a5a' }, [0, 1]);

// ---- Vehiculos de orugas ----

const VEHICLE_BONES = (turretPivot, barrelPivot) => [
  { name: 'chassis', parent: 'root', pivot: [0, 2, 0] },
  { name: 'hull', parent: 'root', pivot: [0, 3, 0] },
  { name: 'turret', parent: 'hull', pivot: turretPivot },
  { name: 'barrel', parent: 'turret', pivot: barrelPivot },
];
const VEHICLE_MOTIONS = {
  idle: loopMotion(1.2, [sway('hull', [0.6, 0, 0.4], 1.2)]),
  drive: loopMotion(0.4, [sway('hull', [-2, 0, 1], 0.4)]),
  fire: onceMotion(0.5, [recoil('barrel'), kick('hull', 5)]),
};

/** De lado, una oruga: las ruedas (cuadros grises con hueco) y los eslabones de arriba y abajo. */
function trackSide(length) {
  const wheels = `.${'ss.'.repeat(Math.floor((length - 1) / 3))}`;
  const pixels = ['t'.repeat(length), wheels.padEnd(length, '.'), wheels.padEnd(length, '.'), 't'.repeat(length)].join('/');
  return { pixels, colors: { s: '#5a6272', t: '#363d4c' } };
}

/** Orugas a los lados, de ese ancho total y largo, con sus ruedas por fuera y la rueda dentada delante y detras. */
const tracks = (width, length) =>
  [-1, 1].map((sideSign, index) => {
    const side = trackSide(length);
    return {
      name: `track${index}`,
      bone: 'chassis',
      origin: [sideSign < 0 ? -width / 2 : width / 2 - 4, 0, -length / 2],
      size: [4, 4, length],
      paint: 'tread',
      stamps: [
        mark(`wheels${length}`, sideSign < 0 ? 'west' : 'east', side.pixels, side.colors, [0, 0]),
        mark('sprocket', 'north', 'ss/ss', { s: '#6a7282' }, [1, 1]),
        mark('sprocket', 'south', 'ss/ss', { s: '#6a7282' }, [1, 1]),
      ],
    };
  });

function tank(side) {
  const team = `team_${side}`;
  return {
    bones: VEHICLE_BONES([0, 6, 0.5], [0, 7.5, -3]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(14, 14),
      { name: 'hull', bone: 'hull', origin: [-6, 3, -6.5], size: [12, 3, 13], paint: team },
      { name: 'turret', bone: 'turret', origin: [-4, 6, -3], size: [8, 3, 7], paint: team },
      { name: 'turret_top', bone: 'turret', origin: [-3, 9, -2], size: [6, 1, 5], paint: team },
      { name: 'hatch', bone: 'turret', origin: [-2, 10, 0], size: [2, 1, 2], paint: `dark_${side}` },
      { name: 'mantlet', bone: 'turret', origin: [-2.5, 6.5, -4], size: [5, 2, 1], paint: `dark_${side}` },
      { name: 'barrel_left', bone: 'barrel', origin: [-2, 7, -11], size: [1, 1, 8], paint: 'steel' },
      { name: 'barrel_right', bone: 'barrel', origin: [1, 7, -11], size: [1, 1, 8], paint: 'steel' },
    ],
  };
}

function lightTank(side) {
  const team = `team_${side}`;
  return {
    bones: VEHICLE_BONES([0, 5, 0], [0, 6.5, -2.5]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 11),
      { name: 'hull', bone: 'hull', origin: [-5, 3, -5.5], size: [10, 2, 11], paint: team },
      { name: 'turret', bone: 'turret', origin: [-3, 5, -2.5], size: [6, 3, 5], paint: team },
      { name: 'turret_top', bone: 'turret', origin: [-2, 8, -1.5], size: [4, 1, 3], paint: team },
      { name: 'barrel', bone: 'barrel', origin: [-0.5, 6, -8.5], size: [1, 1, 6], paint: 'steel' },
      { name: 'muzzle', bone: 'barrel', origin: [-1, 5.5, -9.5], size: [2, 2, 1], paint: 'gun' },
    ],
  };
}

/** El anfibio: casco de barco sobre una falda de goma, y el gran ventilador detras (aspas blancas en su marco). */
function amphibiousTank(side) {
  const team = `team_${side}`;
  const fanSpin = (duration) => spin('fan', duration, { axis: 2, symmetry: 90, sign: 1 });
  return {
    bones: [...VEHICLE_BONES([0, 5, 0], [0, 6.5, -3]), { name: 'fan', parent: 'hull', pivot: [0, 8, 6.5] }],
    motions: {
      idle: loopMotion(1.2, [sway('hull', [0.6, 0, 0.4], 1.2), fanSpin(1.2)]),
      drive: loopMotion(0.4, [sway('hull', [-2, 0, 1], 0.4), fanSpin(0.4)]),
      fire: VEHICLE_MOTIONS.fire,
    },
    cubes: [
      { name: 'skirt', bone: 'chassis', origin: [-7, 0, -7], size: [14, 2, 14], paint: 'rubber' },
      { name: 'hull', bone: 'hull', origin: [-6, 2, -6], size: [12, 3, 12], paint: team },
      { name: 'turret', bone: 'turret', origin: [-3, 5, -3], size: [6, 3, 6], paint: team },
      { name: 'barrel', bone: 'barrel', origin: [-0.5, 6, -10], size: [1, 1, 7], paint: 'steel' },
      { name: 'muzzle', bone: 'barrel', origin: [-1, 5.5, -11], size: [2, 2, 1], paint: 'gun' },
      { name: 'fan_top', bone: 'hull', origin: [-4, 11, 6], size: [8, 1, 1], paint: 'gun' },
      { name: 'fan_bottom', bone: 'hull', origin: [-4, 4, 6], size: [8, 1, 1], paint: 'gun' },
      { name: 'fan_left', bone: 'hull', origin: [-4, 5, 6], size: [1, 6, 1], paint: 'gun' },
      { name: 'fan_right', bone: 'hull', origin: [3, 5, 6], size: [1, 6, 1], paint: 'gun' },
      { name: 'blade_a', bone: 'fan', origin: [-3, 7.5, 6], size: [6, 1, 1], paint: 'missile' },
      { name: 'blade_b', bone: 'fan', origin: [-0.5, 5, 6], size: [1, 6, 1], paint: 'missile' },
    ],
  };
}

/** La artilleria: cañon gordo del color del equipo, alzado, y su artillero (casco y gafas) detras. */
function artillery(side) {
  const team = `team_${side}`;
  const raisedGun = { rotation: [40, 0, 0], pivot: [0, 7.5, 0] };
  const gunnerHelmet = [5, 2, 5];
  return {
    bones: VEHICLE_BONES([0, 5, 2], [0, 7.5, 0]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 13),
      { name: 'hull', bone: 'hull', origin: [-5, 3, -6], size: [10, 2, 12], paint: team },
      { name: 'mount', bone: 'turret', origin: [-3, 5, -1], size: [6, 3, 6], paint: team },
      { name: 'barrel', bone: 'barrel', origin: [-1.5, 6, -10], size: [3, 3, 11], paint: team, ...raisedGun },
      { name: 'muzzle', bone: 'barrel', origin: [-2, 5.5, -11], size: [4, 4, 1], paint: 'gun', ...raisedGun },
      { name: 'gunner', bone: 'turret', origin: [-2, 8, 2], size: [4, 3, 3], paint: team },
      { name: 'gunner_head', bone: 'turret', origin: [-2, 11, 1.5], size: [4, 4, 4], paint: 'skin', stamps: [eyes(4)] },
      {
        name: 'gunner_helmet',
        bone: 'turret',
        origin: [-2.5, 14, 1],
        size: gunnerHelmet,
        paint: team,
        stamps: goggles(gunnerHelmet, 1),
      },
    ],
  };
}

/** El antiaereo: torreta baja y ancha con dos cañones largos y finos, alzados. */
function antiair(side) {
  const team = `team_${side}`;
  const raisedGuns = { rotation: [35, 0, 0], pivot: [0, 8, -1] };
  return {
    bones: VEHICLE_BONES([0, 5, 0.5], [0, 8, -1]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 12),
      { name: 'hull', bone: 'hull', origin: [-5, 3, -5.5], size: [10, 2, 11], paint: team },
      { name: 'turret', bone: 'turret', origin: [-4, 5, -3], size: [8, 2, 7], paint: team },
      { name: 'gun_mount', bone: 'turret', origin: [-2.5, 7, -2], size: [5, 2, 3], paint: `dark_${side}` },
      { name: 'gun_left', bone: 'barrel', origin: [-2, 7.5, -11], size: [1, 1, 10], paint: 'steel', ...raisedGuns },
      { name: 'gun_right', bone: 'barrel', origin: [1, 7.5, -11], size: [1, 1, 10], paint: 'steel', ...raisedGuns },
    ],
  };
}

/** El bloqueador: un cajon blindado mas alto que sus orugas, con remaches, junta y mirilla. */
function blocker(side) {
  const darkColor = SIDES[side].dark[0];
  return {
    bones: VEHICLE_BONES([0, 4, 0], [0, 5, 0]),
    motions: { idle: VEHICLE_MOTIONS.idle, drive: VEHICLE_MOTIONS.drive },
    cubes: [
      ...tracks(14, 13),
      {
        name: 'box',
        bone: 'hull',
        origin: [-6, 3, -6],
        size: [12, 10, 12],
        paint: `team_${side}`,
        stamps: [
          mark('slot', 'north', 'kkkkk', { k: SLOT }, [5, 2]),
          mark('seam', 'north', 'd/d/d/d/d/d/d/d', { d: darkColor }, [3, 1]),
          ...['east', 'west', 'south'].map((face) => mark('rivets', face, '.r..r..r..r.', { r: darkColor }, [0, 2])),
        ],
      },
      { name: 'roof', bone: 'hull', origin: [-5, 13, -5], size: [10, 1, 10], paint: `dark_${side}` },
    ],
  };
}

// ---- Ruedas: jeep, camiones y moto ----

const WHEEL_BONES = [
  { name: 'hull', parent: 'root', pivot: [0, 3, 0] },
  { name: 'wheels_front', parent: 'root', pivot: [0, 3, -5] },
  { name: 'wheels_back', parent: 'root', pivot: [0, 3, 5] },
  { name: 'turret', parent: 'hull', pivot: [0, 7, 2] },
  { name: 'barrel', parent: 'turret', pivot: [0, 8, 0] },
];
const WHEEL_MOTIONS = {
  idle: loopMotion(1.2, [sway('hull', [0.5, 0, 0.5], 1.2)]),
  drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [-1.5, 0, 1], 0.4)], 'linear'),
  fire: onceMotion(0.5, [kick('hull', 4)]),
};

/**
 * Una rueda grande (6 de alto y 2 de ancho, desde `[x, z]`) que se ve redonda: dos piezas en cruz, una
 * alta con los tapacubos grises y otra larga, mas fina, que no asoma por los lados (no pelean las caras).
 */
const wheel = (name, bone, [x, z]) => [
  {
    name,
    bone,
    origin: [x, 0, z + 1],
    size: [2, 6, 4],
    paint: 'tire',
    stamps: ['east', 'west'].map((face) => mark('hub', face, 'hh/hh', { h: HUB }, [1, 2])),
  },
  { name: `${name}_round`, bone, origin: [x + 0.5, 1, z], size: [1, 4, 6], paint: 'tire' },
];

/** Cuatro ruedas en dos ejes (delante y detras), de ese ancho: asoman por los lados de la caja. */
const axles = (width) =>
  ['front', 'back'].flatMap((axle) =>
    [-1, 1].flatMap((sideSign) =>
      wheel(`wheel_${axle}_${sideSign < 0 ? 'left' : 'right'}`, `wheels_${axle}`, [
        sideSign < 0 ? -width / 2 : width / 2 - 2,
        axle === 'front' ? -8 : 2,
      ]),
    ),
  );

/** La cabina de un camion (delante): parabrisas grande, ventanillas, faros y parachoques; y su caja. */
const truckCab = (side) => [
  {
    name: 'cab',
    bone: 'hull',
    origin: [-5, 3, -8],
    size: [10, 7, 5],
    paint: `team_${side}`,
    stamps: [
      mark('windshield', 'north', 'gggggggg/gggggggg/gggggggg', { g: WINDOW_GLASS }, [1, 1]),
      mark('lights', 'north', 'l.kkkkkk.l', { l: HEADLIGHT, k: SLOT }, [0, 5]),
      mark('side_window', 'east', 'ggg/ggg', { g: WINDOW_GLASS }, [1, 1]),
      mark('side_window', 'west', 'ggg/ggg', { g: WINDOW_GLASS }, [1, 1]),
    ],
  },
  { name: 'bumper', bone: 'hull', origin: [-5, 3, -9], size: [10, 1, 1], paint: 'gun' },
  { name: 'bed', bone: 'hull', origin: [-5, 3, -3], size: [10, 2, 11], paint: `dark_${side}` },
];

const truck = (side, cargo) => ({ bones: WHEEL_BONES, motions: WHEEL_MOTIONS, cubes: [...axles(13), ...truckCab(side), ...cargo] });

/** El de transporte: lona rosada con sus costillas. */
const transport = (side) =>
  truck(side, [
    {
      name: 'cover',
      bone: 'hull',
      origin: [-5, 5, -2.5],
      size: [10, 5, 10],
      paint: 'canvas',
      stamps: ['east', 'west'].map((face) => mark('ribs', face, 'd..d..d/d..d..d/d..d..d', { d: '#a8968c' }, [1, 1])),
    },
    { name: 'cover_top', bone: 'hull', origin: [-4, 10, -2.5], size: [8, 1, 10], paint: 'canvas' },
  ]);

/** Una caja de madera con su marco mas oscuro (de lado `size`). */
const crate = (name, origin, size) => {
  const frame = size >= 4 ? 'dddd/d..d/d..d/dddd' : 'ddd/d.d/ddd';
  return {
    name,
    bone: 'hull',
    origin,
    size: [size, size, size],
    paint: 'crate',
    stamps: FACES_AROUND.map((face) => mark(`frame${size}`, face, frame, { d: '#6a3e1c' }, [0, 0])),
  };
};

/** El de suministros: caja abierta con tablas, cajas de madera y un bidon. */
const supplier = (side) =>
  truck(side, [
    { name: 'board_left', bone: 'hull', origin: [-5, 5, -3], size: [1, 1, 11], paint: `dark_${side}` },
    { name: 'board_right', bone: 'hull', origin: [4, 5, -3], size: [1, 1, 11], paint: `dark_${side}` },
    { name: 'board_back', bone: 'hull', origin: [-4, 5, 7], size: [8, 1, 1], paint: `dark_${side}` },
    crate('crate_a', [-4, 5, -2], 4),
    crate('crate_b', [-3.5, 5, 3], 3),
    { name: 'jerrycan', bone: 'hull', origin: [0.5, 5, 0], size: [3, 4, 2], paint: 'steel' },
  ]);

/** El de misiles: el misil blanco de punta y aletas rojas, alzado en su rampa. */
const missileTruck = (side) => {
  const raised = { rotation: [25, 0, 0], pivot: [0, 8, 0] };
  return truck(side, [
    { name: 'rack', bone: 'turret', origin: [-3, 5, 0], size: [6, 2, 6], paint: 'steel' },
    { name: 'missile', bone: 'barrel', origin: [-1.5, 7, -7], size: [3, 3, 12], paint: 'missile', ...raised },
    { name: 'warhead', bone: 'barrel', origin: [-1, 7.5, -9], size: [2, 2, 2], paint: 'warhead', ...raised },
    { name: 'fin_flat', bone: 'barrel', origin: [-2.5, 8, 3], size: [5, 1, 2], paint: 'warhead', ...raised },
    { name: 'fin_up', bone: 'barrel', origin: [-0.5, 6, 3], size: [1, 5, 2], paint: 'warhead', ...raised },
  ]);
};

/** El jeep: conductor con casco y gafas tras el parabrisas, y la ametralladora en su poste, detras. */
function jeep(side) {
  const helmet = [5, 2, 5];
  return {
    bones: [
      ...WHEEL_BONES.filter((bone) => bone.name !== 'turret' && bone.name !== 'barrel'),
      { name: 'turret', parent: 'hull', pivot: [2, 6, 3.5] },
      { name: 'barrel', parent: 'turret', pivot: [2, 10.5, 1.5] },
    ],
    motions: { ...WHEEL_MOTIONS, fire: onceMotion(0.4, [kick('turret', 10), kick('hull', 3)]) },
    cubes: [
      ...axles(12),
      { name: 'body', bone: 'hull', origin: [-4.5, 3, -7], size: [9, 3, 13], paint: `team_${side}` },
      { name: 'windshield', bone: 'hull', origin: [-4, 6, -3], size: [8, 2, 1], paint: 'glass' },
      { name: 'windshield_frame', bone: 'hull', origin: [-4.5, 8, -3], size: [9, 1, 1], paint: 'gun' },
      { name: 'driver_head', bone: 'hull', origin: [-3.5, 6, -1], size: [4, 4, 4], paint: 'skin', stamps: [eyes(4)] },
      { name: 'driver_helmet', bone: 'hull', origin: [-4, 9, -1.5], size: helmet, paint: `team_${side}`, stamps: goggles(helmet, 1) },
      { name: 'gun_post', bone: 'turret', origin: [1.5, 6, 3], size: [1, 4, 1], paint: 'gun' },
      { name: 'gun_body', bone: 'barrel', origin: [1, 9.5, 0], size: [2, 2, 3], paint: 'gun' },
      { name: 'gun', bone: 'barrel', origin: [1.5, 10, -5], size: [1, 1, 5], paint: 'gun' },
    ],
  };
}

/** La moto: ruedas grandes, deposito del equipo, sillin, faro amarillo; el motorista con su bufanda al viento. */
function biker(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const helmet = [6, 2, 6];
  const bones = [
    { name: 'hull', parent: 'root', pivot: [0, 3, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, 3, -5] },
    { name: 'wheels_back', parent: 'root', pivot: [0, 3, 5] },
    { name: 'rider', parent: 'hull', pivot: [0, 7, 1] },
  ];
  return {
    bones,
    motions: {
      idle: loopMotion(1.2, [sway('rider', [2, 0, 1], 1.2)]),
      drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [0, 0, 3], 0.4)], 'linear'),
      fire: onceMotion(0.4, [kick('rider', 8)]),
    },
    cubes: [
      ...wheel('wheel_front', 'wheels_front', [-1, -8]),
      ...wheel('wheel_back', 'wheels_back', [-1, 2]),
      { name: 'fork', bone: 'hull', origin: [-0.5, 3, -5.5], size: [1, 5, 1], paint: 'steel' },
      { name: 'engine', bone: 'hull', origin: [-1.5, 2, -2], size: [3, 3, 4], paint: 'gun' },
      { name: 'tank', bone: 'hull', origin: [-1.5, 5, -4], size: [3, 3, 5], paint: team },
      { name: 'headlight', bone: 'hull', origin: [-1, 6, -5], size: [2, 2, 1], paint: 'lamp' },
      { name: 'seat', bone: 'hull', origin: [-1.5, 6, 1], size: [3, 1, 4], paint: 'pack' },
      { name: 'fender', bone: 'hull', origin: [-1.5, 6, 5], size: [3, 1, 4], paint: team },
      { name: 'exhaust', bone: 'hull', origin: [1.5, 2, 1], size: [1, 1, 6], paint: 'steel' },
      { name: 'handlebar', bone: 'hull', origin: [-3, 8, -4.5], size: [6, 1, 1], paint: 'steel' },
      { name: 'leg_left', bone: 'rider', origin: [-3, 6, -3], size: [2, 2, 5], paint: dark },
      { name: 'leg_right', bone: 'rider', origin: [1, 6, -3], size: [2, 2, 5], paint: dark },
      { name: 'rider_body', bone: 'rider', origin: [-2.5, 7, 0], size: [5, 4, 3], paint: team, stamps: band('belt', [5, 4, 3], 3, BROWN) },
      { name: 'arm_left', bone: 'rider', origin: [-3.5, 8.5, -4], size: [1, 1, 4], paint: team },
      { name: 'arm_right', bone: 'rider', origin: [2.5, 8.5, -4], size: [1, 1, 4], paint: team },
      { name: 'rider_head', bone: 'rider', origin: [-2.5, 11, -1], size: [5, 4, 5], paint: 'skin', stamps: [eyes(5)] },
      { name: 'rider_helmet', bone: 'rider', origin: [-3, 14, -1.5], size: helmet, paint: team, stamps: goggles(helmet, 1) },
      { name: 'scarf', bone: 'rider', origin: [-2, 11, 3.5], size: [4, 1, 5], paint: dark },
    ],
  };
}

// ---- Aire ----

/** Los aviones vuelan: todo cuelga de 'body', subido; la animacion de reposo los mece. */
const FLYING_HEIGHT = 10;
const flyingBones = (extra = []) => [
  { name: 'body', parent: 'root', pivot: [0, FLYING_HEIGHT, 0] },
  ...extra.map((bone) => ({ parent: 'body', ...bone, pivot: [bone.pivot[0], bone.pivot[1] + FLYING_HEIGHT, bone.pivot[2]] })),
];
const FLYING_MOTIONS = {
  idle: loopMotion(2, [sway('body', [3, 0, 5], 2)]),
  drive: loopMotion(1, [sway('body', [-4, 0, 6], 1)]),
  fire: onceMotion(0.4, [kick('body', -5)]),
};
const raised = (cubes) =>
  cubes.map((cube) => ({
    ...cube,
    bone: cube.bone ?? 'body',
    origin: [cube.origin[0], cube.origin[1] + FLYING_HEIGHT, cube.origin[2]],
    pivot: cube.pivot && [cube.pivot[0], cube.pivot[1] + FLYING_HEIGHT, cube.pivot[2]],
  }));

/** Las helices (en cruz: se ven igual cada cuarto de vuelta) giran mientras el avion se mece. */
const propSpin = (bone, duration, turns) => spin(bone, duration, { axis: 2, symmetry: 90, sign: 1, turns });
const withProps = (props) => ({
  idle: loopMotion(2, [sway('body', [3, 0, 5], 2), ...props.map((bone) => propSpin(bone, 2, 10))]),
  drive: loopMotion(1, [sway('body', [-4, 0, 6], 1), ...props.map((bone) => propSpin(bone, 1, 5))]),
  fire: FLYING_MOTIONS.fire,
});

/** Una helice en cruz centrada en (x, y), delante en z, de ese largo de aspa. */
const propeller = (bone, [x, y, z], span) => [
  { name: `${bone}_a`, bone, origin: [x - span / 2, y - 0.5, z], size: [span, 1, 1], paint: 'steel' },
  { name: `${bone}_b`, bone, origin: [x - 0.5, y - span / 2, z], size: [1, span, 1], paint: 'steel' },
];

/** El caza ligero: de helice, ala baja, piloto con casco a la vista y ruedas debajo. */
function lightFighter(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  return {
    bones: flyingBones([{ name: 'prop', pivot: [0, 2, -8] }]),
    motions: withProps(['prop']),
    cubes: raised([
      { name: 'fuselage', origin: [-2, 0, -6], size: [4, 4, 11], paint: team },
      { name: 'cowl', origin: [-2, 0, -7], size: [4, 4, 1], paint: 'steel' },
      { name: 'tail', origin: [-1, 1, 5], size: [2, 2, 4], paint: team },
      { name: 'fin', origin: [-0.5, 3, 6], size: [1, 4, 3], paint: dark },
      { name: 'tailplane', origin: [-4, 1.5, 7], size: [8, 1, 2], paint: dark },
      { name: 'wing', origin: [-7, 0, -3], size: [14, 1, 5], paint: dark },
      { name: 'windscreen', origin: [-2, 4, -2], size: [4, 1, 1], paint: 'glass' },
      { name: 'pilot', origin: [-1, 4, -1], size: [2, 2, 2], paint: 'skin' },
      { name: 'pilot_helmet', origin: [-1.5, 6, -1.5], size: [3, 1, 3], paint: team },
      { name: 'wheel_left', origin: [-3, -2, -4], size: [1, 2, 2], paint: 'tire' },
      { name: 'wheel_right', origin: [2, -2, -4], size: [1, 2, 2], paint: 'tire' },
      { name: 'prop_hub', bone: 'prop', origin: [-1, 1, -8], size: [2, 2, 1], paint: 'gun' },
      ...propeller('prop', [0, 2, -8.5], 7),
    ]),
  };
}

/** El caza: chato, con la cupula grande, el morro gris y alas pequeñas. */
function fighter(side) {
  const dark = `dark_${side}`;
  return {
    bones: flyingBones(),
    motions: FLYING_MOTIONS,
    cubes: raised([
      { name: 'fuselage', origin: [-2.5, 0, -6], size: [5, 5, 12], paint: `team_${side}` },
      { name: 'nose', origin: [-1.5, 1, -8], size: [3, 3, 2], paint: 'steel' },
      { name: 'canopy', origin: [-1.5, 5, -4], size: [3, 2, 5], paint: 'glass' },
      { name: 'wing', origin: [-6, 1, -1], size: [12, 1, 5], paint: dark },
      { name: 'tailplane', origin: [-4, 2, 5], size: [8, 1, 2], paint: dark },
      { name: 'fin', origin: [-0.5, 5, 3], size: [1, 4, 3], paint: dark },
      { name: 'nozzle', origin: [-1.5, 1, 6], size: [3, 3, 1], paint: 'gun' },
    ]),
  };
}

/** El bombardero: gordo, con el morro de cristal y dos motores de helice en las alas. */
function bomber(side) {
  const dark = `dark_${side}`;
  return {
    bones: flyingBones([
      { name: 'prop_left', pivot: [-5.5, 2.5, -5.5] },
      { name: 'prop_right', pivot: [5.5, 2.5, -5.5] },
    ]),
    motions: withProps(['prop_left', 'prop_right']),
    cubes: raised([
      { name: 'fuselage', origin: [-3, 0, -7], size: [6, 6, 14], paint: `team_${side}` },
      { name: 'nose', origin: [-2, 1, -9], size: [4, 4, 2], paint: 'glass' },
      { name: 'windscreen', origin: [-2, 6, -6], size: [4, 1, 2], paint: 'glass' },
      { name: 'wing', origin: [-11, 2, -3], size: [22, 1, 6], paint: dark },
      { name: 'engine_left', origin: [-7, 1, -5], size: [3, 3, 5], paint: 'gun' },
      { name: 'engine_right', origin: [4, 1, -5], size: [3, 3, 5], paint: 'gun' },
      ...propeller('prop_left', [-5.5, 2.5, -6], 5),
      ...propeller('prop_right', [5.5, 2.5, -6], 5),
      { name: 'fin', origin: [-0.5, 6, 3], size: [1, 5, 4], paint: dark },
      { name: 'tailplane', origin: [-5, 4, 5], size: [10, 1, 3], paint: dark },
    ]),
  };
}

/** El helicoptero: cabina redonda con la burbuja de cristal delante, patines, cola con su rotor. */
function helicopter(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const tailSpin = (duration, turns) => spin('tail_rotor', duration, { symmetry: 90, turns });
  const skids = [-4, 3].flatMap((x, index) => [
    { name: `skid${index}`, origin: [x, -3, -5], size: [1, 1, 10], paint: 'gun' },
    { name: `strut_front${index}`, origin: [x, -2, -3], size: [1, 2, 1], paint: 'gun' },
    { name: `strut_back${index}`, origin: [x, -2, 2], size: [1, 2, 1], paint: 'gun' },
  ]);
  return {
    bones: flyingBones([
      { name: 'rotor', pivot: [0, 8, 0] },
      { name: 'tail_rotor', pivot: [1.5, 3.5, 11] },
    ]),
    motions: {
      idle: loopMotion(2, [sway('body', [3, 0, 5], 2), tailSpin(2, 10)]),
      drive: loopMotion(1, [sway('body', [-4, 0, 6], 1), tailSpin(1, 5)]),
      fire: FLYING_MOTIONS.fire,
    },
    cubes: raised([
      { name: 'cabin', origin: [-3.5, 0, -4], size: [7, 6, 8], paint: team },
      { name: 'cabin_top', origin: [-2.5, 6, -3], size: [5, 1, 6], paint: team },
      { name: 'bubble', origin: [-3, 0.5, -7], size: [6, 5, 3], paint: 'glass' },
      { name: 'boom', origin: [-1, 3, 4], size: [2, 2, 8], paint: dark },
      { name: 'tail_fin', origin: [-0.5, 5, 10], size: [1, 3, 2], paint: dark },
      ...skids,
      { name: 'mast', origin: [-0.5, 7, -0.5], size: [1, 1, 1], paint: 'steel' },
      { name: 'blade_a', bone: 'rotor', origin: [-10, 8, -0.5], size: [20, 1, 1], paint: 'blur' },
      { name: 'blade_b', bone: 'rotor', origin: [-0.5, 8, -10], size: [1, 1, 20], paint: 'blur' },
      { name: 'tail_blade_a', bone: 'tail_rotor', origin: [1, 1.5, 10.5], size: [1, 4, 1], paint: 'steel' },
      { name: 'tail_blade_b', bone: 'tail_rotor', origin: [1, 3, 9], size: [1, 1, 4], paint: 'steel' },
    ]),
  };
}

/** Cada unidad (id de units.json) y como se construye para un equipo. */
const UNITS = {
  Soldier: rifleman,
  BSoldier: bazooka,
  SSoldier: shield,
  MSoldier: mortar,
  FSoldier: biker,
  Tank: tank,
  LTank: lightTank,
  WTank: amphibiousTank,
  Artillery: artillery,
  Antiair: antiair,
  Blocker: blocker,
  Car: jeep,
  Transport: transport,
  Supplier: supplier,
  Missile_truck: missileTruck,
  LFighter: lightFighter,
  Fighter: fighter,
  Bomber: bomber,
  THelicopter: helicopter,
};

/** Los tipos con modelo (para el juego: src/view3d/glbModels.ts los carga todos). */
export const UNIT_IDS = Object.keys(UNITS);

export const MODELS = Object.fromEntries(
  Object.entries(UNITS).flatMap(([unit, build]) => Object.keys(SIDES).map((side) => [`${unit.toLowerCase()}_${side}`, build(side)])),
);
