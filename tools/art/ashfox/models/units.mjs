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

// ---- Infanteria con detalle: el muñeco a 32 unidades por casilla (`detail: 2`) ----
//
// El doble de pixeles por lado que el muñeco de antes (16 por casilla): cara de soldado (ojos y boca seria), casco
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
 * El casco, con la copa y la nuca: con gafas (`look.goggles`, y su correa por los lados), con una
 * cinta oscura alrededor (`look.helmetBand`) o, el antidisturbios, con visera oscura delante (`look.brim`).
 */
function trooperHelmet(side, look) {
  const helmet = look.helmetPaint ?? `team_${side}`;
  const strap = look.goggles
    ? band('helmet_strap', TROOPER_HELMET, 2, BROWN, 2).filter((stamp) => stamp.face === 'east' || stamp.face === 'west')
    : look.helmetBand
      ? band('helmet_band', TROOPER_HELMET, 3, SIDES[side].dark[0], 2)
      : [];
  const brim = [{ name: 'brim', bone: 'head', origin: [-7, 23, -9], size: [14, 1, 2], paint: `dark_${side}` }];
  const front = look.goggles ? GOGGLES : look.brim ? brim : [];
  return [
    { name: 'helmet', bone: 'head', origin: [-7, 23, -7], size: TROOPER_HELMET, paint: helmet, stamps: strap },
    { name: 'helmet_top', bone: 'head', origin: [-5, 29, -5], size: [10, 2, 9], paint: helmet },
    { name: 'neck_guard', bone: 'head', origin: [-7, 20, 4], size: [14, 3, 2], paint: helmet },
    ...front,
  ];
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;
const roundToHalf = (value) => Math.round(value * 2) / 2;
const plus = (a, b) => a.map((value, axis) => value + b[axis]);
const minus = (a, b) => a.map((value, axis) => value - b[axis]);
/** Cubos subidos (o bajados) esa altura, con sus pivotes. */
const liftedBy = (cubes, height) =>
  cubes.map((cube) => ({
    ...cube,
    origin: plus(cube.origin, [0, height, 0]),
    ...(cube.pivot ? { pivot: plus(cube.pivot, [0, height, 0]) } : {}),
  }));

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

/**
 * El bazuca, apoyado encima del hombro derecho y algo alzado (que no apunte al suelo): tubo con las
 * bocas anchas (la de atras bien por detras del hombro), franja, mira junto a la cara y empuñadura.
 * Todo gira junto alrededor del punto de apoyo en el hombro.
 */
const BAZOOKA_REST = [7.5, 19.5, 0];
const BAZOOKA_LIFT = [10, 0, 0];
const BAZOOKA_GRIP = turnedAround([7.5, 16, -4], BAZOOKA_REST, BAZOOKA_LIFT);
const BAZOOKA = [
  {
    name: 'tube',
    origin: [6, 18, -11],
    size: [3, 3, 21],
    paint: 'gun',
    stamps: ['east', 'west'].map((face) => mark('tube_band', face, 'tt/tt/tt', { t: '#6a7282' }, [14, 0])),
  },
  {
    name: 'tube_front',
    origin: [5.5, 17.5, -13],
    size: [4, 4, 2],
    paint: 'steel',
    stamps: [mark('tube_bore', 'north', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [0, 0])],
  },
  {
    name: 'tube_back',
    origin: [5.5, 17.5, 10],
    size: [4, 4, 3],
    paint: 'steel',
    stamps: [mark('tube_back_bore', 'south', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [0, 0])],
  },
  { name: 'tube_grip', origin: [6.5, 15, -5], size: [2, 3, 2], paint: 'gun' },
  { name: 'tube_front_grip', origin: [6.5, 15, -10], size: [2, 3, 2], paint: 'gun' },
  { name: 'tube_rocket_tip', origin: [6.5, 18.5, -15], size: [2, 2, 2], paint: 'warhead' },
  { name: 'tube_pad', origin: [5.5, 17.5, -2], size: [4, 4, 4], paint: 'leather' },
  { name: 'tube_sight', origin: [5, 19, -5], size: [1, 2, 2], paint: 'steel' },
].map((part) => ({ ...part, bone: 'torso', rotation: BAZOOKA_LIFT, pivot: BAZOOKA_REST }));

/** El chaleco antibalas: placas oscuras con sus franjas, delante y detras, y dos bolsas y una granada delante. */
const flakVest = (side) => [
  ...[
    ['vest_front', -4],
    ['vest_back', 3],
  ].map(([name, z]) => ({
    name,
    bone: 'torso',
    origin: [-4.5, 11, z],
    size: [9, 6, 1],
    paint: `dark_${side}`,
    stamps: [mark('vest_stripes', z < 0 ? 'north' : 'south', 'lllllllll/........./lllllllll', { l: SIDES[side].team[2] }, [0, 1])],
  })),
  ...[-1, 1].map((sideSign) => ({
    name: `vest_pouch_${sideSign < 0 ? 'left' : 'right'}`,
    bone: 'torso',
    origin: [sideSign < 0 ? -4 : 1, 11.5, -5],
    size: [3, 3, 1],
    paint: 'pack',
    stamps: [mark('pouch_flap', 'north', 'ddd', { d: BROWN }, [0, 0])],
  })),
  {
    name: 'grenade',
    bone: 'torso',
    origin: [-1, 15, -5],
    size: [2, 2, 1],
    paint: 'canteen',
    stamps: [mark('grenade_pin', 'north', 'h.', { h: '#c4c8d0' }, [0, 0])],
  },
];

/** La bolsa de cohetes a la espalda: verde, con su solapa y dos cohetes de repuesto asomando por arriba (cuerpo oscuro y cabeza roja). */
const ROCKET_PACK = [
  {
    name: 'rocket_bag',
    bone: 'torso',
    origin: [-4.5, 9, 4],
    size: [9, 8, 3],
    paint: 'canteen',
    stamps: [mark('rocket_bag_flap', 'south', 'fffffffff/fffffffff/....y....', { f: '#4e5a3a', y: '#e8c040' }, [0, 0])],
  },
  ...[-3, 1].flatMap((x, index) => [
    { name: `spare_rocket_${index}`, bone: 'torso', origin: [x, 17, 5], size: [2, 3, 2], paint: 'gun' },
    { name: `spare_rocket_tip_${index}`, bone: 'torso', origin: [x, 20, 5], size: [2, 2, 2], paint: 'warhead' },
  ]),
];

/** El del bazuca: casco con cinta, chaleco con bolsas y granada, la bolsa de cohetes a la espalda y el bazuca encima del hombro, algo alzado, cogido por la empuñadura; la otra mano libre. */
const bazooka = (side) => ({
  detail: DETAIL,
  bones: TROOPER_BONES,
  cubes: [
    ...trooper(side, { helmetBand: true }),
    ...trooperArm(side, 'arm_right', { shoulder: [40, 0, -5], grip: BAZOOKA_GRIP }),
    ...trooperArm(side, 'arm_left', { shoulder: [10, 0, -10], grip: [-8, 9, -3] }),
    ...flakVest(side),
    ...ROCKET_PACK,
    ...BAZOOKA,
  ],
  motions: TROOPER_MOTIONS,
});

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
    ...trooper(side, { mask: true, brim: true }),
    ...trooperArm(side, 'arm_right', { shoulder: [30, 0, 10], grip: PISTOL_GRIP }),
    ...trooperArm(side, 'arm_left', { shoulder: [40, 0, 20], grip: SHIELD_GRIP }),
    ...RIOT_ARMOR,
    riotShield(side),
    ...PISTOL,
  ],
  motions: RIOT_MOTIONS,
});

// ---- El del mortero: agachado sobre el mortero, soltando la granada en el tubo ----

/**
 * La pose (como en la foto de referencia): en zancada, la pierna izquierda adelantada y doblada y la
 * derecha estirada atras; el cuerpo inclinado sobre el tubo; las dos manos sueltan la granada en la
 * boca del mortero, que tiene delante.
 */
const MORTARMAN_HIPS = [0, 9, 1];
const MORTARMAN_LEAN = [-15, 0, 0];
const MORTARMAN_DROP = 0;
const bentOver = (point) => turnedAround(plus(point, [0, MORTARMAN_DROP, 0]), MORTARMAN_HIPS, MORTARMAN_LEAN).map(roundToHalf);

/** El tubo del mortero: apoyado delante en su placa y alzado hacia el soldado, con la boca donde estan sus manos. */
const MORTAR_BASE = [5, 1, -16];
const MORTAR_TILT = { rotation: [25, 0, 0], pivot: MORTAR_BASE };
const MORTAR_LENGTH = 13;
const alongTube = (distance) => turnedAround(plus(MORTAR_BASE, [0, distance, 0]), MORTAR_BASE, MORTAR_TILT.rotation).map(roundToHalf);
const MORTAR_MUZZLE = alongTube(MORTAR_LENGTH);
const BIPOD_TOP = alongTube(8);

/** El mortero: placa base con su borde, tubo, boca, bipode con su abrazadera y la caja de granadas con dos sueltas. */
const MORTAR = [
  {
    name: 'mortar_plate',
    bone: 'gear',
    origin: [1, 0, -19.5],
    size: [8, 1, 7],
    paint: 'steel',
    stamps: [
      mark(
        'plate_rim',
        'up',
        ['kkkkkkkk', 'k......k', 'k......k', 'k......k', 'k......k', 'k......k', 'kkkkkkkk'].join('/'),
        { k: '#5a6272' },
        [0, 0],
      ),
    ],
  },
  { name: 'mortar_tube', bone: 'gear', origin: [4, 1, -17], size: [2, MORTAR_LENGTH, 2], paint: 'gun', ...MORTAR_TILT },
  {
    name: 'mortar_muzzle',
    bone: 'gear',
    origin: [3.5, 1 + MORTAR_LENGTH - 1, -17.5],
    size: [3, 1, 3],
    paint: 'steel',
    stamps: [mark('mortar_bore', 'up', '.k./kkk/.k.', { k: SLOT }, [0, 0])],
    ...MORTAR_TILT,
  },
  { name: 'bipod_clamp', bone: 'gear', origin: plus(BIPOD_TOP, [-2, -1, -1]), size: [4, 2, 2], paint: 'steel' },
  ...[-1, 1].map((sideSign) =>
    limb(`bipod_leg_${sideSign < 0 ? 'left' : 'right'}`, 'gear', BIPOD_TOP, [5 + sideSign * 4.5, 0, -8], 1, 'gun'),
  ),
  { name: 'bipod_wheel', bone: 'gear', origin: plus(BIPOD_TOP, [2, -2, -1]), size: [1, 2, 2], paint: 'gun' },
  {
    name: 'shell_box',
    bone: 'gear',
    origin: [-13, 0, -3],
    size: [5, 3, 6],
    paint: 'canteen',
    stamps: [mark('shell_tips', 'up', 'r.r/.../r.r', { r: '#d8323a' }, [1, 1])],
  },
  ...[0, 1].map((index) => ({
    name: `loose_shell_${index}`,
    bone: 'gear',
    origin: [-12 + index * 3, 0, 4],
    size: [2, 2, 4],
    paint: 'canteen',
  })),
];

/** La granada que suelta en el tubo: aletas abajo, cuerpo verde y punta roja arriba. */
const DROPPING_SHELL = [
  { name: 'shell_fins', origin: plus(MORTAR_MUZZLE, [-1.5, 0.5, -1.5]), size: [3, 1, 3], paint: 'gun' },
  { name: 'shell_body', origin: plus(MORTAR_MUZZLE, [-1, 1.5, -1]), size: [2, 4, 2], paint: 'canteen' },
  { name: 'shell_tip', origin: plus(MORTAR_MUZZLE, [-1, 5.5, -1]), size: [2, 1, 2], paint: 'warhead' },
].map((part) => ({ ...part, bone: 'body' }));

/** El soldado: el muñeco (cuerpo, cabeza y casco de camuflaje con gafas) inclinado, piernas en zancada y las manos en la granada. */
function mortarman(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const upperBody = liftedBy(
    [...trooperTorso(side, {}), trooperHead(side, {}), ...trooperHelmet(side, { goggles: true, helmetPaint: `camo_${side}` })],
    MORTARMAN_DROP,
  ).map((cube) => ({ ...cube, bone: 'body', rotation: MORTARMAN_LEAN, pivot: MORTARMAN_HIPS }));
  const legs = [
    { label: 'left', hip: [-2.5, 9, 0], knee: [-3, 7, -6], foot: [-3.5, 1.5, -6.5] },
    { label: 'right', hip: [2.5, 9, 1], knee: [3.5, 5, 5], foot: [4, 1.5, 9] },
  ].flatMap(({ label, hip, knee, foot }) => [
    limb(`thigh_${label}`, 'body', hip, knee, 4, dark),
    limb(`shin_${label}`, 'body', knee, foot, 4, dark),
    {
      name: `boot_${label}`,
      bone: 'body',
      origin: plus(foot, [-2, -1.5, -4]),
      size: [4, 3, 6],
      paint: 'boot_grey',
      stamps: band('sole', [4, 3, 6], 2, SOLE),
    },
  ]);
  const arms = [-1, 1].flatMap((sideSign) => {
    const label = sideSign < 0 ? 'left' : 'right';
    const shoulder = bentOver([sideSign * 7, 16, 0]);
    const elbow = sideSign < 0 ? [-2, 13, -7] : [9, 12, -6];
    const hand = plus(MORTAR_MUZZLE, [sideSign * 2.5, 3, 0]);
    return [
      limb(`upper_arm_${label}`, 'body', shoulder, elbow, 3, team),
      limb(`forearm_${label}`, 'body', elbow, hand, 3, team),
      { name: `hand_${label}`, bone: 'body', origin: plus(hand, [-1.5, -1.5, -1.5]), size: [3, 3, 3], paint: 'skin' },
    ];
  });
  return [...upperBody, ...legs, ...arms, ...DROPPING_SHELL];
}

/** El del mortero: agachado sobre su mortero, soltando la granada en el tubo con las dos manos. */
const mortar = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'body', parent: 'root', pivot: MORTARMAN_HIPS },
    { name: 'gear', parent: 'root', pivot: [0, 0, 0] },
  ],
  motions: {
    idle: loopMotion(1.6, [sway('body', [2, 2, 0], 1.6)]),
    drive: loopMotion(0.5, [sway('body', [3, 0, 2], 0.5)], 'linear'),
    fire: onceMotion(0.4, [kick('body', 6), kick('gear', -3)]),
  },
  cubes: [...mortarman(side), ...MORTAR],
});

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

/** El casco, de ese largo: guardabarros sobre las orugas con su borde claro y su junta, el bajo oscuro, la placa de delante con los faros, la rejilla del motor y la caja de herramientas. */
function bigTankHull(side, length = 28) {
  const front = -length / 2;
  const { teamRim, dark } = SIDES[side];
  const edge = ['east', 'west', 'north', 'south'].map((face) => {
    const width = face === 'north' || face === 'south' ? 30 : length;
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
    { name: 'lower_hull', bone: 'hull', origin: [-7, 2, front + 2], size: [14, 6, length - 4], paint: `dark_${side}` },
    { name: 'hull', bone: 'hull', origin: [-15, 8, front], size: [30, 4, length], paint: `team_${side}`, stamps: edge },
    { name: 'front_plate', bone: 'hull', origin: [-14, 9, front - 1], size: [28, 3, 1], paint: `dark_${side}` },
    { name: 'headlight_left', bone: 'hull', origin: [-13, 10, front - 2], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [10, 10, front - 2], size: [3, 2, 1], paint: 'lamp' },
    {
      name: 'engine_deck',
      bone: 'hull',
      origin: [-8, 12, -front - 5],
      size: [16, 1, 5],
      paint: `dark_${side}`,
      stamps: [mark('grille', 'up', grille, { g: TRACK_GAP }, [0, 0])],
    },
    {
      name: 'toolbox',
      bone: 'hull',
      origin: [9, 12, front + 2],
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

/** El tanque ligero: orugas y casco mas cortos, torreta redondeada y un solo cañon gordo del color del equipo. */
function lightTankTurret(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const seams = ['east', 'west'].map((face) =>
    mark(
      'light_turret_seam',
      face,
      ['.r...r...r.', ...Array(5).fill('.....d.....')].join('/'),
      { d: SIDES[side].dark[0], r: SIDES[side].dark[0] },
      [0, 1],
    ),
  );
  return [
    { name: 'turret', bone: 'turret', origin: [-6, 12, -4], size: [12, 7, 11], paint: team, stamps: seams },
    { name: 'turret_top', bone: 'turret', origin: [-5, 19, -3], size: [10, 1, 9], paint: team },
    {
      name: 'hatch',
      bone: 'turret',
      origin: [-3, 20, 0],
      size: [5, 1, 5],
      paint: dark,
      stamps: [mark('hatch_handle', 'up', 'hhh', { h: WHEEL_HUB }, [1, 2])],
    },
    { name: 'mantlet', bone: 'turret', origin: [-3, 13, -6], size: [6, 5, 2], paint: dark },
    { name: 'antenna', bone: 'turret', origin: [4, 19, 5], size: [1, 8, 1], paint: 'gun' },
    { name: 'barrel', bone: 'barrel', origin: [-1.5, 14, -17], size: [3, 3, 11], paint: team },
    {
      name: 'muzzle',
      bone: 'barrel',
      origin: [-2, 13.5, -19],
      size: [4, 4, 2],
      paint: dark,
      stamps: [mark('light_bore', 'north', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [0, 0])],
    },
  ];
}

const lightTank = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'chassis', parent: 'root', pivot: [0, 4, 0] },
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'turret', parent: 'hull', pivot: [0, 12, 1] },
    { name: 'barrel', parent: 'turret', pivot: [0, 15.5, -6] },
  ],
  motions: VEHICLE_MOTIONS,
  cubes: [...bigTracks(24), ...bigTankHull(side, 24), ...lightTankTurret(side)],
});

/**
 * El anfibio: un aerodeslizador. La falda de goma negra (con sus costuras), el casco del equipo con
 * el borde claro, la torreta del tanque ligero con su cañon y, detras, el gran ventilador en su marco
 * (aspas blancas que giran).
 */
function hovercraftHull(side) {
  const { teamRim, dark } = SIDES[side];
  const edge = ['east', 'west', 'north', 'south'].map((face) =>
    mark(
      `hover_edge${face}`,
      face,
      `${'r'.repeat(24)}/${'.'.repeat(24)}/${'.'.repeat(24)}/${'.'.repeat(24)}/${'d'.repeat(24)}`,
      { r: teamRim, d: dark[0] },
      [0, 0],
    ),
  );
  return [
    {
      name: 'skirt',
      bone: 'chassis',
      origin: [-15, 0, -14],
      size: [30, 4, 28],
      paint: 'rubber',
      stamps: ['east', 'west'].map((face) =>
        mark('skirt_seams', face, Array(4).fill('k...'.repeat(7)).join('/'), { k: TRACK_GAP }, [0, 0]),
      ),
    },
    { name: 'skirt_top', bone: 'chassis', origin: [-14, 4, -13], size: [28, 1, 26], paint: 'rubber' },
    { name: 'hull', bone: 'hull', origin: [-12, 5, -12], size: [24, 5, 24], paint: `team_${side}`, stamps: edge },
    { name: 'headlight_left', bone: 'hull', origin: [-11, 7, -13], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [8, 7, -13], size: [3, 2, 1], paint: 'lamp' },
  ];
}

/**
 * El ventilador de detras, integrado en el casco: una carcasa cuadrada del color del equipo, apoyada
 * en el casco, con el hueco redondeado a escalones (como el pixel art) y el borde de arriba oscuro;
 * dentro, las aspas blancas con el buje rojo, que giran; detras, dos timones oscuros en los bordes.
 */
const FAN_CENTER = [0, 17, 10];
const FAN_HOUSING_Z = 8;
const FAN_HOUSING_DEPTH = 4;

function fanHousing(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const part = (name, [x, y], [w, h], paint = team) => ({
    name,
    bone: 'hull',
    origin: [x, y, FAN_HOUSING_Z],
    size: [w, h, FAN_HOUSING_DEPTH],
    paint,
  });
  return [
    part('fan_housing_top', [-9, 22], [18, 2], dark),
    part('fan_housing_bottom', [-9, 10], [18, 2]),
    part('fan_housing_left', [-9, 12], [3, 10]),
    part('fan_housing_right', [6, 12], [3, 10]),
    part('fan_corner_top_left', [-6, 20], [2, 2]),
    part('fan_corner_top_right', [4, 20], [2, 2]),
    part('fan_corner_bottom_left', [-6, 12], [2, 2]),
    part('fan_corner_bottom_right', [4, 12], [2, 2]),
    ...[-1, 1].map((sideSign) => ({
      name: `rudder_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -8 : 7, 12, FAN_HOUSING_Z + FAN_HOUSING_DEPTH],
      size: [1, 10, 3],
      paint: dark,
    })),
  ];
}

const hoverFan = (side) => [
  ...fanHousing(side),
  {
    name: 'fan_blade_a',
    bone: 'fan',
    origin: [FAN_CENTER[0] - 5, FAN_CENTER[1] - 1, FAN_CENTER[2] - 0.5],
    size: [10, 2, 1],
    paint: 'missile',
  },
  {
    name: 'fan_blade_b',
    bone: 'fan',
    origin: [FAN_CENTER[0] - 1, FAN_CENTER[1] - 5, FAN_CENTER[2] - 0.5],
    size: [2, 10, 1],
    paint: 'missile',
  },
  {
    name: 'fan_hub',
    bone: 'fan',
    origin: [FAN_CENTER[0] - 1.5, FAN_CENTER[1] - 1.5, FAN_CENTER[2] - 1.5],
    size: [3, 3, 2],
    paint: 'warhead',
  },
];

const amphibiousTank = (side) => {
  const fanSpin = (duration, turns) => spin('fan', duration, { axis: 2, symmetry: 90, sign: 1, turns });
  return {
    detail: DETAIL,
    bones: [
      { name: 'chassis', parent: 'root', pivot: [0, 2, 0] },
      { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
      { name: 'turret', parent: 'hull', pivot: [0, 10, 1] },
      { name: 'barrel', parent: 'turret', pivot: [0, 13.5, -6] },
      { name: 'fan', parent: 'hull', pivot: FAN_CENTER },
    ],
    motions: {
      idle: loopMotion(1.2, [sway('hull', [0.6, 0, 0.4], 1.2), fanSpin(1.2, 3)]),
      drive: loopMotion(0.4, [sway('hull', [-2, 0, 1], 0.4), fanSpin(0.4, 2)]),
      fire: VEHICLE_MOTIONS.fire,
    },
    cubes: [...hovercraftHull(side), ...liftedBy(lightTankTurret(side), -2), ...hoverFan(side)],
  };
};

/**
 * La artilleria: un obus autopropulsado. Orugas y casco bajo; detras, la casamata grande (con
 * puertas, rejillas, escotilla y antena) de la que sale el cañon largo del color del equipo, alzado,
 * con su manguito y el freno de boca; y atras del todo, las dos palas de anclaje plegadas.
 */
const ARTILLERY_GUN_LIFT = [35, 0, 0];
const ARTILLERY_TRUNNION = [0, 18, -7];

function artilleryHull(side) {
  const { teamRim, dark } = SIDES[side];
  const edge = ['east', 'west'].map((face) =>
    mark('artillery_edge', face, `${'r'.repeat(28)}/${'.'.repeat(28)}/${'d'.repeat(28)}`, { r: teamRim, d: dark[0] }, [0, 0]),
  );
  return [
    { name: 'lower_hull', bone: 'hull', origin: [-7, 2, -12], size: [14, 6, 24], paint: `dark_${side}` },
    { name: 'hull', bone: 'hull', origin: [-15, 8, -14], size: [30, 4, 28], paint: `team_${side}`, stamps: edge },
    { name: 'front_plate', bone: 'hull', origin: [-14, 9, -15], size: [28, 3, 1], paint: `dark_${side}` },
    { name: 'headlight_left', bone: 'hull', origin: [-13, 10, -16], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [10, 10, -16], size: [3, 2, 1], paint: 'lamp' },
    ...[-1, 1].map((sideSign) => ({
      name: `spade_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -11 : 5, 3, 14],
      size: [6, 8, 1],
      paint: 'gun',
      stamps: [mark('spade_teeth', 'south', 'k.k.k./....../....../....../....../....../....../k.k.k.', { k: '#6a7282' }, [0, 0])],
    })),
    {
      name: 'ammo_box',
      bone: 'hull',
      origin: [-14, 12, -13],
      size: [6, 3, 5],
      paint: 'canteen',
      stamps: [mark('ammo_latch', 'north', 'yy', { y: '#e8c040' }, [2, 1])],
    },
  ];
}

/** La casamata: grande, del equipo, con puertas a los lados, rejillas detras, techo oscuro con escotilla y antena, y el mantelete delante. */
function artilleryCasemate(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const door = ['dddddd', ...Array(2).fill('d....d'), 'd...hd', ...Array(3).fill('d....d'), 'dddddd'].join('/');
  return [
    {
      name: 'casemate',
      bone: 'turret',
      origin: [-10, 12, -6],
      size: [20, 11, 18],
      paint: team,
      stamps: [
        ...['east', 'west'].map((face) => mark('casemate_door', face, door, { d: darkColor, h: WHEEL_HUB }, [7, 2])),
        mark('casemate_vents', 'south', Array(4).fill('kkkkkkkkkkkk/............').join('/'), { k: TRACK_GAP }, [4, 2]),
      ],
    },
    { name: 'casemate_roof', bone: 'turret', origin: [-9, 23, -5], size: [18, 1, 16], paint: dark },
    {
      name: 'casemate_hatch',
      bone: 'turret',
      origin: [2, 24, 3],
      size: [5, 1, 5],
      paint: team,
      stamps: [mark('casemate_handle', 'up', 'hhh', { h: WHEEL_HUB }, [1, 2])],
    },
    { name: 'casemate_antenna', bone: 'turret', origin: [-8, 24, 10], size: [1, 9, 1], paint: 'gun' },
    { name: 'mantlet', bone: 'turret', origin: [-5, 14, -8], size: [10, 8, 2], paint: dark },
  ];
}

/** El cañon largo del color del equipo, alzado, con su manguito oscuro y el freno de boca con las ranuras. */
function artilleryGun(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const lifted = { rotation: ARTILLERY_GUN_LIFT, pivot: ARTILLERY_TRUNNION };
  return [
    { name: 'gun_barrel', bone: 'barrel', origin: [-2, 16, -29], size: [4, 4, 22], paint: team, ...lifted },
    { name: 'gun_sleeve', bone: 'barrel', origin: [-2.5, 15.5, -14], size: [5, 5, 5], paint: dark, ...lifted },
    {
      name: 'gun_brake',
      bone: 'barrel',
      origin: [-3, 15, -32],
      size: [6, 6, 3],
      paint: 'gun',
      stamps: [
        mark('gun_bore', 'north', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [1, 1]),
        ...['east', 'west'].map((face) => mark('brake_slots', face, 'k.k/k.k/k.k', { k: SLOT }, [0, 1])),
      ],
      ...lifted,
    },
  ];
}

const artillery = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'chassis', parent: 'root', pivot: [0, 4, 0] },
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'turret', parent: 'hull', pivot: [0, 12, 3] },
    { name: 'barrel', parent: 'turret', pivot: ARTILLERY_TRUNNION },
  ],
  motions: VEHICLE_MOTIONS,
  cubes: [...bigTracks(28), ...artilleryHull(side), ...artilleryCasemate(side), ...artilleryGun(side)],
});

/**
 * El antiaereo: orugas y el casco del tanque; encima, una torreta alta y cuadrada (juntas, remaches,
 * techo oscuro con escotilla) con un cañon gordo a cada lado, por fuera, en su afuste (camisa,
 * freno de boca) y alzado; arriba, detras, el radar de busqueda que gira y, delante, el de tiro.
 */
const ANTIAIR_GUN_LIFT = [30, 0, 0];
const ANTIAIR_TRUNNION = [0, 17, -2];

function antiairTurret(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const seams = ['east', 'west'].map((face) =>
    mark(
      'antiair_seams',
      face,
      [rivetRow(16, 4), ...Array(6).fill('.......d........'), rivetRow(16, 4)].join('/'),
      { d: darkColor, r: darkColor },
      [0, 0],
    ),
  );
  return [
    { name: 'turret', bone: 'turret', origin: [-8, 12, -7], size: [16, 9, 16], paint: team, stamps: seams },
    { name: 'turret_front', bone: 'turret', origin: [-7, 13, -9], size: [14, 6, 2], paint: team },
    { name: 'turret_roof', bone: 'turret', origin: [-7, 21, -6], size: [14, 1, 14], paint: dark },
    {
      name: 'turret_hatch',
      bone: 'turret',
      origin: [1, 22, 0],
      size: [5, 1, 5],
      paint: team,
      stamps: [mark('hatch_handle', 'up', 'hhh', { h: WHEEL_HUB }, [1, 2])],
    },
    { name: 'radar_mast', bone: 'turret', origin: [-4, 22, 4], size: [2, 3, 2], paint: 'gun' },
    {
      name: 'tracking_radar',
      bone: 'turret',
      origin: [-3, 19, -10],
      size: [6, 5, 1],
      paint: 'steel',
      stamps: [mark('tracking_dish', 'north', '.kkkk./kk..kk/k.hh.k/kk..kk/.kkkk.', { k: '#6a7282', h: SLOT }, [0, 0])],
    },
  ];
}

/** El radar de busqueda: la antena ancha con su rejilla, que gira sobre el mastil. */
const ANTIAIR_RADAR = [
  {
    name: 'radar_dish',
    bone: 'radar',
    origin: [-8, 25, 4.5],
    size: [8, 4, 1],
    paint: 'steel',
    stamps: ['north', 'south'].map((face) => mark('radar_grid', face, 'k.k.k.k./.k.k.k.k/k.k.k.k./.k.k.k.k', { k: '#6a7282' }, [0, 0])),
  },
];

/** Los dos cañones gordos, uno a cada lado de la torreta (por fuera), en su afuste, alzados: cañon, camisa y freno de boca. */
const antiairGuns = (side) =>
  [-1, 1].flatMap((sideSign) => {
    const label = sideSign < 0 ? 'left' : 'right';
    const x = sideSign < 0 ? -10.5 : 10.5;
    const lifted = { rotation: ANTIAIR_GUN_LIFT, pivot: [x, ANTIAIR_TRUNNION[1], ANTIAIR_TRUNNION[2]] };
    return [
      { name: `gun_mount_${label}`, bone: 'barrel', origin: [x - 2.5, 13, -6], size: [5, 7, 10], paint: `dark_${side}` },
      { name: `gun_${label}`, bone: 'barrel', origin: [x - 1, 16, -24], size: [2, 2, 18], paint: 'gun', ...lifted },
      { name: `gun_jacket_${label}`, bone: 'barrel', origin: [x - 1.5, 15.5, -11], size: [3, 3, 5], paint: 'steel', ...lifted },
      {
        name: `gun_brake_${label}`,
        bone: 'barrel',
        origin: [x - 1.5, 15.5, -26],
        size: [3, 3, 2],
        paint: `dark_${side}`,
        stamps: [mark('brake_hole', 'north', '.k./kkk/.k.', { k: SLOT }, [0, 0])],
        ...lifted,
      },
    ];
  });

const antiair = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'chassis', parent: 'root', pivot: [0, 4, 0] },
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'turret', parent: 'hull', pivot: [0, 12, 1] },
    { name: 'barrel', parent: 'turret', pivot: ANTIAIR_TRUNNION },
    { name: 'radar', parent: 'turret', pivot: [-3, 25, 5] },
  ],
  motions: {
    ...VEHICLE_MOTIONS,
    idle: loopMotion(2.4, [sway('hull', [0.6, 0, 0.4], 2.4), spin('radar', 2.4, { axis: 1, symmetry: 360, steps: 8, sign: 1 })]),
  },
  cubes: [...bigTracks(28), ...bigTankHull(side, 28), ...antiairTurret(side), ...ANTIAIR_RADAR, ...antiairGuns(side)],
});

/** Remaches en fila: uno cada `step` en una cara de ese ancho. */
const rivetRow = (width, step) => [...Array(width)].map((_, x) => (x % step === step / 2 ? 'r' : '.')).join('');

/** Franjas de peligro (amarillo y negro, en diagonal) de ese ancho y alto. */
const hazardStripes = (width, height) =>
  [...Array(height)].map((_, row) => [...Array(width)].map((_, x) => ((x + row) % 6 < 3 ? 'y' : 'k')).join('')).join('/');

/**
 * El bloqueador: un blindado alto sobre orugas que cierra el paso. El frente, redondeado a escalones
 * (como en el 2D), con la mirilla oscura; una banda blindada con remaches alrededor; mirillas
 * pequeñas a los lados; delante, abajo, la pala con franjas de peligro; arriba, escotilla,
 * periscopio y foco; detras, la puerta y los tubos de escape.
 */
function blockerArmor(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const bandRivets = (width) => [`${'d'.repeat(width)}`, rivetRow(width, 4), `${'d'.repeat(width)}`].join('/');
  return [
    {
      name: 'box',
      bone: 'hull',
      origin: [-13, 8, -9],
      size: [26, 22, 22],
      paint: team,
      stamps: [
        ...['east', 'west'].map((face) => mark('box_band', face, bandRivets(22), { d: darkColor, r: WHEEL_HUB }, [0, 10])),
        mark('box_band_back', 'south', bandRivets(26), { d: darkColor, r: WHEEL_HUB }, [0, 10]),
        ...['east', 'west'].map((face) => mark('side_slit', face, 'kkkk', { k: TRACK_GAP }, [4, 5])),
      ],
    },
    {
      name: 'front_curve_1',
      bone: 'hull',
      origin: [-13, 9, -11],
      size: [26, 19, 2],
      paint: team,
      stamps: [mark('front_band', 'north', bandRivets(26), { d: darkColor, r: WHEEL_HUB }, [0, 9])],
    },
    { name: 'front_curve_2', bone: 'hull', origin: [-12, 11, -13], size: [24, 14, 2], paint: team },
    { name: 'vision_slit', bone: 'hull', origin: [-5, 21, -14], size: [10, 2, 1], paint: 'tread' },
    { name: 'roof', bone: 'hull', origin: [-12, 30, -8], size: [24, 1, 20], paint: dark },
    {
      name: 'hatch',
      bone: 'hull',
      origin: [-4, 31, -1],
      size: [8, 1, 8],
      paint: team,
      stamps: [mark('hatch_handle', 'up', 'hhhh', { h: WHEEL_HUB }, [2, 3])],
    },
    {
      name: 'periscope',
      bone: 'hull',
      origin: [5, 31, -6],
      size: [3, 2, 2],
      paint: 'gun',
      stamps: [mark('periscope_glass', 'north', 'ggg', { g: WINDOW_GLASS }, [0, 0])],
    },
    {
      name: 'searchlight',
      bone: 'hull',
      origin: [-9, 31, -6],
      size: [3, 3, 2],
      paint: 'gun',
      stamps: [mark('searchlight_glass', 'north', 'll/ll', { l: HEADLIGHT }, [0, 0])],
    },
    {
      name: 'plow',
      bone: 'hull',
      origin: [-15, 1, -17],
      size: [30, 7, 2],
      paint: 'gun',
      stamps: [mark('plow_stripes', 'north', hazardStripes(30, 5), { y: '#e8c020', k: '#1a1e28' }, [0, 1])],
    },
    { name: 'lower_hull', bone: 'hull', origin: [-7, 2, -12], size: [14, 6, 24], paint: dark },
    // Los brazos de la pala salen del bajo, entre las orugas (no de las orugas).
    ...[-1, 1].map((sideSign) => ({
      name: `plow_arm_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -6 : 4, 4, -15],
      size: [2, 2, 3],
      paint: 'gun',
    })),
    { name: 'headlight_left', bone: 'hull', origin: [-11, 25, -12], size: [3, 2, 1], paint: 'lamp' },
    { name: 'headlight_right', bone: 'hull', origin: [8, 25, -12], size: [3, 2, 1], paint: 'lamp' },
    {
      name: 'back_door',
      bone: 'hull',
      origin: [-5, 9, 13],
      size: [10, 15, 1],
      paint: dark,
      stamps: [mark('door_handle', 'south', 'hh', { h: WHEEL_HUB }, [7, 6])],
    },
    ...[-1, 1].map((sideSign) => ({
      name: `exhaust_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -11 : 9, 20, 13],
      size: [2, 8, 2],
      paint: 'steel',
      stamps: [mark('exhaust_soot', 'up', 'kk/kk', { k: TRACK_GAP }, [0, 0])],
    })),
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

const WHEEL_MOTIONS = {
  idle: loopMotion(1.2, [sway('hull', [0.5, 0, 0.5], 1.2)]),
  drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [-1.5, 0, 1], 0.4)], 'linear'),
  fire: onceMotion(0.5, [kick('hull', 4)]),
};

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

// ---- El de suministros con detalle: el camion con la caja abierta y la carga ----

/** Una caja de madera de lado `size`: tablas (marco oscuro y una tabla en medio) en todas las caras. */
const woodCrate = (name, origin, size) => {
  const plank = 'd'.repeat(size);
  const middle = `d${'.'.repeat(size - 2)}d`;
  const rows = [plank, ...Array(size - 2).fill(middle)].map((row, index) => (index === Math.floor(size / 2) ? plank : row));
  const frame = [...rows, plank].join('/');
  return {
    name,
    bone: 'hull',
    origin,
    size: [size, size, size],
    paint: 'crate',
    stamps: FACES_AROUND.map((face) => mark(`crate_frame${size}`, face, frame, { d: '#6a3e1c' }, [0, 0])),
  };
};

/** Una caja de suministros (de lado 6): madera con su marco y la cruz amarilla de suministros en los lados y arriba. */
const SUPPLY_CRATE_FACE = ['dddddd', 'd.yy.d', 'dyyyyd', 'dyyyyd', 'd.yy.d', 'dddddd'].join('/');
const supplyCrate = (name, origin) => ({
  ...woodCrate(name, origin, 6),
  stamps: [
    ...FACES_AROUND.map((face) => mark('supply_crate_frame', face, SUPPLY_CRATE_FACE, { d: '#6a3e1c', y: '#e8c020' }, [0, 0])),
    mark('supply_crate_top', 'up', '.yy./yyyy/yyyy/.yy.', { y: '#e8c020' }, [1, 1]),
  ],
});

/** La carga, ordenada: cajas de suministros (tres abajo y dos encima) con su cincha verde y, detras, el soporte con cuatro bidones. */
const SUPPLY_CARGO = [
  ...[-9, -3, 3].map((x, index) => supplyCrate(`crate_low_${index}`, [x, 8, -6])),
  ...[-6, 0].map((x, index) => supplyCrate(`crate_high_${index}`, [x, 14, -6])),
  { name: 'cargo_strap', bone: 'hull', origin: [-9.5, 13, -3.5], size: [19, 1, 1], paint: 'canteen' },
  { name: 'can_rack', bone: 'hull', origin: [-9, 8, 4], size: [18, 1, 7], paint: 'gun' },
  ...[0, 1, 2, 3].map((index) => ({
    name: `jerrycan_${index}`,
    bone: 'hull',
    origin: [-8 + index * 4, 9, 5],
    size: [3, 6, 4],
    paint: 'canteen',
    stamps: [
      mark('jerrycan_cross', 'south', 'k.k/.k./k.k', { k: '#3a4430' }, [0, 1]),
      mark('jerrycan_cap', 'up', 'y', { y: '#e8c040' }, [1, 1]),
    ],
  })),
];

/** La caja abierta del camion: la plataforma, los laterales del equipo, la trampilla con sus cierres y los pilotos. */
function openBed(side) {
  const team = `team_${side}`;
  return [
    { name: 'bed', bone: 'hull', origin: [-11, 5, -7], size: [22, 3, 22], paint: `dark_${side}` },
    ...[-1, 1].map((sideSign) => ({
      name: `bed_side_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -11 : 10, 8, -7],
      size: [1, 4, 22],
      paint: team,
    })),
    {
      name: 'tailgate',
      bone: 'hull',
      origin: [-10, 8, 14],
      size: [20, 4, 1],
      paint: team,
      stamps: [mark('tailgate_latches', 'south', 'h..................h', { h: WHEEL_HUB }, [0, 1])],
    },
    { name: 'tail_light_left', bone: 'hull', origin: [-10, 6, 15], size: [2, 1, 1], paint: 'warhead' },
    { name: 'tail_light_right', bone: 'hull', origin: [8, 6, 15], size: [2, 1, 1], paint: 'warhead' },
  ];
}

/**
 * El de suministros: el mismo camion que el transporte (cabina, ruedas y medidas: mas pequeño parecia
 * de juguete a su lado) con la caja abierta y la carga ordenada.
 */
const supplier = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, TRUCK_AXLES.front] },
    { name: 'wheels_back', parent: 'root', pivot: [0, JEEP_WHEEL_RADIUS, TRUCK_AXLES.back] },
  ],
  motions: WHEEL_MOTIONS,
  cubes: [...truckWheels(), ...truckCabin(side), ...openBed(side), ...SUPPLY_CARGO],
});

/** El lanzamisiles: el camion (cabina del transporte) con la plataforma, el pie que gira, el piston y la rampa alzada con el misil blanco de punta y aletas rojas. */
const MISSILE_LIFT = { rotation: [35, 0, 0], pivot: [0, 11, 6] };

/**
 * Donde apoyan los pistones en la rampa (por debajo, en mitad de su largo), ya alzada: los pistones
 * llegan hasta ahi desde la plataforma, asi se ven sujetarla.
 */
const RAIL_SUPPORT = turnedAround([0, 11, -7], MISSILE_LIFT.pivot, MISSILE_LIFT.rotation).map(roundToHalf);
const BED_TOP = 8;
const SLEEVE_HEIGHT = 6;

/** Un piston hidraulico, a un lado bajo la rampa: la camisa gruesa abajo y el vastago hasta la rampa. */
const launcherPiston = (sideSign) => {
  const label = sideSign < 0 ? 'left' : 'right';
  const x = sideSign < 0 ? -3 : 3;
  const z = RAIL_SUPPORT[2];
  const rodBottom = BED_TOP + SLEEVE_HEIGHT;
  return [
    { name: `piston_sleeve_${label}`, bone: 'turret', origin: [x - 1.5, BED_TOP, z - 1.5], size: [3, SLEEVE_HEIGHT, 3], paint: 'gun' },
    {
      name: `piston_rod_${label}`,
      bone: 'turret',
      origin: [x - 1, rodBottom, z - 1],
      size: [2, Math.ceil(RAIL_SUPPORT[1] - rodBottom) + 1, 2],
      paint: 'steel',
    },
  ];
};

const MISSILE_LAUNCHER = [
  { name: 'turntable', bone: 'turret', origin: [-6, 8, 0], size: [12, 1, 12], paint: 'gun' },
  { name: 'launcher_base', bone: 'turret', origin: [-5, 9, 1], size: [10, 3, 10], paint: 'steel' },
  ...[-1, 1].flatMap((sideSign) => launcherPiston(sideSign)),
  {
    name: 'control_box',
    bone: 'turret',
    origin: [5, 12, 4],
    size: [3, 4, 3],
    paint: 'gun',
    stamps: [mark('control_lights', 'east', 'gr./...', { g: '#58d068', r: '#d8323a' }, [0, 1])],
  },
  { name: 'rail', bone: 'barrel', origin: [-3, 11, -14], size: [6, 2, 22], paint: 'gun', ...MISSILE_LIFT },
  ...[-1, 1].flatMap((sideSign) =>
    [-9, 0].map((z) => ({
      name: `rail_clamp_${sideSign < 0 ? 'left' : 'right'}_${z < 0 ? 'front' : 'back'}`,
      bone: 'barrel',
      origin: [sideSign < 0 ? -3 : 2, 13, z],
      size: [1, 2, 2],
      paint: 'steel',
      ...MISSILE_LIFT,
    })),
  ),
  {
    name: 'missile',
    bone: 'barrel',
    origin: [-2, 13, -15],
    size: [4, 4, 19],
    paint: 'missile',
    stamps: [
      ...['east', 'west'].map((face) => mark('missile_band', face, 'rr/rr/rr/rr', { r: '#d8323a' }, [4, 0])),
      ...['east', 'west'].map((face) => mark('missile_stencil', face, 'k.kk.k.kk', { k: '#3a4050' }, [8, 1])),
      mark('missile_band_up', 'up', 'rrrr/rrrr', { r: '#d8323a' }, [0, 4]),
    ],
    ...MISSILE_LIFT,
  },
  { name: 'warhead', bone: 'barrel', origin: [-1.5, 13.5, -18], size: [3, 3, 3], paint: 'warhead', ...MISSILE_LIFT },
  { name: 'nozzle', bone: 'barrel', origin: [-1.5, 13.5, 4], size: [3, 3, 1], paint: 'gun', ...MISSILE_LIFT },
  { name: 'fin_flat', bone: 'barrel', origin: [-4, 14.5, 1], size: [8, 1, 3], paint: 'warhead', ...MISSILE_LIFT },
  { name: 'fin_up', bone: 'barrel', origin: [-0.5, 17, 1], size: [1, 3, 3], paint: 'warhead', ...MISSILE_LIFT },
];

/** La plataforma de atras: franjas de peligro detras, barandillas del equipo, la caja del misil de repuesto, pilotos y las patas de apoyo. */
function missileBed(side) {
  const outrigger = (sideSign) => {
    const label = sideSign < 0 ? 'left' : 'right';
    return [
      { name: `outrigger_arm_${label}`, bone: 'hull', origin: [sideSign < 0 ? -14 : 11, 5, 15], size: [3, 2, 2], paint: 'steel' },
      { name: `outrigger_leg_${label}`, bone: 'hull', origin: [sideSign < 0 ? -14 : 12, 1, 15], size: [2, 4, 2], paint: 'steel' },
      {
        name: `outrigger_foot_${label}`,
        bone: 'hull',
        origin: [sideSign < 0 ? -15 : 11, 0, 14],
        size: [4, 1, 4],
        paint: 'gun',
        stamps: [mark('foot_stripe', 'north', 'ykyk', { y: '#e8c020', k: '#1a1e28' }, [0, 0])],
      },
    ];
  };
  return [
    {
      name: 'bed',
      bone: 'hull',
      origin: [-11, 5, -7],
      size: [22, 3, 22],
      paint: `dark_${side}`,
      stamps: [mark('bed_stripes', 'south', hazardStripes(22, 3), { y: '#e8c020', k: '#1a1e28' }, [0, 0])],
    },
    ...[-1, 1].map((sideSign) => ({
      name: `bed_rail_${sideSign < 0 ? 'left' : 'right'}`,
      bone: 'hull',
      origin: [sideSign < 0 ? -11 : 10, 8, -7],
      size: [1, 2, 22],
      paint: `team_${side}`,
    })),
    {
      name: 'spare_missile_crate',
      bone: 'hull',
      origin: [-10, 8, 2],
      size: [4, 3, 12],
      paint: 'crate',
      stamps: [mark('crate_mark', 'west', 'rr.k.k', { r: '#d8323a', k: '#3a2416' }, [3, 1])],
    },
    { name: 'tail_light_left', bone: 'hull', origin: [-10, 6, 15], size: [2, 1, 1], paint: 'warhead' },
    { name: 'tail_light_right', bone: 'hull', origin: [8, 6, 15], size: [2, 1, 1], paint: 'warhead' },
    ...outrigger(-1),
    ...outrigger(1),
  ];
}

/** Las ruedas del lanzamisiles: mas pequeñas que las del jeep (con aquellas parecian enormes), en dos ejes, por fuera de la plataforma. */
const MISSILE_TRUCK_AXLES = { front: -11, back: 9 };
const MISSILE_TRUCK_WHEEL_RADIUS = 4;
const MISSILE_TRUCK_HALF_WIDTH = 11;

const missileTruckWheels = () =>
  Object.entries(MISSILE_TRUCK_AXLES).flatMap(([axle, z]) =>
    [-1, 1].flatMap((outward) =>
      jeepWheel(
        `wheel_${axle}_${outward < 0 ? 'left' : 'right'}`,
        `wheels_${axle}`,
        [outward < 0 ? -MISSILE_TRUCK_HALF_WIDTH - 4 : MISSILE_TRUCK_HALF_WIDTH, z],
        outward,
        MISSILE_TRUCK_WHEEL_RADIUS,
      ),
    ),
  );

const missileTruck = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'hull', parent: 'root', pivot: [0, 6, 0] },
    ...Object.entries(MISSILE_TRUCK_AXLES).map(([axle, z]) => ({
      name: `wheels_${axle}`,
      parent: 'root',
      pivot: [0, MISSILE_TRUCK_WHEEL_RADIUS, z],
    })),
    { name: 'turret', parent: 'hull', pivot: [0, 8, 4] },
    { name: 'barrel', parent: 'turret', pivot: MISSILE_LIFT.pivot },
  ],
  motions: {
    ...WHEEL_MOTIONS,
    drive: loopMotion(
      0.4,
      [...Object.keys(MISSILE_TRUCK_AXLES).map((axle) => spin(`wheels_${axle}`, 0.4)), sway('hull', [-1.5, 0, 1], 0.4)],
      'linear',
    ),
    fire: onceMotion(0.5, [kick('barrel', -4), kick('hull', 3)]),
  },
  cubes: [...missileTruckWheels(), ...truckCabin(side), ...missileBed(side), ...MISSILE_LAUNCHER],
});

// ---- El jeep con detalle (32 unidades por casilla) ----

/** Las ruedas del jeep: delante y detras (en z) y a cada lado (en x, por fuera de la carroceria). */
const JEEP_AXLES = { front: -9, back: 9 };
const JEEP_WHEEL_RADIUS = 5;
const JEEP_BODY_HALF_WIDTH = 9;

/**
 * Una rueda grande que se ve redonda: dos piezas de goma en cruz (una alta y otra larga, algo mas
 * fina, para que sus caras no peleen) y, por fuera, el tapacubos gris con su tuerca.
 */
function jeepWheel(name, bone, [x, z], outward, radius = JEEP_WHEEL_RADIUS, width = 4) {
  const capX = outward > 0 ? x + width : x - 1;
  return [
    { name, bone, origin: [x, 0, z - (radius + 1) / 2], size: [width, 2 * radius, radius + 1], paint: 'tire' },
    {
      name: `${name}_round`,
      bone,
      origin: [x + 0.5, (radius - 1) / 2, z - radius],
      size: [width - 1, radius + 1, 2 * radius],
      paint: 'tire',
    },
    radius >= 4
      ? {
          name: `${name}_cap`,
          bone,
          origin: [capX, radius - 2, z - 2],
          size: [1, 4, 4],
          paint: 'steel',
          stamps: [mark('wheel_cap', outward > 0 ? 'east' : 'west', 'k..k/..../..../k..k', { k: '#1c2029' }, [0, 0])],
        }
      : { name: `${name}_cap`, bone, origin: [capX, radius - 1, z - 1], size: [1, 2, 2], paint: 'steel' },
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

// ---- La moto con detalle ----

/**
 * Un miembro (brazo, muslo, espinilla) de `from` a `to`: un cubo de esa seccion, girado para que vaya
 * de un punto al otro. Asi las manos llegan al manillar y los pies a los pedales.
 */
function limb(name, bone, from, to, section, paint) {
  const direction = minus(to, from);
  const length = Math.max(1, Math.round(Math.hypot(...direction)));
  return {
    name,
    bone,
    origin: [from[0] - section / 2, from[1] - section / 2, from[2] - length],
    size: [section, section, length],
    paint,
    rotation: aimedAt(direction),
    pivot: from,
  };
}

/** Las ruedas de la moto: goma en cruz (que se vea redonda), del mismo grosor las dos piezas, y el tapacubos con radios a los dos lados. */
const BIKE_WHEEL_RADIUS = 6;
const BIKE_AXLES = { front: -12, back: 11 };
const BIKE_HUB_FACE = '..k../..k../kkhkk/..k../..k..';
const bikeWheel = (name, bone, z) => {
  const radius = BIKE_WHEEL_RADIUS;
  return [
    { name, bone, origin: [-1.5, 0, z - (radius + 1) / 2], size: [3, 2 * radius, radius + 1], paint: 'tire' },
    { name: `${name}_round`, bone, origin: [-1.5, (radius - 1) / 2, z - radius], size: [3, radius + 1, 2 * radius], paint: 'tire' },
    ...[-1, 1].map((sideSign) => ({
      name: `${name}_hub_${sideSign < 0 ? 'left' : 'right'}`,
      bone,
      origin: [sideSign < 0 ? -2.5 : 1.5, radius - 2.5, z - 2.5],
      size: [1, 5, 5],
      paint: 'steel',
      stamps: [mark('bike_spokes', sideSign < 0 ? 'west' : 'east', BIKE_HUB_FACE, { k: '#5a6272', h: '#1c2029' }, [0, 0])],
    })),
  ];
};

/** El manillar y los pedales: donde van las manos y los pies del motorista. */
const HANDLEBAR_GRIPS = [-6, 6].map((x) => [x, 19, -11]);
const FOOTPEGS = [-4.5, 4.5].map((x) => [x, 7, -5]);

/**
 * La moto de campo: horquilla hasta el buje, motor gordo con aletas, deposito del equipo con su
 * franja, tapa lateral con el numero, sillin, guardabarros que suben, faro grande, manillar,
 * escape con silenciador y piloto.
 */
function motorbike(side) {
  const front = BIKE_AXLES.front;
  return [
    ...bikeWheel('wheel_front', 'wheels_front', front),
    ...bikeWheel('wheel_back', 'wheels_back', BIKE_AXLES.back),
    ...[-1, 1].map((sideSign) =>
      limb(
        `fork_${sideSign < 0 ? 'left' : 'right'}`,
        'hull',
        [sideSign * 2.5, 18, -11],
        [sideSign * 2.5, BIKE_WHEEL_RADIUS, front],
        1,
        'steel',
      ),
    ),
    limb('swingarm', 'hull', [0, 8, 1], [0, BIKE_WHEEL_RADIUS, BIKE_AXLES.back], 2, 'gun'),
    {
      name: 'engine',
      bone: 'hull',
      origin: [-3.5, 5, -6],
      size: [7, 7, 10],
      paint: 'gun',
      stamps: ['east', 'west'].map((face) =>
        mark('engine_fins', face, 'ssssssssss/........../ssssssssss/..........', { s: '#6a7282' }, [0, 1]),
      ),
    },
    {
      name: 'fuel_tank',
      bone: 'hull',
      origin: [-3.5, 12, -10],
      size: [7, 4, 10],
      paint: 'gun',
      stamps: ['east', 'west', 'up'].map((face) =>
        mark(
          `tank_stripe_${face}`,
          face,
          face === 'up' ? 'tt/tt/tt/tt/tt/tt/tt/tt/tt/tt' : 'tttttttttt',
          { t: SIDES[side].team[1] },
          face === 'up' ? [2, 0] : [0, 1],
        ),
      ),
    },
    {
      name: 'side_cover',
      bone: 'hull',
      origin: [-4, 9, 0],
      size: [8, 4, 6],
      paint: 'missile',
      stamps: ['east', 'west'].map((face) => mark('side_number', face, 'tttt/t..t/tttt', { t: SIDES[side].team[1] }, [1, 0])),
    },
    { name: 'seat', bone: 'hull', origin: [-3, 13, 0], size: [6, 2, 8], paint: 'leather' },
    {
      name: 'rear_fender',
      bone: 'hull',
      origin: [-2.5, 13, 8],
      size: [5, 1, 8],
      paint: 'missile',
      rotation: [-15, 0, 0],
      pivot: [0, 13.5, 8],
    },
    {
      name: 'front_fender',
      bone: 'hull',
      origin: [-2.5, 13, -16],
      size: [5, 1, 7],
      paint: 'missile',
      rotation: [10, 0, 0],
      pivot: [0, 13.5, -12],
    },
    {
      name: 'headlight',
      bone: 'hull',
      origin: [-3, 14, -15],
      size: [6, 5, 2],
      paint: 'missile',
      stamps: [mark('headlight_glass', 'north', 'llll/llll/llll', { l: HEADLIGHT }, [1, 1])],
    },
    { name: 'handlebar', bone: 'hull', origin: [-6.5, 18.5, -11.5], size: [13, 1, 1], paint: 'steel' },
    { name: 'exhaust', bone: 'hull', origin: [3.5, 6, -5], size: [2, 2, 8], paint: 'steel' },
    {
      name: 'muffler',
      bone: 'hull',
      origin: [3.5, 8, 3],
      size: [3, 3, 9],
      paint: 'steel',
      stamps: [mark('muffler_end', 'south', 'kkk/kkk/kkk', { k: SLOT }, [0, 0])],
      rotation: [-15, 0, 0],
      pivot: [5, 9.5, 3],
    },
    { name: 'tail_light', bone: 'hull', origin: [-1, 15, 15], size: [2, 1, 1], paint: 'warhead' },
  ];
}

/**
 * Lo de arriba del muñeco (cuerpo, cabeza y casco con gafas), sentado: subido a la altura del sillin,
 * inclinado hacia delante desde la cadera (`RIDER_LEAN`, como en el 2D) y colgado del motorista.
 */
const SEATED_LIFT = 5;
const RIDER_HIPS = [0, 14, 1];
const RIDER_LEAN = [-12, 0, 0];
const leaned = (point) => turnedAround(point, RIDER_HIPS, RIDER_LEAN).map(roundToHalf);
const seatedTrooper = (side) =>
  liftedBy([...trooperTorso(side, {}), trooperHead(side, {}), ...trooperHelmet(side, { goggles: true })], SEATED_LIFT).map((cube) => ({
    ...cube,
    bone: 'rider',
    rotation: RIDER_LEAN,
    pivot: RIDER_HIPS,
  }));

/** El motorista: el muñeco de los soldados sentado e inclinado, muslos sobre el deposito, espinillas rectas a los pedales, brazos con el codo abierto hasta el manillar y la bufanda al viento, caida hacia atras. */
function bikeRider(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const limbs = [-1, 1].flatMap((sideSign, index) => {
    const label = sideSign < 0 ? 'left' : 'right';
    const hip = [sideSign * 2.5, 15, 1];
    const knee = [sideSign * 4.5, 15, -6];
    const shoulder = leaned([sideSign * 6.5, 21, 0]);
    const elbow = [sideSign * 8.5, 16.5, -5];
    return [
      limb(`rider_thigh_${label}`, 'rider', hip, knee, 3, dark),
      limb(`rider_shin_${label}`, 'rider', knee, FOOTPEGS[index], 3, dark),
      { name: `rider_boot_${label}`, bone: 'rider', origin: plus(FOOTPEGS[index], [-1.5, -1, -3]), size: [3, 3, 5], paint: 'boot_grey' },
      limb(`rider_upper_arm_${label}`, 'rider', shoulder, elbow, 3, team),
      limb(`rider_forearm_${label}`, 'rider', elbow, HANDLEBAR_GRIPS[index], 3, team),
      {
        name: `rider_glove_${label}`,
        bone: 'rider',
        origin: plus(HANDLEBAR_GRIPS[index], [-1.5, -1.5, -1.5]),
        size: [3, 3, 3],
        paint: 'leather',
      },
    ];
  });
  const neck = leaned([0, 21, 3]);
  return [
    ...seatedTrooper(side),
    ...limbs,
    { name: 'scarf_knot', bone: 'rider', origin: plus(neck, [-3, 0, 0]), size: [6, 2, 3], paint: dark },
    {
      name: 'scarf_tail',
      bone: 'rider',
      origin: plus(neck, [-2.5, -1, 3]),
      size: [5, 2, 5],
      paint: dark,
      rotation: [20, 0, 0],
      pivot: plus(neck, [0, 0, 3]),
    },
    {
      name: 'scarf_end',
      bone: 'rider',
      origin: plus(neck, [-2, -3.5, 7]),
      size: [4, 2, 4],
      paint: dark,
      rotation: [35, 0, 0],
      pivot: plus(neck, [0, -2.5, 7]),
    },
  ];
}

/** El de la moto: moto de campo con detalle y el muñeco de los soldados como motorista. */
const biker = (side) => ({
  detail: DETAIL,
  bones: [
    { name: 'hull', parent: 'root', pivot: [0, 8, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, BIKE_WHEEL_RADIUS, BIKE_AXLES.front] },
    { name: 'wheels_back', parent: 'root', pivot: [0, BIKE_WHEEL_RADIUS, BIKE_AXLES.back] },
    { name: 'rider', parent: 'hull', pivot: [0, 15, 2] },
  ],
  motions: {
    idle: loopMotion(1.2, [sway('rider', [2, 0, 1], 1.2)]),
    drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [0, 0, 3], 0.4)], 'linear'),
    fire: onceMotion(0.4, [kick('rider', 8)]),
  },
  cubes: [...motorbike(side), ...bikeRider(side)],
});

// ---- Aire con detalle (32 unidades por casilla) ----

/** Los aviones vuelan: todo cuelga de 'body', subido (la misma altura en casillas que antes). */
const AIR_HEIGHT = 20;
const airBones = (extra = []) => [
  { name: 'body', parent: 'root', pivot: [0, AIR_HEIGHT, 0] },
  ...extra.map((bone) => ({ parent: 'body', ...bone, pivot: plus(bone.pivot, [0, AIR_HEIGHT, 0]) })),
];
/** En reposo se mecen; al moverse, se inclinan; al disparar, dan un golpe. */
const FLYING_MOTIONS = {
  idle: loopMotion(2, [sway('body', [3, 0, 5], 2)]),
  drive: loopMotion(1, [sway('body', [-4, 0, 6], 1)]),
  fire: onceMotion(0.4, [kick('body', -5)]),
};
/** Las helices (en cruz: se ven igual cada cuarto de vuelta) giran mientras el avion se mece. */
const propSpin = (bone, duration, turns) => spin(bone, duration, { axis: 2, symmetry: 90, sign: 1, turns });
const withProps = (props) => ({
  idle: loopMotion(2, [sway('body', [3, 0, 5], 2), ...props.map((bone) => propSpin(bone, 2, 10))]),
  drive: loopMotion(1, [sway('body', [-4, 0, 6], 1), ...props.map((bone) => propSpin(bone, 1, 5))]),
  fire: FLYING_MOTIONS.fire,
});
const aloft = (cubes) => liftedBy(cubes, AIR_HEIGHT).map((cube) => ({ bone: 'body', ...cube }));

/** La escarapela (vista desde arriba) en un ala: aro del equipo, blanco y el centro oscuro. */
const roundel = (side, name, face, at) =>
  mark(name, face, '.ttt./twwwt/twkwt/twwwt/.ttt.', { t: SIDES[side].teamRim, w: '#f2f2ea', k: SIDES[side].dark[0] }, at);

/** Una helice de dos palas en cruz (se ve igual cada cuarto de vuelta), con su cono rojo. */
const bigPropeller = (bone, [x, y, z], span) => [
  { name: `${bone}_a`, bone, origin: [x - span / 2, y - 0.5, z], size: [span, 1, 1], paint: 'steel' },
  { name: `${bone}_b`, bone, origin: [x - 0.5, y - span / 2, z], size: [1, span, 1], paint: 'steel' },
  { name: `${bone}_spinner`, bone, origin: [x - 1.5, y - 1.5, z - 1], size: [3, 3, 2], paint: 'warhead' },
];

/** El caza ligero: de helice, ala baja con escarapelas, la cabina abierta con el piloto (gorro y gafas) y el tren de aterrizaje. */
function lightFighter(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  return {
    detail: DETAIL,
    bones: airBones([{ name: 'prop', pivot: [0, 3.5, -16] }]),
    motions: withProps(['prop']),
    cubes: aloft([
      { name: 'fuselage', origin: [-4, 0, -12], size: [8, 7, 22], paint: team },
      {
        name: 'cowl',
        origin: [-4.5, -0.5, -14],
        size: [9, 8, 2],
        paint: 'steel',
        stamps: ['east', 'west'].map((face) => mark('cowl_exhaust', face, 'k/k/k', { k: SLOT }, [0, 2])),
      },
      { name: 'tail_cone', origin: [-2.5, 1, 10], size: [5, 5, 6], paint: team },
      { name: 'fin', origin: [-0.5, 6, 12], size: [1, 7, 5], paint: dark },
      { name: 'tailplane', origin: [-7, 2, 13], size: [14, 1, 4], paint: dark },
      {
        name: 'wing',
        origin: [-15, 0, -7],
        size: [30, 2, 9],
        paint: dark,
        stamps: [roundel(side, 'wing_roundel_left', 'up', [2, 2]), roundel(side, 'wing_roundel_right', 'up', [23, 2])],
      },
      {
        name: 'windscreen',
        origin: [-3, 7, -6],
        size: [6, 3, 1],
        paint: 'glass',
        stamps: [mark('windscreen_shine', 'north', 'w./.w', { w: SHINE }, [1, 0])],
      },
      { name: 'cockpit_rim', origin: [-3.5, 7, -5], size: [7, 1, 7], paint: 'leather' },
      {
        name: 'pilot_head',
        origin: [-2.5, 8, -4],
        size: [5, 4, 5],
        paint: 'skin',
        stamps: [mark('pilot_face', 'north', '.k.k./...../.mmm.', { k: EYE, m: MOUTH }, [0, 1])],
      },
      { name: 'pilot_cap', origin: [-3, 11, -4.5], size: [6, 2, 6], paint: 'leather' },
      { name: 'pilot_goggles', origin: [-2.5, 11, -5.5], size: [5, 1, 1], paint: 'glass' },
      ...[-1, 1].flatMap((sideSign) => [
        { name: `gear_strut_${sideSign < 0 ? 'left' : 'right'}`, origin: [sideSign < 0 ? -6 : 5, -4, -6], size: [1, 4, 1], paint: 'gun' },
        {
          name: `gear_wheel_${sideSign < 0 ? 'left' : 'right'}`,
          origin: [sideSign < 0 ? -7 : 5, -7, -7.5],
          size: [2, 4, 4],
          paint: 'tire',
        },
      ]),
      { name: 'prop_hub', bone: 'prop', origin: [-1.5, 2, -15], size: [3, 3, 1], paint: 'gun' },
      ...bigPropeller('prop', [0, 3.5, -16.5], 14),
    ]),
  };
}

/** El caza: reactor del equipo con el morro gris, la cupula grande, alas con escarapelas y misiles en las puntas, dos derivas y la tobera. */
function fighter(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  return {
    detail: DETAIL,
    bones: airBones(),
    motions: FLYING_MOTIONS,
    cubes: aloft([
      { name: 'fuselage', origin: [-4, 0, -12], size: [8, 8, 24], paint: team },
      { name: 'nose', origin: [-3, 1, -16], size: [6, 6, 4], paint: 'steel' },
      { name: 'nose_tip', origin: [-1.5, 2.5, -18], size: [3, 3, 2], paint: 'gun' },
      {
        name: 'canopy',
        origin: [-2.5, 8, -10],
        size: [5, 3, 8],
        paint: 'glass',
        stamps: [
          mark('canopy_frame', 'up', 'kkkkk/...../...../kkkkk', { k: '#2a3a48' }, [0, 2]),
          mark('canopy_shine', 'east', 'w...../.w....', { w: SHINE }, [1, 0]),
        ],
      },
      ...[-1, 1].map((sideSign) => ({
        name: `intake_${sideSign < 0 ? 'left' : 'right'}`,
        origin: [sideSign < 0 ? -6 : 4, 2, -7],
        size: [2, 4, 7],
        paint: dark,
        stamps: [mark('intake_mouth', 'north', 'kk/kk/kk/kk', { k: SLOT }, [0, 0])],
      })),
      {
        name: 'wing',
        origin: [-14, 2, -3],
        size: [28, 2, 10],
        paint: dark,
        stamps: [roundel(side, 'wing_roundel_left', 'up', [2, 3]), roundel(side, 'wing_roundel_right', 'up', [21, 3])],
      },
      ...[-1, 1].flatMap((sideSign) => {
        const label = sideSign < 0 ? 'left' : 'right';
        const x = sideSign < 0 ? -16 : 14;
        return [
          { name: `wingtip_missile_${label}`, origin: [x, 1, -4], size: [2, 2, 10], paint: 'missile' },
          { name: `wingtip_missile_tip_${label}`, origin: [x, 1, -6], size: [2, 2, 2], paint: 'warhead' },
        ];
      }),
      { name: 'tailplane', origin: [-9, 3, 9], size: [18, 1, 4], paint: dark },
      ...[-1, 1].map((sideSign) => ({
        name: `fin_${sideSign < 0 ? 'left' : 'right'}`,
        origin: [sideSign < 0 ? -3 : 2, 8, 7],
        size: [1, 7, 5],
        paint: dark,
      })),
      {
        name: 'nozzle',
        origin: [-3, 1, 12],
        size: [6, 6, 2],
        paint: 'gun',
        stamps: [mark('nozzle_bore', 'south', '.kk./kkkk/kkkk/.kk.', { k: SLOT }, [1, 1])],
      },
    ]),
  };
}

/** El bombardero: gordo, con el morro de cristal (con su marco), la cabina, dos motores con helice en las alas, la torreta de cristal arriba, dos derivas y las bombas debajo. */
function bomber(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  return {
    detail: DETAIL,
    bones: airBones([
      { name: 'prop_left', pivot: [-12, 5, -12.5] },
      { name: 'prop_right', pivot: [12, 5, -12.5] },
    ]),
    motions: withProps(['prop_left', 'prop_right']),
    cubes: aloft([
      {
        name: 'fuselage',
        origin: [-6, 0, -14],
        size: [12, 11, 28],
        paint: team,
        stamps: [mark('bomb_bay', 'down', Array(10).fill('kkkkkkkkkk').join('/'), { k: SIDES[side].dark[0] }, [1, 9])],
      },
      {
        name: 'glass_nose',
        origin: [-5, 1, -16],
        size: [10, 9, 2],
        paint: 'glass',
        stamps: [mark('nose_shine', 'north', 'ww../w...', { w: SHINE }, [1, 1])],
      },
      { name: 'glass_nose_mid', origin: [-4, 2, -18], size: [8, 7, 2], paint: 'glass' },
      {
        name: 'glass_nose_tip',
        origin: [-3, 3, -19],
        size: [6, 5, 1],
        paint: 'glass',
        stamps: [mark('nose_tip_shine', 'north', 'w.', { w: SHINE }, [1, 1])],
      },
      { name: 'cockpit', origin: [-4, 11, -12], size: [8, 2, 5], paint: 'glass' },
      { name: 'dorsal_turret', origin: [-2, 11, 2], size: [4, 3, 4], paint: 'glass' },
      { name: 'dorsal_guns', origin: [-1, 12.5, -2], size: [2, 1, 4], paint: 'gun' },
      {
        name: 'wing',
        origin: [-22, 4, -6],
        size: [44, 2, 12],
        paint: dark,
        stamps: [roundel(side, 'wing_roundel_left', 'up', [2, 4]), roundel(side, 'wing_roundel_right', 'up', [37, 4])],
      },
      ...[-1, 1].flatMap((sideSign) => {
        const label = sideSign < 0 ? 'left' : 'right';
        const x = sideSign < 0 ? -15 : 9;
        return [
          {
            name: `engine_${label}`,
            origin: [x, 2, -11],
            size: [6, 6, 10],
            paint: 'gun',
            stamps: ['east', 'west'].map((face) => mark('engine_vents', face, 'k.k.k.k', { k: SLOT }, [1, 2])),
          },
          { name: `bomb_${label}`, origin: [sideSign < 0 ? -10 : 8, 1, -3], size: [2, 3, 6], paint: 'gun' },
          { name: `bomb_tip_${label}`, origin: [sideSign < 0 ? -10 : 8, 1, -5], size: [2, 3, 2], paint: 'warhead' },
        ];
      }),
      ...bigPropeller('prop_left', [-12, 5, -12.5], 10),
      ...bigPropeller('prop_right', [12, 5, -12.5], 10),
      { name: 'tailplane', origin: [-11, 8, 10], size: [22, 1, 5], paint: dark },
      ...[-1, 1].map((sideSign) => ({
        name: `fin_${sideSign < 0 ? 'left' : 'right'}`,
        origin: [sideSign < 0 ? -11 : 10, 9, 10],
        size: [1, 7, 5],
        paint: dark,
      })),
    ]),
  };
}

/** El helicoptero de transporte: cabina grande con la burbuja de cristal delante, ventanillas y puerta, el motor con rejillas, cola con su rotor, patines y el rotor grande. */
function helicopter(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  const darkColor = SIDES[side].dark[0];
  const tailSpin = (duration, turns) => spin('tail_rotor', duration, { symmetry: 90, turns });
  const skids = [-1, 1].flatMap((sideSign) => {
    const label = sideSign < 0 ? 'left' : 'right';
    const x = sideSign < 0 ? -9 : 7;
    return [
      { name: `skid_${label}`, origin: [x, -6, -11], size: [2, 2, 22], paint: 'gun' },
      { name: `strut_front_${label}`, origin: [x, -4, -6], size: [2, 4, 1], paint: 'gun' },
      { name: `strut_back_${label}`, origin: [x, -4, 4], size: [2, 4, 1], paint: 'gun' },
    ];
  });
  return {
    detail: DETAIL,
    bones: airBones([
      { name: 'rotor', pivot: [0, 19, 0] },
      { name: 'tail_rotor', pivot: [2.5, 12, 22] },
    ]),
    motions: {
      idle: loopMotion(2, [sway('body', [3, 0, 5], 2), tailSpin(2, 10)]),
      drive: loopMotion(1, [sway('body', [-4, 0, 6], 1), tailSpin(1, 5)]),
      fire: FLYING_MOTIONS.fire,
    },
    cubes: aloft([
      {
        name: 'cabin',
        origin: [-7, 0, -8],
        size: [14, 12, 16],
        paint: team,
        stamps: [
          ...['east', 'west'].map((face) => mark('heli_windows', face, 'ggg.ggg.ggg/ggg.ggg.ggg', { g: WINDOW_GLASS }, [3, 2])),
          ...['east', 'west'].map((face) =>
            mark('heli_door', face, ['dddddd', ...Array(6).fill('d....d'), 'dddddd'].join('/'), { d: darkColor }, [5, 3]),
          ),
          ...['east', 'west'].map((face) => roundel(side, 'heli_roundel', face, [1, 6])),
        ],
      },
      { name: 'cabin_top', origin: [-5, 12, -6], size: [10, 2, 12], paint: team },
      {
        name: 'engine',
        origin: [-3, 14, -3],
        size: [6, 3, 8],
        paint: 'gun',
        stamps: ['east', 'west'].map((face) => mark('engine_grille', face, 'k.k.k.k./.k.k.k.k', { k: SLOT }, [0, 0])),
      },
      {
        name: 'bubble',
        origin: [-6, 1, -12],
        size: [12, 10, 4],
        paint: 'glass',
        stamps: [mark('bubble_shine', 'north', 'ww../w...', { w: SHINE }, [1, 1])],
      },
      { name: 'bubble_mid', origin: [-5, 2, -14], size: [10, 8, 2], paint: 'glass' },
      {
        name: 'bubble_tip',
        origin: [-4, 3, -15],
        size: [8, 6, 1],
        paint: 'glass',
        stamps: [mark('bubble_tip_shine', 'north', 'w.', { w: SHINE }, [1, 1])],
      },
      { name: 'boom', origin: [-2, 6, 8], size: [4, 4, 16], paint: dark },
      { name: 'tail_fin', origin: [-1, 10, 20], size: [2, 6, 4], paint: dark },
      { name: 'tail_plane', origin: [-5, 7, 18], size: [10, 1, 3], paint: dark },
      ...skids,
      { name: 'mast', origin: [-1, 17, -1], size: [2, 2, 2], paint: 'steel' },
      { name: 'rotor_hub', bone: 'rotor', origin: [-2, 19, -2], size: [4, 1, 4], paint: 'gun' },
      { name: 'blade_a', bone: 'rotor', origin: [-20, 19, -1], size: [40, 1, 2], paint: 'blur' },
      { name: 'blade_b', bone: 'rotor', origin: [-1, 19, -20], size: [2, 1, 40], paint: 'blur' },
      { name: 'tail_blade_a', bone: 'tail_rotor', origin: [2, 8, 21.5], size: [1, 8, 1], paint: 'steel' },
      { name: 'tail_blade_b', bone: 'tail_rotor', origin: [2, 11.5, 18], size: [1, 1, 8], paint: 'steel' },
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

export const MODELS = Object.fromEntries(
  Object.entries(UNITS).flatMap(([unit, build]) => Object.keys(SIDES).map((side) => [`${unit.toLowerCase()}_${side}`, build(side)])),
);
