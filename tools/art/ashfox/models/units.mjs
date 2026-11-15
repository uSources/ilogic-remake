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
  brass: { ramp: ['#c09a30', '#d8b040', '#ecc858'] },
  leather: { ramp: ['#4a2e1a', '#5a3a22', '#6a4630'] },
  canteen: { ramp: ['#4e5a3a', '#5c6a44', '#6a7a4e'] },
  bedroll: { ramp: ['#5e5a36', '#6a6640', '#76724a'] },
  boot_grey: { ramp: ['#7a726a', '#8a8279', '#9d958d'] },
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

/** Una banda de un color, de `rows` filas desde la fila `row`, en los cuatro lados de un cubo de ese tamaño (cinturones, correas). */
const band = (name, size, row, color, rows = 1) =>
  FACES_AROUND.map((face) => {
    const width = widthOn(face, size);
    const pixels = Array(rows).fill('x'.repeat(width)).join('/');
    return { name: `${name}${width}${rows > 1 ? `x${rows}` : ''}`, face, pixels, colors: { x: color }, at: [[0, row]] };
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

// ---- Infanteria con detalle: el muñeco a 32 unidades por casilla (`detail: 2`) ----
//
// El doble de pixeles por lado que el chibi de arriba: cara de soldado (ojos y boca seria), casco
// con gafas de verdad (marco y cristales que sobresalen) y su correa, cinturon con hebilla y
// cartucheras, tirantes, mochila con solapa, bolsillos, cantimplora y manta, y botas con suela. En
// guardia: piernas abiertas, una adelantada, y el fusil cruzado por delante con las dos manos. Cada
// brazo es hombro y antebrazo, y el antebrazo apunta a su mano en el fusil (`grip`). Ashfox no deja
// girar los huesos en reposo, asi que la pose son cubos girados. Fusil y brazos cuelgan del cuerpo y
// se mueven con el.

const DETAIL = 2;
const HAIR = '#4a2c1c';
const EAR = '#e0a47e';
const MOUTH = '#8a4a3a';
const SOLE = '#3a3430';
const SHINE = '#ffffff';

const TROOPER_BONES = [
  { name: 'leg_left', parent: 'root', pivot: [-2.5, 9, 0] },
  { name: 'leg_right', parent: 'root', pivot: [2.5, 9, 0] },
  { name: 'torso', parent: 'root', pivot: [0, 9, 0] },
  { name: 'head', parent: 'torso', pivot: [0, 17, 0] },
  { name: 'arm_left', parent: 'torso', pivot: [-7, 16, 0] },
  { name: 'arm_right', parent: 'torso', pivot: [7, 16, 0] },
];
const shoulderOf = (bone) => TROOPER_BONES.find((joint) => joint.name === bone).pivot;

const TROOPER_TORSO = [10, 8, 6];
const TROOPER_HEAD = [12, 9, 11];
const TROOPER_HELMET = [14, 6, 13];
const TROOPER_BOOT = [4, 3, 6];
const TROOPER_LEG = [4, 6, 4];

/** Una pierna con su bota, desde `[x, z]` (abiertas y una adelantada: en guardia). */
const trooperLeg = (side, bone, [x, z]) => [
  {
    name: `boot_${bone}`,
    bone,
    origin: [x, 0, z - 1.5],
    size: TROOPER_BOOT,
    paint: 'boot_grey',
    stamps: band('sole', TROOPER_BOOT, 2, SOLE),
  },
  {
    name: bone,
    bone,
    origin: [x, 3, z],
    size: TROOPER_LEG,
    paint: `dark_${side}`,
    stamps: [mark('knee', 'north', 'kk/kk', { k: SIDES[side].dark[0] }, [1, 2])],
  },
];

/** El cuerpo: cinturon de dos filas (y los tirantes de la mochila por delante, si la lleva) y, encima, hebilla y cartucheras. */
function trooperTorso(side, look) {
  const straps = look.backpack ? [mark('straps', 'north', Array(6).fill('..s....s..').join('/'), { s: BROWN }, [0, 0])] : [];
  return [
    {
      name: 'torso',
      bone: 'torso',
      origin: [-5, 9, -3],
      size: TROOPER_TORSO,
      paint: `team_${side}`,
      stamps: [...band('belt', TROOPER_TORSO, 6, BROWN, 2), ...straps],
    },
    {
      name: 'buckle',
      bone: 'torso',
      origin: [-1.5, 9, -4],
      size: [3, 2, 1],
      paint: 'brass',
      stamps: [mark('prong', 'north', '.k./.k.', { k: BROWN }, [0, 0])],
    },
    { name: 'pouch_left', bone: 'torso', origin: [-4.5, 9, -4], size: [2, 2, 1], paint: 'pack' },
    { name: 'pouch_right', bone: 'torso', origin: [2.5, 9, -4], size: [2, 2, 1], paint: 'pack' },
  ];
}

/** La cara (bajo el casco, que tapa las tres filas de arriba): ojos y la boca seria. */
const TROOPER_FACE = ['............', '..kk....kk..', '..kk....kk..', '............', '....mmmm....'].join('/');

/** La cabeza: cara delante, orejas y patillas a los lados y pelo detras. */
const bareHead = () => ({
  name: 'head',
  bone: 'head',
  origin: [-6, 17, -6],
  size: TROOPER_HEAD,
  paint: 'skin',
  stamps: [
    mark('face', 'north', TROOPER_FACE, { k: EYE, m: MOUTH }, [0, 3]),
    ...['east', 'west'].map((face) => mark('ear', face, 'hhhhhhhhhhh/....ee...../....ee.....', { h: HAIR, e: EAR }, [0, 3])),
    mark('hair', 'south', Array(3).fill('h'.repeat(12)).join('/'), { h: HAIR }, [0, 3]),
  ],
});

/** El pasamontañas: solo asoma la franja de los ojos (bajo el casco). */
const MASK_EYES = ['ssssssssssss', 'sskksssskkss', 'sskksssskkss'].join('/');

/** La cabeza tapada con el pasamontañas oscuro del equipo. */
const maskedHead = (side) => ({
  name: 'head',
  bone: 'head',
  origin: [-6, 17, -6],
  size: TROOPER_HEAD,
  paint: `dark_${side}`,
  stamps: [mark('mask_eyes', 'north', MASK_EYES, { s: SKIN, k: EYE }, [0, 3])],
});

const trooperHead = (side, look) => (look.mask ? maskedHead(side) : bareHead());

/** Un cristal de las gafas, que sobresale del marco, con su brillo arriba a la izquierda. */
const lens = (name, x) => ({
  name,
  bone: 'head',
  origin: [x, 25, -9],
  size: [4, 2, 1],
  paint: 'glass',
  stamps: [mark('lens_shine', 'north', 'w', { w: SHINE }, [0, 0])],
});

/** Las gafas: el marco y los dos cristales, delante del casco. */
const GOGGLES = [
  { name: 'goggles', bone: 'head', origin: [-6, 24, -8], size: [12, 4, 1], paint: 'leather' },
  lens('lens_left', -5),
  lens('lens_right', 1),
];

/**
 * El casco, con la copa y la nuca: con gafas (`look.goggles`, y su correa por los lados) o, el
 * antidisturbios, con visera oscura delante.
 */
function trooperHelmet(side, look) {
  const team = `team_${side}`;
  const strap = look.goggles
    ? band('helmet_strap', TROOPER_HELMET, 2, BROWN, 2).filter((stamp) => stamp.face === 'east' || stamp.face === 'west')
    : [];
  const front = look.goggles ? GOGGLES : [{ name: 'brim', bone: 'head', origin: [-7, 23, -9], size: [14, 1, 2], paint: `dark_${side}` }];
  return [
    { name: 'helmet', bone: 'head', origin: [-7, 23, -7], size: TROOPER_HELMET, paint: team, stamps: strap },
    { name: 'helmet_top', bone: 'head', origin: [-5, 29, -5], size: [10, 2, 9], paint: team },
    { name: 'neck_guard', bone: 'head', origin: [-7, 20, 4], size: [14, 3, 2], paint: team },
    ...front,
  ];
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const roundToHalf = (value) => Math.round(value * 2) / 2;
const plus = (a, b) => a.map((value, axis) => value + b[axis]);
const minus = (a, b) => a.map((value, axis) => value - b[axis]);

/** Un vector girado como gira Ashfox un cubo (`rotation` en grados, orden xyz: primero z, luego y, luego x). */
function rotated([x, y, z], [aroundX, aroundY, aroundZ]) {
  const [cx, sx, cy, sy, cz, sz] = [aroundX, aroundY, aroundZ].flatMap((degrees) => [
    Math.cos(toRadians(degrees)),
    Math.sin(toRadians(degrees)),
  ]);
  const [x1, y1] = [x * cz - y * sz, x * sz + y * cz];
  const [x2, z2] = [x1 * cy + z * sy, -x1 * sy + z * cy];
  return [x2, y1 * cx - z2 * sx, y1 * sx + z2 * cx];
}
/** Un punto girado alrededor de `pivot`. */
const turnedAround = (point, pivot, rotation) => plus(pivot, rotated(minus(point, pivot), rotation));

const UPPER_ARM = [3, 5, 3];
const FOREARM_SECTION = 3;
const HAND = [3, 3, 3];
/** Desde el hombro hasta el codo, con el brazo colgando (el antebrazo sale de ahi). */
const ELBOW_DROP = 3.5;

/** El giro (grados en x y en y) que deja un cubo que apunta al frente (-z) apuntando hacia `direction`. */
function aimedAt([dx, dy, dz]) {
  const length = Math.hypot(dx, dy, dz);
  return [toDegrees(Math.atan2(dy, -dz)), toDegrees(Math.asin(-dx / length)), 0].map(roundToHalf);
}

/**
 * Un brazo que coge el fusil: el hombro girado (`shoulder`, grados en x hacia delante y en z hacia
 * dentro o fuera) y el antebrazo, recto desde el codo, apuntando a `grip` (donde va el centro de la
 * mano), con el largo que haga falta.
 */
function trooperArm(side, bone, { shoulder: shoulderTurn, grip }) {
  const shoulder = shoulderOf(bone);
  const elbow = turnedAround(plus(shoulder, [0, -ELBOW_DROP, 0]), shoulder, shoulderTurn).map(roundToHalf);
  const toGrip = minus(grip, elbow);
  const forearm = Math.max(1, Math.round(Math.hypot(...toGrip) - HAND[2] / 2));
  const aim = { rotation: aimedAt(toGrip), pivot: elbow };
  const [x, y, z] = elbow;
  return [
    {
      name: `upper_${bone}`,
      bone,
      origin: [shoulder[0] - 1.5, 12, -1.5],
      size: UPPER_ARM,
      paint: `team_${side}`,
      rotation: shoulderTurn,
      pivot: shoulder,
    },
    {
      name: `fore_${bone}`,
      bone,
      origin: [x - 1.5, y - 1.5, z - forearm],
      size: [FOREARM_SECTION, FOREARM_SECTION, forearm],
      paint: `team_${side}`,
      ...aim,
    },
    { name: `hand_${bone}`, bone, origin: [x - 1.5, y - 1.5, z - forearm - HAND[2]], size: HAND, paint: 'skin', ...aim },
  ];
}

/**
 * El fusil, en guardia: cruzado por delante a la altura del pecho, la culata a la derecha y la boca
 * hacia delante, a la izquierda y algo alzada (`RIFLE_TURN` grados). Sus piezas se describen como si apuntara al frente desde la
 * empuñadura (`RIGHT_GRIP`) y se giran todas juntas alrededor de ella.
 */
const RIGHT_GRIP = [3.5, 13, -5];
const RIFLE_TURN = [10, 30, 0];
/** Donde coge la mano izquierda el guardamanos, contado desde la empuñadura. */
const LEFT_GRIP_ON_RIFLE = [0, 0.5, -6];
const LEFT_GRIP = turnedAround(plus(RIGHT_GRIP, LEFT_GRIP_ON_RIFLE), RIGHT_GRIP, RIFLE_TURN);
const RIFLE_PARTS = [
  { name: 'stock', origin: [-1, -1.5, 0.5], size: [2, 3, 4], paint: 'pack' },
  {
    name: 'receiver',
    origin: [-1, -1.5, -5],
    size: [2, 4, 5],
    paint: 'gun',
    stamps: ['east', 'west'].map((face) => mark('receiver_side', face, '.ss.k', { s: '#6a7282', k: SLOT }, [0, 1])),
  },
  { name: 'magazine', origin: [-1, -5, -4], size: [2, 4, 2], paint: 'gun' },
  { name: 'sight', origin: [-0.5, 2.5, -4], size: [1, 1, 2], paint: 'steel' },
  { name: 'handguard', origin: [-1, -1, -11], size: [2, 3, 6], paint: 'pack' },
  { name: 'barrel', origin: [-0.5, 0, -15], size: [1, 1, 4], paint: 'steel' },
  { name: 'muzzle', origin: [-1, -0.5, -17], size: [2, 2, 2], paint: 'gun' },
];
const RIFLE = RIFLE_PARTS.map((part) => ({
  ...part,
  bone: 'torso',
  origin: plus(RIGHT_GRIP, part.origin),
  rotation: RIFLE_TURN,
  pivot: RIGHT_GRIP,
}));

/** La mochila: el cuerpo con sus correas, la solapa de arriba con hebilla, el bolsillo de detras, la cantimplora y una funda a los lados y la manta enrollada encima. */
const BACKPACK = [
  {
    name: 'backpack',
    bone: 'torso',
    origin: [-4.5, 9, 3],
    size: [9, 8, 4],
    paint: 'pack',
    stamps: ['east', 'west'].map((face) => mark('pack_strap', face, 'd..d/d..d/d..d/d..d/d..d', { d: BROWN }, [0, 1])),
  },
  {
    name: 'pack_flap',
    bone: 'torso',
    origin: [-5, 14, 2.5],
    size: [10, 3, 5],
    paint: 'leather',
    stamps: [mark('flap_buckle', 'south', 'yy/yy', { y: '#e8c040' }, [4, 1])],
  },
  {
    name: 'pack_pocket',
    bone: 'torso',
    origin: [-3, 9.5, 7],
    size: [6, 4, 1],
    paint: 'pack',
    stamps: [mark('pocket_flap', 'south', 'dddddd/..yy..', { d: BROWN, y: '#e8c040' }, [0, 0])],
  },
  {
    name: 'canteen',
    bone: 'torso',
    origin: [-6.5, 9.5, 3.5],
    size: [2, 4, 3],
    paint: 'canteen',
    stamps: [mark('canteen_cap', 'west', '.k.', { k: SLOT }, [0, 0])],
  },
  {
    name: 'side_pouch',
    bone: 'torso',
    origin: [4.5, 10, 3.5],
    size: [2, 3, 3],
    paint: 'leather',
    stamps: [mark('pouch_flap', 'east', 'ddd', { d: '#3a2416' }, [0, 0])],
  },
  {
    name: 'bedroll',
    bone: 'torso',
    origin: [-5, 17, 4],
    size: [10, 3, 3],
    paint: 'bedroll',
    stamps: ['north', 'south'].map((face) => mark('ties', face, '..t....t../..t....t../..t....t..', { t: BROWN }, [0, 0])),
  },
];

/**
 * El muñeco con detalle de un equipo, sin brazos ni lo que lleva: piernas, cuerpo, cabeza y casco.
 * `look` dice lo que cambia: gafas (`goggles`), pasamontañas (`mask`) y tirantes de mochila (`backpack`).
 */
const trooper = (side, look) => [
  ...trooperLeg(side, 'leg_left', [-5, -3]),
  ...trooperLeg(side, 'leg_right', [1, -0.5]),
  ...trooperTorso(side, look),
  trooperHead(side, look),
  ...trooperHelmet(side, look),
];

/** Las manos no sueltan el fusil: al andar solo se mueven las piernas y el cuerpo; al disparar, el cuerpo se echa atras. */
const TROOPER_MOTIONS = {
  idle: loopMotion(1.6, [sway('torso', [0, 3, 0], 1.6), sway('head', [3, 0, 2], 1.6)]),
  drive: loopMotion(
    0.5,
    [sway('leg_left', [30, 0, 0], 0.5), sway('leg_right', [-30, 0, 0], 0.5), sway('torso', [0, 0, 3], 0.5), sway('head', [2, 0, 0], 0.5)],
    'linear',
  ),
  fire: onceMotion(0.4, [kick('torso', 8), kick('head', -4)]),
};

/** El fusilero: fusil al frente en las dos manos, y mochila con manta. */
const rifleman = (side) => ({
  detail: DETAIL,
  bones: TROOPER_BONES,
  cubes: [
    ...trooper(side, { goggles: true, backpack: true }),
    ...trooperArm(side, 'arm_right', { shoulder: [15, 0, 15], grip: RIGHT_GRIP }),
    ...trooperArm(side, 'arm_left', { shoulder: [65, 0, 20], grip: LEFT_GRIP }),
    ...RIFLE,
    ...BACKPACK,
  ],
  motions: TROOPER_MOTIONS,
});

/** El del bazuca: el tubo al hombro, largo, con sus bocas y la mira. */
const bazooka = (side) =>
  infantry(side, { vest: true }, () => [
    { name: 'tube', bone: 'arm_right', origin: [3, 9, -6], size: [2, 2, 11], paint: 'gun' },
    { name: 'muzzle', bone: 'arm_right', origin: [2.5, 8.5, -6.5], size: [3, 3, 1], paint: 'steel' },
    { name: 'breech', bone: 'arm_right', origin: [2.5, 8.5, 4.5], size: [3, 3, 1], paint: 'steel' },
    { name: 'sight', bone: 'arm_right', origin: [3.5, 11, -3], size: [1, 1, 2], paint: 'steel' },
  ]);

// ---- El antidisturbios: escudo y pistola ----

/** Donde coge cada mano: la izquierda, el asa por detras del escudo; la derecha, la pistola, al frente y abajo. */
const SHIELD_GRIP = [-3.5, 12.5, -7.5];
const PISTOL_GRIP = [6.5, 11.5, -8];

/**
 * El escudo antidisturbios, alto (hasta los ojos) y delante a la izquierda: gris con el borde claro,
 * la mirilla oscura arriba, una franja del color del equipo y remaches abajo.
 */
function riotShield(side) {
  const stripe = Array(2).fill('t'.repeat(11)).join('/');
  return {
    name: 'shield',
    bone: 'arm_left',
    origin: [-9, 2, -10],
    size: [11, 19, 1],
    paint: 'riot',
    stamps: [
      mark('shield_visor', 'north', 'lgggggggl/ggggggggg/ggggggggg/ggggggggg', { g: '#2a3a48', l: '#4a5e70' }, [1, 2]),
      mark('shield_stripe', 'north', stripe, { t: SIDES[side].team[1] }, [0, 9]),
      mark('shield_rivets', 'north', 'r.........r', { r: '#c4c8d0' }, [0, 16]),
    ],
  };
}

/** La pistola pequeña, en la mano derecha: la corredera clara (con miras y boca) justo encima de la mano, el guardamonte delante y la culata, inclinada, dentro del puño. */
const pistolPart = (name, offset, size, paint, extra = {}) => ({
  name,
  bone: 'arm_right',
  origin: plus(PISTOL_GRIP, offset),
  size,
  paint,
  ...extra,
});
const PISTOL = [
  pistolPart('pistol_slide', [-1, 1.5, -5.5], [2, 2, 7], 'steel', {
    stamps: [
      mark('slide_hole', 'north', 'k', { k: SLOT }, [0, 1]),
      ...['east', 'west'].map((face) => mark('slide_cuts', face, 'k.k', { k: '#4a505c' }, [4, 0])),
    ],
  }),
  pistolPart('pistol_front_sight', [-0.5, 3.5, -5], [1, 1, 1], 'gun'),
  pistolPart('pistol_rear_sight', [-0.5, 3.5, 0.5], [1, 1, 1], 'gun'),
  pistolPart('pistol_frame', [-1, 0.5, -4.5], [2, 1, 3], 'gun'),
  pistolPart('pistol_grip', [-1, -2.5, -1], [2, 4, 2], 'gun', { rotation: [-15, 0, 0], pivot: plus(PISTOL_GRIP, [0, 1.5, 0]) }),
];

/** La proteccion: peto gris en el pecho y en la espalda, y hombreras. */
const RIOT_ARMOR = [
  {
    name: 'chest_plate',
    bone: 'torso',
    origin: [-4, 12, -4],
    size: [8, 5, 1],
    paint: 'riot',
    stamps: [mark('plate_seam', 'north', '...dd...', { d: '#4a505c' }, [0, 2])],
  },
  { name: 'back_plate', bone: 'torso', origin: [-4, 11, 3], size: [8, 6, 1], paint: 'riot' },
  { name: 'pad_left', bone: 'torso', origin: [-9, 15.5, -2.5], size: [4, 2, 5], paint: 'riot' },
  { name: 'pad_right', bone: 'torso', origin: [5, 15.5, -2.5], size: [4, 2, 5], paint: 'riot' },
];

/** Al disparar, la pistola salta hacia arriba y el cuerpo se echa un poco atras. */
const RIOT_MOTIONS = { ...TROOPER_MOTIONS, fire: onceMotion(0.4, [kick('arm_right', 15), kick('torso', 4)]) };

/** El antidisturbios: pasamontañas, casco con visera, peto y hombreras, escudo alto y pistola pequeña. */
const riotTrooper = (side) => ({
  detail: DETAIL,
  bones: TROOPER_BONES,
  cubes: [
    ...trooper(side, { mask: true }),
    ...trooperArm(side, 'arm_right', { shoulder: [30, 0, 10], grip: PISTOL_GRIP }),
    ...trooperArm(side, 'arm_left', { shoulder: [40, 0, 20], grip: SHIELD_GRIP }),
    ...RIOT_ARMOR,
    riotShield(side),
    ...PISTOL,
  ],
  motions: RIOT_MOTIONS,
});

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

// ---- El tanque con detalle (32 unidades por casilla) ----

const TRACK_LINK = '#3a4050';
const TRACK_GAP = '#141824';
const ROAD_WHEEL = '#4a5262';
const WHEEL_HUB = '#8a93a6';

/** Una fila de `count` piezas iguales (`unit`) separadas por `gap` huecos, con `margin` huecos a cada lado. */
const repeatRow = (unit, count, gap, margin) => '.'.repeat(margin) + Array(count).fill(unit).join('.'.repeat(gap)) + '.'.repeat(margin);

/** De lado, una oruga de ese largo: eslabones arriba y abajo y cinco ruedas con su buje entre medias. */
function bigTrackSide(length) {
  const links = 'lt'.repeat(length / 2);
  const wheels = (unit) => repeatRow(unit, 5, 1, (length - 24) / 2);
  const rows = [links, '.'.repeat(length), wheels('.ww.'), wheels('wwww'), wheels('whhw'), wheels('whhw'), wheels('wwww'), links];
  return { pixels: rows.join('/'), colors: { l: TRACK_LINK, t: TRACK_GAP, w: ROAD_WHEEL, h: WHEEL_HUB } };
}

/** Las dos orugas, de ese largo: por fuera las ruedas; delante y detras, solo eslabones (oscuros, como toda la oruga). */
const bigTracks = (length = 28) =>
  [-1, 1].map((sideSign, index) => {
    const outer = sideSign < 0 ? 'west' : 'east';
    const side = bigTrackSide(length);
    const links = mark('track_end_links', 'north', Array(4).fill('lllllll/ttttttt').join('/'), { l: TRACK_LINK, t: TRACK_GAP }, [0, 0]);
    return {
      name: `track${index}`,
      bone: 'chassis',
      origin: [sideSign < 0 ? -15 : 8, 0, -length / 2],
      size: [7, 8, length],
      paint: 'tread',
      stamps: [mark('big_wheels', outer, side.pixels, side.colors, [0, 0]), links, { ...links, face: 'south' }],
    };
  });

/** El casco: guardabarros sobre las orugas con su borde claro y su junta, el bajo oscuro, la placa de delante con los faros, la rejilla del motor y la caja de herramientas. */
function bigTankHull(side) {
  const { teamRim, dark } = SIDES[side];
  const edge = ['east', 'west', 'north', 'south'].map((face) => {
    const width = face === 'north' || face === 'south' ? 30 : 28;
    return mark(
      `fender_edge${width}`,
      face,
      `${'r'.repeat(width)}/${'.'.repeat(width)}/${'d'.repeat(width)}`,
      { r: teamRim, d: dark[0] },
      [0, 0],
    );
  });
  const grille = Array(5)
    .fill(0)
    .map((_, row) => (row % 2 ? '.'.repeat(16) : 'g'.repeat(16)))
    .join('/');
  return [
    { name: 'lower_hull', bone: 'hull', origin: [-7, 2, -12], size: [14, 6, 24], paint: `dark_${side}` },
    { name: 'hull', bone: 'hull', origin: [-15, 8, -14], size: [30, 4, 28], paint: `team_${side}`, stamps: edge },
    { name: 'front_plate', bone: 'hull', origin: [-14, 9, -15], size: [28, 3, 1], paint: `dark_${side}` },
    { name: 'headlight_left', bone: 'hull', origin: [-13, 10, -16], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [10, 10, -16], size: [3, 2, 1], paint: 'lamp' },
    {
      name: 'engine_deck',
      bone: 'hull',
      origin: [-8, 12, 9],
      size: [16, 1, 5],
      paint: `dark_${side}`,
      stamps: [mark('grille', 'up', grille, { g: TRACK_GAP }, [0, 0])],
    },
    {
      name: 'toolbox',
      bone: 'hull',
      origin: [9, 12, -12],
      size: [5, 3, 7],
      paint: 'pack',
      stamps: [mark('toolbox_latch', 'east', 'yy', { y: '#e8c040' }, [2, 1])],
    },
  ];
}

/** La torreta: grande y cuadrada, con juntas y remaches, el mantelete, la cupula con su escotilla y periscopio, la caja de detras y la antena. */
function bigTankTurret(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const seams = ['east', 'west'].map((face) =>
    mark(
      'turret_seams',
      face,
      ['.r..r..r..r..r.', ...Array(6).fill('....d.....d....')].join('/'),
      { d: SIDES[side].dark[0], r: SIDES[side].dark[0] },
      [0, 1],
    ),
  );
  return [
    { name: 'turret', bone: 'turret', origin: [-8, 12, -6], size: [16, 8, 15], paint: team, stamps: seams },
    {
      name: 'mantlet',
      bone: 'turret',
      origin: [-6, 13, -8],
      size: [12, 6, 2],
      paint: dark,
      stamps: [
        mark(
          'mantlet_rivets',
          'north',
          'r..........r/............/............/............/............/r..........r',
          { r: WHEEL_HUB },
          [0, 0],
        ),
      ],
    },
    { name: 'cupola', bone: 'turret', origin: [-6, 20, 1], size: [6, 2, 6], paint: team },
    { name: 'hatch', bone: 'turret', origin: [-5, 22, 2], size: [4, 1, 4], paint: dark },
    { name: 'periscope', bone: 'turret', origin: [-4, 20, 0], size: [2, 2, 1], paint: 'glass' },
    {
      name: 'bustle',
      bone: 'turret',
      origin: [-7, 13, 9],
      size: [14, 6, 3],
      paint: dark,
      stamps: [mark('bustle_straps', 'south', Array(6).fill('...b......b...').join('/'), { b: BROWN }, [0, 0])],
    },
    { name: 'antenna', bone: 'turret', origin: [5.5, 20, 7], size: [1, 10, 1], paint: 'gun' },
  ];
}

/** Los dos cañones gordos con su freno de boca. */
const BIG_TANK_GUNS = [-5, 2].flatMap((x, index) => [
  { name: `barrel${index}`, bone: 'barrel', origin: [x, 14.5, -19], size: [3, 3, 11], paint: 'steel' },
  { name: `muzzle${index}`, bone: 'barrel', origin: [x - 0.5, 14, -21], size: [4, 4, 2], paint: 'gun' },
]);

/** El tanque: orugas con sus ruedas, casco con faros y rejilla, torreta grande con dos cañones. */
const tank = (side) => ({
  detail: DETAIL,
  bones: VEHICLE_BONES([0, 12, 1], [0, 16, -8]).map(
    (bone) => ({ chassis: { ...bone, pivot: [0, 4, 0] }, hull: { ...bone, pivot: [0, 6, 0] } })[bone.name] ?? bone,
  ),
  motions: VEHICLE_MOTIONS,
  cubes: [...bigTracks(), ...bigTankHull(side), ...bigTankTurret(side), ...BIG_TANK_GUNS],
});

function heavyTank(side) {
  const team = `team_${side}`;
  return {
    bones: VEHICLE_BONES([0, 7, 0.5], [0, 8.5, -3.5]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(16, 16),
      { name: 'hull', bone: 'hull', origin: [-7, 4, -8], size: [14, 4, 16], paint: team },
      { name: 'turret', bone: 'turret', origin: [-5, 8, -4], size: [10, 4, 8], paint: team },
      { name: 'turret_top', bone: 'turret', origin: [-4, 12, -3], size: [8, 2, 5], paint: team },
      { name: 'hatch', bone: 'turret', origin: [-2, 13, 1], size: [2, 1, 2], paint: `dark_${side}` },
      { name: 'mantlet', bone: 'turret', origin: [-3, 8, -12], size: [6, 2, 1], paint: `dark_${side}` },
      { name: 'barrel_left', bone: 'barrel', origin: [-2.5, 8.5, -12], size: [2, 2, 10], paint: 'steel' },
      { name: 'barrel_right', bone: 'barrel', origin: [0.5, 8.5, -12], size: [2, 2, 10], paint: 'steel' },
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

/** La artilleria: orugas, casco bajo, la cureña con el cañon gordo del color del equipo, alzado, y el artillero detras con su macuto. */
const ARTILLERY_GUN_LIFT = [40, 0, 0];
const ARTILLERY_TRUNNION = [0, 18, -1];

function artilleryHull(side) {
  const { teamRim, dark } = SIDES[side];
  const edge = ['east', 'west'].map((face) =>
    mark('artillery_edge', face, `${'r'.repeat(26)}/${'.'.repeat(26)}/${'d'.repeat(26)}`, { r: teamRim, d: dark[0] }, [0, 0]),
  );
  return [
    { name: 'lower_hull', bone: 'hull', origin: [-7, 2, -11], size: [14, 6, 22], paint: `dark_${side}` },
    { name: 'hull', bone: 'hull', origin: [-15, 8, -13], size: [30, 4, 26], paint: `team_${side}`, stamps: edge },
    { name: 'front_plate', bone: 'hull', origin: [-14, 9, -14], size: [28, 3, 1], paint: `dark_${side}` },
    { name: 'headlight_left', bone: 'hull', origin: [-13, 10, -15], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [10, 10, -15], size: [3, 2, 1], paint: 'lamp' },
    {
      name: 'ammo_box',
      bone: 'hull',
      origin: [8, 12, 5],
      size: [5, 3, 6],
      paint: 'canteen',
      stamps: [mark('ammo_latch', 'east', 'yy', { y: '#e8c040' }, [2, 1])],
    },
  ];
}

/** La cureña: la base que gira (con juntas), los muñones con remaches y el cañon alzado con su faja y la boca. */
function artilleryGun(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const lifted = { rotation: ARTILLERY_GUN_LIFT, pivot: ARTILLERY_TRUNNION };
  return [
    {
      name: 'mount',
      bone: 'turret',
      origin: [-7, 12, -5],
      size: [14, 4, 12],
      paint: team,
      stamps: ['east', 'west'].map((face) => mark('mount_seams', face, '..d...d...d./..d...d...d.', { d: SIDES[side].dark[0] }, [0, 1])),
    },
    {
      name: 'trunnion',
      bone: 'turret',
      origin: [-5, 16, -4],
      size: [10, 4, 6],
      paint: dark,
      stamps: ['east', 'west'].map((face) => mark('trunnion_bolt', face, '.hh./.hh.', { h: WHEEL_HUB }, [1, 1])),
    },
    { name: 'gun_barrel', bone: 'barrel', origin: [-2.5, 15.5, -21], size: [5, 5, 20], paint: team, ...lifted },
    { name: 'gun_band', bone: 'barrel', origin: [-3, 15, -9], size: [6, 6, 2], paint: dark, ...lifted },
    {
      name: 'gun_muzzle',
      bone: 'barrel',
      origin: [-3, 15, -23],
      size: [6, 6, 2],
      paint: 'gun',
      stamps: [mark('gun_bore', 'north', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [1, 1])],
      ...lifted,
    },
  ];
}

/** El artillero, detras de la cureña (gira con ella), con su macuto a la espalda. */
const artilleryGunner = (side) => [
  ...crewman(side, 'gunner', [-3, 12, 6], 'turret'),
  {
    name: 'gunner_bag',
    bone: 'turret',
    origin: [-2.5, 12.5, 10],
    size: [5, 5, 2],
    paint: 'pack',
    stamps: [mark('bag_flap', 'south', 'ddddd', { d: BROWN }, [0, 0])],
  },
];

const artillery = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'chassis', parent: 'root', pivot: [0, 4, 0] },
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'turret', parent: 'hull', pivot: [0, 12, 1] },
    { name: 'barrel', parent: 'turret', pivot: ARTILLERY_TRUNNION },
  ],
  motions: VEHICLE_MOTIONS,
  cubes: [...bigTracks(26), ...artilleryHull(side), ...artilleryGun(side), ...artilleryGunner(side)],
});

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

/** Remaches en fila: uno cada `step` en una cara de ese ancho. */
const rivetRow = (width, step) => [...Array(width)].map((_, x) => (x % step === step / 2 ? 'r' : '.')).join('');

/**
 * El bloqueador: un cajon blindado alto sobre orugas, con el frente redondeado (una placa que
 * sobresale y el borde de arriba), la junta del medio con remaches, la mirilla oscura en 3D, la
 * escotilla y el periscopio arriba y la puerta detras.
 */
function blockerArmor(side) {
  const team = `team_${side}`;
  const darkColor = SIDES[side].dark[0];
  const seamAndRivets = (width, height) =>
    [rivetRow(width, 4), ...Array(height - 2).fill(`${'.'.repeat(width / 2 - 1)}d${'.'.repeat(width / 2)}`), rivetRow(width, 4)].join('/');
  return [
    {
      name: 'box',
      bone: 'hull',
      origin: [-13, 8, -12],
      size: [26, 16, 26],
      paint: team,
      stamps: ['east', 'west', 'south'].map((face) =>
        mark('box_seams', face, seamAndRivets(26, 16), { d: darkColor, r: darkColor }, [0, 0]),
      ),
    },
    {
      name: 'front_plate',
      bone: 'hull',
      origin: [-12, 9, -14],
      size: [24, 13, 2],
      paint: team,
      stamps: [mark('front_seam', 'north', seamAndRivets(24, 13), { d: darkColor, r: darkColor }, [0, 0])],
    },
    { name: 'brow', bone: 'hull', origin: [-12, 22, -13], size: [24, 2, 1], paint: `dark_${side}` },
    { name: 'vision_slit', bone: 'hull', origin: [-5, 18, -15], size: [10, 2, 1], paint: 'tread' },
    { name: 'roof', bone: 'hull', origin: [-11, 24, -10], size: [22, 1, 21], paint: `dark_${side}` },
    {
      name: 'hatch',
      bone: 'hull',
      origin: [-4, 25, -2],
      size: [8, 1, 8],
      paint: team,
      stamps: [mark('hatch_handle', 'up', 'hhhh', { h: WHEEL_HUB }, [2, 3])],
    },
    {
      name: 'periscope',
      bone: 'hull',
      origin: [5, 25, -8],
      size: [3, 2, 2],
      paint: 'gun',
      stamps: [mark('periscope_glass', 'north', 'ggg', { g: WINDOW_GLASS }, [0, 0])],
    },
    {
      name: 'back_door',
      bone: 'hull',
      origin: [-5, 9, 14],
      size: [10, 11, 1],
      paint: `dark_${side}`,
      stamps: [mark('door_handle', 'south', 'hh', { h: WHEEL_HUB }, [7, 5])],
    },
  ];
}

const blocker = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'chassis', parent: 'root', pivot: [0, 4, 0] },
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
  ],
  motions: { idle: VEHICLE_MOTIONS.idle, drive: VEHICLE_MOTIONS.drive },
  cubes: [...bigTracks(28), ...blockerArmor(side)],
});

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
// ---- El transporte con detalle: camion con lona ----

const TRUCK_AXLES = { front: -10, back: 9 };

/** Las ruedas del camion (las del jeep: redondas, con tapacubos). */
const truckWheels = () =>
  Object.entries(TRUCK_AXLES).flatMap(([axle, z]) =>
    [-1, 1].flatMap((outward) =>
      jeepWheel(
        `wheel_${axle}_${outward < 0 ? 'left' : 'right'}`,
        `wheels_${axle}`,
        [outward < 0 ? -JEEP_BODY_HALF_WIDTH - 4 : JEEP_BODY_HALF_WIDTH, z],
        outward,
      ),
    ),
  );

/** La cabina, delante: parabrisas grande en 3D con su marco, ventanillas, rejilla, faros, parachoques y el techo. */
function truckCabin(side) {
  const team = `team_${side}`;
  const darkColor = SIDES[side].dark[0];
  return [
    {
      name: 'cabin',
      bone: 'hull',
      origin: [-10, 5, -16],
      size: [20, 14, 9],
      paint: team,
      stamps: [
        mark('cabin_grille', 'north', Array(3).fill('.k.k.k.k.k.k.k.k.k.k'.slice(0, 12)).join('/'), { k: darkColor }, [4, 9]),
        ...['east', 'west'].map((face) => mark('cabin_window', face, Array(4).fill('ggggg').join('/'), { g: WINDOW_GLASS }, [2, 1])),
        ...['east', 'west'].map((face) => mark('door_line', face, 'd/d/d/d/d/d/d/d/d', { d: darkColor }, [8, 1])),
      ],
    },
    { name: 'cabin_roof', bone: 'hull', origin: [-9, 19, -15], size: [18, 1, 8], paint: `dark_${side}` },
    {
      name: 'windshield',
      bone: 'hull',
      origin: [-8, 12, -17],
      size: [16, 6, 1],
      paint: 'glass',
      stamps: [mark('truck_shine', 'north', 'w..../.w.../..w..', { w: SHINE }, [2, 1])],
    },
    { name: 'windshield_bar', bone: 'hull', origin: [-0.5, 12, -17.5], size: [1, 6, 1], paint: 'gun' },
    { name: 'headlight_left', bone: 'hull', origin: [-10, 7, -17], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [7, 7, -17], size: [3, 2, 1], paint: 'lamp' },
    { name: 'bumper', bone: 'hull', origin: [-11, 4, -18], size: [22, 2, 1], paint: 'gun' },
    ...[-1, 1].map((sideSign) => ({
      name: `mirror_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -12 : 10, 14, -14],
      size: [2, 3, 1],
      paint: 'gun',
    })),
  ];
}

/** La caja de atras: plataforma, laterales del equipo y la lona con sus costillas, cuerdas y la abertura de detras. */
function truckBed(side) {
  const ribs = Array(10).fill('..d..d..d..d..d..d..').join('/');
  return [
    { name: 'bed', bone: 'hull', origin: [-11, 5, -7], size: [22, 3, 22], paint: `dark_${side}` },
    ...[-1, 1].map((sideSign) => ({
      name: `bed_side_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -11 : 10, 8, -7],
      size: [1, 4, 22],
      paint: `team_${side}`,
    })),
    {
      name: 'tarp',
      bone: 'hull',
      origin: [-10, 8, -6],
      size: [20, 12, 20],
      paint: 'canvas',
      stamps: [
        ...['east', 'west'].map((face) => mark('tarp_ribs', face, ribs, { d: '#a8968c' }, [0, 1])),
        mark('tarp_opening', 'south', Array(8).fill('kkkkkkkkkkkkkk').join('/'), { k: '#2a2622' }, [3, 3]),
        mark('tarp_rolled', 'south', 'rrrrrrrrrrrrrrrr', { r: '#a8968c' }, [2, 2]),
      ],
    },
    { name: 'tarp_top', bone: 'hull', origin: [-9, 20, -5], size: [18, 1, 18], paint: 'canvas' },
    { name: 'tail_light_left', bone: 'hull', origin: [-10, 6, 15], size: [2, 1, 1], paint: 'warhead' },
    { name: 'tail_light_right', bone: 'hull', origin: [8, 6, 15], size: [2, 1, 1], paint: 'warhead' },
  ];
}

/** El transporte: camion con cabina del equipo y la caja cubierta con lona. */
const transport = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, TRUCK_AXLES.front] },
    { name: 'wheels_back', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, TRUCK_AXLES.back] },
  ],
  motions: WHEEL_MOTIONS,
  cubes: [...truckWheels(), ...truckCabin(side), ...truckBed(side)],
});

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

// ---- El jeep con detalle (32 unidades por casilla) ----

/** Las ruedas del jeep: delante y detras (en z) y a cada lado (en x, por fuera de la carroceria). */
const JEEP_AXLES = { front: -9, back: 9 };
const JEEP_WHEEL_RADIUS = 5;
const JEEP_BODY_HALF_WIDTH = 9;

/**
 * Una rueda grande que se ve redonda: dos piezas de goma en cruz (una alta y otra larga, algo mas
 * fina, para que sus caras no peleen) y, por fuera, el tapacubos gris con su tuerca.
 */
function jeepWheel(name, bone, [x, z], outward) {
  const radius = JEEP_WHEEL_RADIUS;
  const capX = outward > 0 ? x + 4 : x - 1;
  return [
    { name, bone, origin: [x, 0, z - 3], size: [4, 2 * radius, 6], paint: 'tire' },
    { name: `${name}_round`, bone, origin: [x + 0.5, 2, z - radius], size: [3, 6, 2 * radius], paint: 'tire' },
    {
      name: `${name}_cap`,
      bone,
      origin: [capX, radius - 2, z - 2],
      size: [1, 4, 4],
      paint: 'steel',
      stamps: [mark('wheel_cap', outward > 0 ? 'east' : 'west', 'k..k/..../..../k..k', { k: '#1c2029' }, [0, 0])],
    },
  ];
}

const jeepWheels = () =>
  Object.entries(JEEP_AXLES).flatMap(([axle, z]) =>
    [-1, 1].flatMap((outward) =>
      jeepWheel(
        `wheel_${axle}_${outward < 0 ? 'left' : 'right'}`,
        `wheels_${axle}`,
        [outward < 0 ? -JEEP_BODY_HALF_WIDTH - 4 : JEEP_BODY_HALF_WIDTH, z],
        outward,
      ),
    ),
  );

/** La estrella blanca del capo (vista desde arriba). */
const STAR = '..w../.www./wwwww/.www./.w.w.';

/**
 * La carroceria: la bañera con su junta y la pala en el costado, el capo con la estrella y la
 * rejilla de delante, los guardabarros, los faros, el parachoques y la rueda de repuesto detras.
 */
function jeepBody(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const shovel = mark('shovel', 'west', '..bbbbbbbbbbbss', { b: '#7e5432', s: '#9aa3b6' }, [6, 3]);
  const grille = mark('grille', 'north', Array(4).fill('.k.k.k.k.k.k.k.k').join('/'), { k: darkColor }, [0, 2]);
  return [
    {
      name: 'tub',
      bone: 'hull',
      origin: [-9, 4, -14],
      size: [18, 7, 26],
      paint: team,
      stamps: [...band('tub_seam', [18, 7, 26], 4, darkColor), shovel, grille],
    },
    {
      name: 'hood',
      bone: 'hull',
      origin: [-8, 11, -14],
      size: [16, 2, 9],
      paint: team,
      stamps: [mark('hood_star', 'up', STAR, { w: '#f2f2ea' }, [5, 2])],
    },
    ...[-1, 1].map((sideSign) => ({
      name: `fender_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -13 : 9, 10, -15],
      size: [4, 1, 12],
      paint: dark,
    })),
    ...[-1, 1].map((sideSign) => ({
      name: `rear_fender_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -13 : 9, 10, 3],
      size: [4, 1, 12],
      paint: dark,
    })),
    { name: 'headlight_left', bone: 'hull', origin: [-8, 9, -15], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [5, 9, -15], size: [3, 2, 1], paint: 'lamp' },
    { name: 'bumper', bone: 'hull', origin: [-10, 4, -16], size: [20, 2, 1], paint: 'gun' },
    {
      name: 'spare_wheel',
      bone: 'hull',
      origin: [-4, 4, 12],
      size: [8, 8, 2],
      paint: 'tire',
      stamps: [mark('spare_cap', 'south', '.ss./ssss/ssss/.ss.', { s: HUB }, [2, 2])],
    },
    { name: 'jerrycan', bone: 'hull', origin: [5, 11, 9], size: [3, 4, 2], paint: 'canteen' },
  ];
}

/** El parabrisas levantado: los dos postes, la barra de arriba y el cristal. */
const JEEP_WINDSHIELD = [
  { name: 'windshield_post_left', origin: [-8.5, 13, -5.5], size: [1, 6, 1], paint: 'gun' },
  { name: 'windshield_post_right', origin: [7.5, 13, -5.5], size: [1, 6, 1], paint: 'gun' },
  { name: 'windshield_top', origin: [-8.5, 19, -5.5], size: [17, 1, 1], paint: 'gun' },
  {
    name: 'windshield',
    origin: [-7.5, 13, -5],
    size: [15, 6, 1],
    paint: 'glass',
    stamps: [mark('windshield_shine', 'north', 'w.../.w..', { w: SHINE }, [1, 1])],
  },
].map((part) => ({ ...part, bone: 'hull' }));

/** Los asientos (respaldos de cuero) y el volante delante del conductor. */
const JEEP_SEATS = [
  { name: 'seat_driver', origin: [-8, 11, 3], size: [7, 5, 2], paint: 'leather' },
  { name: 'seat_passenger', origin: [1, 11, 3], size: [7, 5, 2], paint: 'leather' },
  {
    name: 'steering_wheel',
    origin: [-6, 13, -4.5],
    size: [4, 4, 1],
    paint: 'gun',
    stamps: [mark('steering_ring', 'south', '.ss./s..s/s..s/.ss.', { s: '#6a7282' }, [0, 0])],
  },
].map((part) => ({ ...part, bone: 'hull' }));

/** El conductor, pequeño: cuerpo, cara seria, casco con gafas en 3D y las manos en el volante. */
/**
 * Un tripulante pequeño (conductor, artillero), desde la esquina de su cuerpo (`at`): cuerpo, cara
 * seria y casco con gafas en 3D. Sus piezas se llaman `<prefix>_...`.
 */
const crewman = (side, prefix, at, bone) =>
  [
    { name: `${prefix}_torso`, offset: [0, 0, 0], size: [6, 6, 4], paint: `team_${side}` },
    {
      name: `${prefix}_head`,
      offset: [-1, 6, 0],
      size: [8, 7, 7],
      paint: 'skin',
      stamps: [mark('driver_face', 'north', '.kk..kk./.kk..kk./......../...mm...', { k: EYE, m: MOUTH }, [0, 2])],
    },
    { name: `${prefix}_helmet`, offset: [-2, 11, -1], size: [10, 4, 9], paint: `team_${side}` },
    { name: `${prefix}_goggles`, offset: [-1, 11.5, -2], size: [8, 2, 1], paint: 'leather' },
    { name: `${prefix}_lens_left`, offset: [-0.5, 12, -3], size: [3, 1, 1], paint: 'glass' },
    { name: `${prefix}_lens_right`, offset: [3.5, 12, -3], size: [3, 1, 1], paint: 'glass' },
  ].map(({ offset, ...part }) => ({ ...part, bone, origin: plus(at, offset) }));

/** El conductor del jeep, con las manos en el volante. */
function jeepDriver(side) {
  const team = `team_${side}`;
  return [
    ...crewman(side, 'driver', [-7, 11, -1], 'hull'),
    { name: 'driver_arm_left', origin: [-9, 13, -4], size: [2, 2, 4], paint: team },
    { name: 'driver_arm_right', origin: [-3, 13, -4], size: [2, 2, 4], paint: team },
    { name: 'driver_hand_left', origin: [-8.5, 13.5, -5.5], size: [2, 2, 1], paint: 'skin' },
    { name: 'driver_hand_right', origin: [-3.5, 13.5, -5.5], size: [2, 2, 1], paint: 'skin' },
  ].map((part) => ({ bone: 'hull', ...part }));
}

/** Donde va la ametralladora: en el lado del acompañante, para que no la tape el conductor. */
const JEEP_GUN_X = 3.5;

/** El arco de detras de los asientos y la ametralladora en su poste: cajon, camisa con agujeros, cañon, boca, caja de balas y asas. */
const JEEP_GUN = [
  { name: 'rollbar_left', bone: 'hull', origin: [-9, 11, 6], size: [1, 9, 1], paint: 'gun' },
  { name: 'rollbar_right', bone: 'hull', origin: [8, 11, 6], size: [1, 9, 1], paint: 'gun' },
  { name: 'rollbar_top', bone: 'hull', origin: [-9, 20, 6], size: [18, 1, 1], paint: 'gun' },
  { name: 'gun_post', bone: 'turret', origin: [JEEP_GUN_X - 0.5, 11, 9], size: [1, 11, 1], paint: 'gun' },
  ...[
    {
      name: 'gun_receiver',
      origin: [-1.5, 22, 5],
      size: [3, 3, 6],
      paint: 'gun',
      stamps: ['east', 'west'].map((face) => mark('mg_side', face, '.ss..k', { s: '#6a7282', k: SLOT }, [0, 1])),
    },
    {
      name: 'gun_jacket',
      origin: [-1, 22.5, -2],
      size: [2, 2, 7],
      paint: 'steel',
      stamps: ['east', 'west', 'up'].map((face) =>
        mark(`mg_holes_${face}`, face, face === 'up' ? 'k./../k./../k./../k.' : '.k.k.k.', { k: SLOT }, [0, face === 'up' ? 0 : 1]),
      ),
    },
    { name: 'gun_barrel', origin: [-0.5, 23, -7], size: [1, 1, 5], paint: 'gun' },
    { name: 'gun_muzzle', origin: [-1, 22.5, -9], size: [2, 2, 2], paint: 'gun' },
    { name: 'gun_ammo', origin: [1.5, 21, 6], size: [2, 3, 3], paint: 'canteen' },
    { name: 'gun_handles', origin: [-1, 22.5, 11], size: [2, 2, 1], paint: 'steel' },
  ].map((part) => ({ ...part, bone: 'barrel', origin: plus(part.origin, [JEEP_GUN_X, 0, 0]) })),
];

/** El jeep: ruedas grandes, conductor con casco y gafas, estrella en el capo y la ametralladora en su poste. */
const jeep = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, JEEP_AXLES.front] },
    { name: 'wheels_back', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, JEEP_AXLES.back] },
    { name: 'turret', parent: 'hull', pivot: [JEEP_GUN_X, 11, 9.5] },
    { name: 'barrel', parent: 'turret', pivot: [JEEP_GUN_X, 23, 9] },
  ],
  motions: { ...WHEEL_MOTIONS, fire: onceMotion(0.4, [recoil('barrel'), kick('turret', 6), kick('hull', 3)]) },
  cubes: [...jeepWheels(), ...jeepBody(side), ...JEEP_WINDSHIELD, ...JEEP_SEATS, ...jeepDriver(side), ...JEEP_GUN],
});

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
  SSoldier: riotTrooper,
  MSoldier: mortar,
  FSoldier: biker,
  Tank: tank,
  HeavyTank: heavyTank,
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
