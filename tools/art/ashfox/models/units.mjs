// Las unidades para Ashfox, a semejanza de las del 2D (public/assets/img/u): la infanteria es un
// muñeco chibi (casco grande, gafas y su arma) y los vehiculos, de juguete, enteros del color de su
// equipo. Un modelo por unidad y equipo: `<unidad en minusculas>_<equipo>` (blue o red). Miran al norte
// (-z) y se apoyan en y = 0. Cada uno trae sus animaciones: 'idle' (quieto), 'drive' (moviendose: las
// piernas andan, las ruedas giran, el casco se balancea) y 'fire' (al disparar). La torreta es el hueso
// 'turret' (la gira el juego para apuntar) y el rotor del helicoptero, 'rotor'. Lo escribe generate.mjs.

const SIDES = {
  blue: { team: ['#1d4fa8', '#2f74d6', '#5ea8f2'], dark: ['#163a7a', '#1f56a8', '#3f84d8'] },
  red: { team: ['#8a1a1a', '#c8302a', '#f0605a'], dark: ['#601212', '#962220', '#c84038'] },
};

export const PAINTS = {
  skin: { ramp: ['#c8946a', '#f1c79b', '#ffe2c4'] },
  boot: { ramp: ['#141824', '#262c3c', '#3c4458'] },
  gun: { ramp: ['#20242e', '#3a404e', '#5c6474'] },
  steel: { ramp: ['#4e5666', '#8a93a6', '#c3cbd9'] },
  tread: { ramp: ['#141824', '#262c3c', '#3c4458'], blotch: { ramp: ['#3c4458', '#5c6474', '#7c8494'], scale: [1, 1, 2], density: 0.3 } },
  tire: { ramp: ['#101318', '#1e222c', '#333a48'] },
  glass: { ramp: ['#4f9fc8', '#9fe3ff', '#e6f8ff'] },
  canvas: { ramp: ['#a89878', '#d6c8a4', '#f0e6c8'], blotch: { ramp: ['#8a7a5a', '#a89878', '#c4b490'], scale: [3, 1, 3], density: 0.2 } },
  crate: { ramp: ['#7a4a22', '#a8692f', '#cf8f4a'], blotch: { ramp: ['#5a3418', '#7a4a22', '#9a5e2c'], scale: [1, 3, 1], density: 0.25 } },
  pack: { ramp: ['#5a3a22', '#7e5432', '#a8744a'] },
  sandbag: { ramp: ['#a88a5a', '#d2b47e', '#efd6a0'] },
  missile: { ramp: ['#c8ccd8', '#eef2fa', '#ffffff'] },
  warhead: { ramp: ['#9a1c22', '#d8323a', '#ff6a62'] },
  scarf: { ramp: ['#c8a010', '#f2c81e', '#ffe866'] },
  ...Object.fromEntries(
    Object.entries(SIDES).flatMap(([side, colors]) => [
      [`team_${side}`, { ramp: colors.team }],
      [`dark_${side}`, { ramp: colors.dark }],
      [`camo_${side}`, { ramp: colors.team, blotch: { ramp: colors.dark, scale: [3, 2, 3], density: 0.25 } }],
    ]),
  ),
};

const EYES = { name: 'eyes', face: 'north', pixels: 'k..k', colors: { k: '#141824' }, at: [[1, 2]] };
const GOGGLES = { name: 'goggles', face: 'north', pixels: 'gg.gg', colors: { g: '#9fe3ff' }, at: [[1, 0]] };

// ---- Animaciones ----

const loopMotion = (duration, tracks, interp = 'catmullrom') => ({
  duration,
  fps: 20,
  loop: 'loop',
  tracks: tracks.map((track) => ({ interp, ...track })),
});
const onceMotion = (duration, tracks) => ({
  duration,
  fps: 30,
  loop: 'once',
  tracks: tracks.map((track) => ({ interp: 'linear', ...track })),
});
/** Un vaiven de un hueso: de 0 a `amount` (grados en cada eje), de vuelta, al reves y a 0. */
const sway = (bone, amount, duration) => ({
  bone,
  channel: 'rotation',
  keys: [
    [0, [0, 0, 0]],
    [duration / 4, amount],
    [duration / 2, [0, 0, 0]],
    [(duration * 3) / 4, amount.map((value) => -value)],
    [duration, [0, 0, 0]],
  ],
});
/**
 * Un giro sin fin (ruedas, helices, ventilador), a saltos de un cuarto de lo que tarda la pieza en
 * verse igual (`symmetry`: 90 grados una rueda cuadrada, 180 una helice); al acabar vuelve a 0, que
 * se ve igual: Ashfox pide que un bucle acabe como empieza, y a saltos queda de juguete.
 */
const spin = (bone, duration, { axis = 0, symmetry = 90, sign = -1 } = {}) => ({
  bone,
  channel: 'rotation',
  interp: 'step',
  keys: [
    ...[0, 1, 2, 3].map((quarter) => [(duration * quarter) / 4, angleOn(axis, (sign * symmetry * quarter) / 4)]),
    [duration, [0, 0, 0]],
  ],
});
/** Un giro de esos grados sobre un eje (0 = x, 1 = y, 2 = z). */
const angleOn = (axis, degrees) => [0, 1, 2].map((index) => (index === axis ? degrees : 0));
/** El golpe de un disparo: el hueso se echa atras (giro en x) y vuelve. */
const kick = (bone, degrees) => ({
  bone,
  channel: 'rotation',
  keys: [
    [0, [0, 0, 0]],
    [0.06, [degrees, 0, 0]],
    [0.4, [0, 0, 0]],
  ],
});
/** El cañon se encoge un momento (retroceso) y vuelve. */
const recoil = (bone) => ({
  bone,
  channel: 'scale',
  keys: [
    [0, [1, 1, 1]],
    [0.05, [1.15, 1.15, 0.6]],
    [0.4, [1, 1, 1]],
  ],
});

// ---- Infanteria: el muñeco chibi ----

/** Los huesos del muñeco: piernas, cuerpo, cabeza y brazos (de las caderas, a 5 de alto). */
const CHIBI_BONES = [
  { name: 'leg_left', parent: 'root', pivot: [-1.5, 5, 0] },
  { name: 'leg_right', parent: 'root', pivot: [1.5, 5, 0] },
  { name: 'torso', parent: 'root', pivot: [0, 5, 0] },
  { name: 'head', parent: 'torso', pivot: [0, 9, 0] },
  { name: 'arm_left', parent: 'torso', pivot: [-4, 8.5, 0] },
  { name: 'arm_right', parent: 'torso', pivot: [4, 8.5, 0] },
];

function chibi(side) {
  const team = `team_${side}`;
  const dark = `dark_${side}`;
  return [
    { name: 'boot_left', bone: 'leg_left', origin: [-2.5, 0, -1.5], size: [2, 1, 3], paint: 'boot' },
    { name: 'leg_left', bone: 'leg_left', origin: [-2.5, 1, -1], size: [2, 4, 2], paint: dark },
    { name: 'boot_right', bone: 'leg_right', origin: [0.5, 0, -1.5], size: [2, 1, 3], paint: 'boot' },
    { name: 'leg_right', bone: 'leg_right', origin: [0.5, 1, -1], size: [2, 4, 2], paint: dark },
    { name: 'torso', bone: 'torso', origin: [-3, 5, -1.5], size: [6, 4, 3], paint: team },
    { name: 'head', bone: 'head', origin: [-3, 9, -3], size: [6, 4, 6], paint: 'skin', stamps: [EYES] },
    { name: 'helmet', bone: 'head', origin: [-3.5, 12, -3.5], size: [7, 3, 7], paint: team, stamps: [GOGGLES] },
    { name: 'arm_left', bone: 'arm_left', origin: [-5, 6, -1], size: [2, 3, 2], paint: team },
    { name: 'arm_right', bone: 'arm_right', origin: [3, 6, -1], size: [2, 3, 2], paint: team },
  ];
}

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
const infantry = (side, gear) => ({ bones: [...CHIBI_BONES, GEAR_BONE], cubes: [...chibi(side), ...gear(side)], motions: CHIBI_MOTIONS });

const rifleman = (side) =>
  infantry(side, () => [
    { name: 'rifle', bone: 'arm_right', origin: [3.5, 6, -6], size: [1, 1, 6], paint: 'gun' },
    { name: 'backpack', bone: 'torso', origin: [-2.5, 5.5, 1.5], size: [5, 3, 2], paint: 'pack' },
  ]);
const bazooka = (side) =>
  infantry(side, (team) => [{ name: 'bazooka', bone: 'arm_right', origin: [3, 9, -5], size: [2, 2, 9], paint: `dark_${team}` }]);
const shield = (side) =>
  infantry(side, () => [
    {
      name: 'shield',
      bone: 'arm_left',
      origin: [-6, 3, -3],
      size: [6, 8, 1],
      paint: 'steel',
      stamps: [{ name: 'slit', face: 'north', pixels: 'kkkk', colors: { k: '#14202c' }, at: [[1, 2]] }],
    },
  ]);
const mortar = (side) =>
  infantry(side, () => [
    { name: 'tube', bone: 'gear', origin: [-1, 1, -8], size: [2, 6, 2], paint: 'gun', rotation: [-30, 0, 0], pivot: [0, 1, -7] },
    { name: 'base_plate', bone: 'gear', origin: [-2, 0, -8.5], size: [4, 1, 3], paint: 'steel' },
    { name: 'sandbag', bone: 'gear', origin: [-5, 0, 3], size: [10, 2, 2], paint: 'sandbag' },
  ]);

// ---- Vehiculos ----

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

/** Orugas a los lados, de ese ancho total y largo, con su cadena. */
const tracks = (width, length) =>
  [-1, 1].map((sideSign, index) => ({
    name: `track${index}`,
    bone: 'chassis',
    origin: [sideSign < 0 ? -width / 2 : width / 2 - 4, 0, -length / 2],
    size: [4, 4, length],
    paint: 'tread',
  }));

function tank(side) {
  return {
    bones: VEHICLE_BONES([0, 6, 1], [0, 7.5, -2.5]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(14, 14),
      { name: 'hull', bone: 'hull', origin: [-5, 3, -6], size: [10, 3, 12], paint: `camo_${side}` },
      { name: 'turret', bone: 'turret', origin: [-4, 6, -2.5], size: [8, 3, 7], paint: `team_${side}` },
      { name: 'hatch', bone: 'turret', origin: [-2.5, 9, 0], size: [3, 1, 3], paint: `dark_${side}` },
      { name: 'barrel_left', bone: 'barrel', origin: [-2, 7, -10.5], size: [1, 1, 8], paint: 'steel' },
      { name: 'barrel_right', bone: 'barrel', origin: [1, 7, -10.5], size: [1, 1, 8], paint: 'steel' },
    ],
  };
}

function lightTank(side) {
  return {
    bones: VEHICLE_BONES([0, 5, 1], [0, 6, -2]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 11),
      { name: 'hull', bone: 'hull', origin: [-4, 3, -5], size: [8, 2, 10], paint: `camo_${side}` },
      { name: 'turret', bone: 'turret', origin: [-3, 5, -2], size: [6, 3, 5], paint: `team_${side}` },
      { name: 'barrel', bone: 'barrel', origin: [-0.5, 6, -8], size: [1, 1, 6], paint: 'steel' },
    ],
  };
}

function amphibiousTank(side) {
  return {
    bones: [...VEHICLE_BONES([0, 6, 1], [0, 7.5, -2]), { name: 'fan', parent: 'hull', pivot: [0, 7, 6.5] }],
    motions: {
      ...VEHICLE_MOTIONS,
      drive: loopMotion(0.4, [sway('hull', [-2, 0, 1], 0.4), spin('fan', 0.4, { axis: 2, symmetry: 180, sign: 1 })]),
    },
    cubes: [
      { name: 'skirt', bone: 'chassis', origin: [-7, 0, -7], size: [14, 3, 14], paint: `dark_${side}` },
      { name: 'hull', bone: 'hull', origin: [-5, 3, -5], size: [10, 3, 10], paint: `team_${side}` },
      { name: 'turret', bone: 'turret', origin: [-3, 6, -2], size: [6, 3, 6], paint: `camo_${side}` },
      { name: 'barrel', bone: 'barrel', origin: [-0.5, 7, -9], size: [1, 1, 7], paint: 'steel' },
      { name: 'fan_ring', bone: 'fan', origin: [-3, 4, 5], size: [6, 6, 1], paint: 'steel' },
      { name: 'fan_blade', bone: 'fan', origin: [-2.5, 6.5, 6], size: [5, 1, 1], paint: 'gun' },
    ],
  };
}

function artillery(side) {
  return {
    bones: VEHICLE_BONES([0, 5, 2], [0, 7, 0]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 13),
      { name: 'hull', bone: 'hull', origin: [-4, 3, -5], size: [8, 2, 11], paint: `camo_${side}` },
      { name: 'mount', bone: 'turret', origin: [-3, 5, 0], size: [6, 3, 5], paint: `team_${side}` },
      { name: 'barrel', bone: 'barrel', origin: [-1, 6.5, -10], size: [2, 2, 11], paint: 'steel', rotation: [30, 0, 0], pivot: [0, 7, 0] },
      { name: 'gunner_head', bone: 'turret', origin: [-1.5, 8, 2], size: [3, 3, 3], paint: 'skin' },
      { name: 'gunner_helmet', bone: 'turret', origin: [-2, 10, 1.5], size: [4, 2, 4], paint: `team_${side}` },
    ],
  };
}

function antiair(side) {
  return {
    bones: VEHICLE_BONES([0, 5, 1], [0, 7, 0]),
    motions: VEHICLE_MOTIONS,
    cubes: [
      ...tracks(12, 12),
      { name: 'hull', bone: 'hull', origin: [-4, 3, -5], size: [8, 2, 10], paint: `camo_${side}` },
      { name: 'turret', bone: 'turret', origin: [-3, 5, -2], size: [6, 3, 6], paint: `team_${side}` },
      {
        name: 'gun_left',
        bone: 'barrel',
        origin: [-2.5, 6.5, -8],
        size: [1, 1, 8],
        paint: 'steel',
        rotation: [45, 0, 0],
        pivot: [0, 7, 0],
      },
      {
        name: 'gun_right',
        bone: 'barrel',
        origin: [1.5, 6.5, -8],
        size: [1, 1, 8],
        paint: 'steel',
        rotation: [45, 0, 0],
        pivot: [0, 7, 0],
      },
    ],
  };
}

function blocker(side) {
  return {
    bones: VEHICLE_BONES([0, 4, 0], [0, 5, 0]),
    motions: { idle: VEHICLE_MOTIONS.idle, drive: VEHICLE_MOTIONS.drive },
    cubes: [
      ...tracks(14, 13),
      {
        name: 'box',
        bone: 'hull',
        origin: [-6, 3, -6],
        size: [12, 9, 12],
        paint: `team_${side}`,
        stamps: [
          {
            name: 'vents',
            face: 'north',
            pixels: 'kkkkkkkk',
            colors: { k: '#14202c' },
            at: [
              [2, 2],
              [2, 4],
            ],
          },
        ],
      },
      { name: 'roof', bone: 'hull', origin: [-5, 12, -5], size: [10, 1, 10], paint: `dark_${side}` },
    ],
  };
}

// ---- Ruedas: jeep, camiones y moto ----

const WHEEL_BONES = [
  { name: 'hull', parent: 'root', pivot: [0, 3, 0] },
  { name: 'wheels_front', parent: 'root', pivot: [0, 2, -4.5] },
  { name: 'wheels_back', parent: 'root', pivot: [0, 2, 4.5] },
  { name: 'turret', parent: 'hull', pivot: [0, 7, 2] },
  { name: 'barrel', parent: 'turret', pivot: [0, 8, 0] },
];
const WHEEL_MOTIONS = {
  idle: loopMotion(1.2, [sway('hull', [0.5, 0, 0.5], 1.2)]),
  drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [-1.5, 0, 1], 0.4)], 'linear'),
  fire: onceMotion(0.5, [kick('hull', 4)]),
};

/** Cuatro ruedas en dos ejes (delante y detras), de ese ancho. */
const axles = (width) =>
  ['front', 'back'].flatMap((axle) =>
    [-1, 1].map((sideSign) => ({
      name: `wheel_${axle}_${sideSign < 0 ? 'left' : 'right'}`,
      bone: `wheels_${axle}`,
      origin: [sideSign < 0 ? -width / 2 : width / 2 - 2, 0, axle === 'front' ? -6.5 : 2.5],
      size: [2, 4, 4],
      paint: 'tire',
    })),
  );

/** La cabina de un camion (delante) con su parabrisas. */
const truckCab = (side) => [
  {
    name: 'cab',
    bone: 'hull',
    origin: [-4.5, 3, -8],
    size: [9, 6, 5],
    paint: `team_${side}`,
    stamps: [{ name: 'windshield', face: 'north', pixels: 'ggggggg/ggggggg', colors: { g: '#9fe3ff' }, at: [[1, 1]] }],
  },
  { name: 'bed', bone: 'hull', origin: [-5, 3, -3], size: [10, 2, 11], paint: `dark_${side}` },
];

const truck = (side, cargo) => ({ bones: WHEEL_BONES, motions: WHEEL_MOTIONS, cubes: [...axles(11), ...truckCab(side), ...cargo] });

const transport = (side) => truck(side, [{ name: 'cover', bone: 'hull', origin: [-5, 5, -3], size: [10, 6, 11], paint: 'canvas' }]);
const supplier = (side) =>
  truck(side, [
    { name: 'crate_a', bone: 'hull', origin: [-4, 5, -2], size: [4, 4, 4], paint: 'crate' },
    { name: 'crate_b', bone: 'hull', origin: [0.5, 5, 2], size: [4, 4, 4], paint: 'crate' },
    { name: 'crate_c', bone: 'hull', origin: [-3, 5, 3], size: [3, 3, 3], paint: 'crate' },
  ]);
const missileTruck = (side) =>
  truck(side, [
    { name: 'rack', bone: 'turret', origin: [-3, 5, 0], size: [6, 2, 6], paint: 'steel' },
    { name: 'missile', bone: 'barrel', origin: [-1.5, 7, -7], size: [3, 3, 12], paint: 'missile', rotation: [25, 0, 0], pivot: [0, 8, 0] },
    { name: 'warhead', bone: 'barrel', origin: [-1, 7.5, -9], size: [2, 2, 2], paint: 'warhead', rotation: [25, 0, 0], pivot: [0, 8, 0] },
  ]);

function jeep(side) {
  return {
    bones: WHEEL_BONES,
    motions: { ...WHEEL_MOTIONS, fire: onceMotion(0.4, [kick('turret', 10), kick('hull', 3)]) },
    cubes: [
      ...axles(10),
      { name: 'body', bone: 'hull', origin: [-4.5, 3, -7], size: [9, 3, 13], paint: `camo_${side}` },
      { name: 'windshield', bone: 'hull', origin: [-4, 6, -3], size: [8, 2, 1], paint: 'glass' },
      { name: 'driver_head', bone: 'hull', origin: [-3, 6, -1], size: [3, 3, 3], paint: 'skin' },
      { name: 'driver_helmet', bone: 'hull', origin: [-3.5, 9, -1.5], size: [4, 1, 4], paint: `team_${side}` },
      { name: 'gun_post', bone: 'turret', origin: [1.5, 6, 2], size: [1, 3, 1], paint: 'gun' },
      { name: 'gun', bone: 'barrel', origin: [1.5, 8.5, -3], size: [1, 1, 6], paint: 'gun' },
    ],
  };
}

function biker(side) {
  const bones = [
    { name: 'hull', parent: 'root', pivot: [0, 3, 0] },
    { name: 'wheels_front', parent: 'root', pivot: [0, 2, -5] },
    { name: 'wheels_back', parent: 'root', pivot: [0, 2, 5] },
    { name: 'rider', parent: 'hull', pivot: [0, 6, 1] },
  ];
  return {
    bones,
    motions: {
      idle: loopMotion(1.2, [sway('rider', [2, 0, 1], 1.2)]),
      drive: loopMotion(0.4, [spin('wheels_front', 0.4), spin('wheels_back', 0.4), sway('hull', [0, 0, 3], 0.4)], 'linear'),
      fire: onceMotion(0.4, [kick('rider', 8)]),
    },
    cubes: [
      { name: 'wheel_front', bone: 'wheels_front', origin: [-1, 0, -7], size: [2, 4, 4], paint: 'tire' },
      { name: 'wheel_back', bone: 'wheels_back', origin: [-1, 0, 3], size: [2, 4, 4], paint: 'tire' },
      { name: 'frame', bone: 'hull', origin: [-1.5, 3, -5], size: [3, 2, 10], paint: `team_${side}` },
      { name: 'handlebar', bone: 'hull', origin: [-3, 6, -5], size: [6, 1, 1], paint: 'steel' },
      { name: 'rider_body', bone: 'rider', origin: [-2.5, 5, -1], size: [5, 4, 3], paint: `team_${side}` },
      { name: 'rider_head', bone: 'rider', origin: [-2.5, 9, -2], size: [5, 4, 5], paint: 'skin', stamps: [EYES] },
      { name: 'rider_helmet', bone: 'rider', origin: [-3, 12, -2.5], size: [6, 2, 6], paint: `team_${side}`, stamps: [GOGGLES] },
      { name: 'scarf', bone: 'rider', origin: [-2, 8, 2], size: [4, 1, 3], paint: 'scarf' },
    ],
  };
}

// ---- Aire ----

/** Los aviones vuelan: todo cuelga de 'body', subido; la animacion de reposo los mece. */
const FLYING_HEIGHT = 10;
const flyingBones = (extra = []) => [{ name: 'body', parent: 'root', pivot: [0, FLYING_HEIGHT, 0] }, ...extra];
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

const propSpin = spin('prop', 0.2, { axis: 2, symmetry: 180, sign: 1 });

function lightFighter(side) {
  return {
    bones: flyingBones([{ name: 'prop', parent: 'body', pivot: [0, FLYING_HEIGHT + 2, -7.5] }]),
    motions: { ...FLYING_MOTIONS, idle: loopMotion(0.2, [propSpin], 'linear'), drive: loopMotion(0.2, [propSpin], 'linear') },
    cubes: raised([
      { name: 'fuselage', origin: [-1.5, 0, -7], size: [3, 3, 12], paint: `team_${side}` },
      { name: 'wing_top', origin: [-8, 3, -4], size: [16, 1, 4], paint: `dark_${side}` },
      { name: 'wing_low', origin: [-7, 0, -4], size: [14, 1, 4], paint: `dark_${side}` },
      { name: 'tail', origin: [-0.5, 3, 3], size: [1, 3, 2], paint: `dark_${side}` },
      { name: 'pilot', origin: [-1, 3, -2], size: [2, 2, 2], paint: 'skin' },
      { name: 'prop_hub', bone: 'prop', origin: [-0.5, 1.5, -8], size: [1, 1, 1], paint: 'steel' },
      { name: 'prop_blade', bone: 'prop', origin: [-3.5, 1.5, -8.5], size: [7, 1, 1], paint: 'steel' },
    ]),
  };
}

function fighter(side) {
  return {
    bones: flyingBones(),
    motions: FLYING_MOTIONS,
    cubes: raised([
      { name: 'fuselage', origin: [-2.5, 0, -8], size: [5, 4, 14], paint: `team_${side}` },
      { name: 'canopy', origin: [-1.5, 4, -5], size: [3, 2, 5], paint: 'glass' },
      { name: 'wing', origin: [-8, 1, -2], size: [16, 1, 6], paint: `dark_${side}` },
      { name: 'fin', origin: [-0.5, 4, 3], size: [1, 3, 3], paint: `dark_${side}` },
      { name: 'nozzle', origin: [-1.5, 1, 6], size: [3, 2, 1], paint: 'gun' },
    ]),
  };
}

function bomber(side) {
  return {
    bones: flyingBones(),
    motions: FLYING_MOTIONS,
    cubes: raised([
      { name: 'fuselage', origin: [-3, 0, -8], size: [6, 5, 16], paint: `team_${side}` },
      { name: 'cockpit', origin: [-2, 3, -9], size: [4, 2, 2], paint: 'glass' },
      { name: 'wing', origin: [-10, 2, -3], size: [20, 1, 6], paint: `dark_${side}` },
      { name: 'engine_left', origin: [-7, 0, -4], size: [3, 2, 4], paint: 'gun' },
      { name: 'engine_right', origin: [4, 0, -4], size: [3, 2, 4], paint: 'gun' },
      { name: 'tailplane', origin: [-5, 4, 6], size: [10, 1, 3], paint: `dark_${side}` },
      { name: 'bomb', origin: [-1, -2, -2], size: [2, 2, 5], paint: 'gun' },
    ]),
  };
}

function helicopter(side) {
  return {
    bones: flyingBones([{ name: 'rotor', parent: 'body', pivot: [0, FLYING_HEIGHT + 7, -1] }]),
    motions: FLYING_MOTIONS,
    cubes: raised([
      { name: 'cabin', origin: [-3.5, 0, -5], size: [7, 6, 8], paint: `team_${side}` },
      { name: 'bubble', origin: [-3, 1, -7], size: [6, 4, 2], paint: 'glass' },
      { name: 'boom', origin: [-1, 3, 3], size: [2, 2, 8], paint: `dark_${side}` },
      { name: 'tail_rotor', origin: [1, 2, 9], size: [1, 4, 2], paint: 'steel' },
      { name: 'skid_left', origin: [-4, -2, -5], size: [1, 1, 8], paint: 'gun' },
      { name: 'skid_right', origin: [3, -2, -5], size: [1, 1, 8], paint: 'gun' },
      { name: 'mast', origin: [-0.5, 6, -1.5], size: [1, 1, 1], paint: 'steel' },
      { name: 'blade_a', bone: 'rotor', origin: [-9, 7, -1.5], size: [18, 1, 1], paint: 'gun' },
      { name: 'blade_b', bone: 'rotor', origin: [-0.5, 7, -10], size: [1, 1, 18], paint: 'gun' },
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
