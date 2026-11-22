/**
 * Lo que vive en cada bioma, como datos: las motas que vuelan (motes.ts), los animalitos que se
 * sientan en el decorado o en el suelo (critters.ts) y los que se van (travellers.ts). Que terreno lleva que
 * lo dicen sus piezas (`motes`, `critters` y `travellers` en terrain/pieces.ts). Algo nuevo para un
 * bioma es una entrada aqui y su sitio en las piezas; si es un animal, ademas su modelo de Ashfox. Como
 * se ven, docs/ESTETICA.md.
 */
import * as THREE from 'three';
import type { Range } from '../core/random';
import { WIND_DIRECTION } from '../core/space';
import { hopping, peeking, type CritterKind, type CritterPose } from './critters';
import { lifeFade, vary, type Flier } from './births';
import type { MoteKind } from './motes';
import type { TravellerKind } from './travellers';

/** Lo propio de cada mota que sale de su semilla (`vary`): cada cosa, su numero. */
const PHASE = 1;
const PACE = 2;
const BLINK = 3;
const SPIN = 4;
const CURVE = 5;
const LEVEL = 6;
const BOUNCE = 7;
const ORBIT = 8;
/** Una vuelta entera: el desfase de cada mota, para que no vayan a la par. */
const FULL_TURN: Range = [0, Math.PI * 2];

// --- El polvo de la arena: lo levanta el viento en rafagas, haga el tiempo que haga. Poco y de vez en
// cuando: es ambiente, no clima (la tormenta de arena es otra cosa: fx/weather3d.ts).

/** Casillas por segundo con el viento (el mismo que el del clima). */
const DUST_WIND = WIND_DIRECTION.clone().multiplyScalar(1.4);
/** Su vaiven mientras cruza: lo que sube y baja (casillas por segundo) y lo deprisa (radianes por segundo). */
const DUST_BOB = 0.15;
const DUST_BOB_SPEED = 5;
/** Las rafagas: cada cuanto vuelven (segundos) y que parte del tiempo sopla. */
const GUST_PERIOD = 7;
const GUST_SHARE = 0.45;
const DUST_GRAINS = 90;
/** En una rafaga salen todos los granos en un momento (un cuarto de segundo); entre rafagas, ninguno. */
const DUST_GUST_BIRTHS = DUST_GRAINS * 4;

/** Sopla en rafagas: la mitad del tiempo, mas o menos, con una entrada y una salida suaves. */
const isGusting = (time: number): boolean => Math.sin((time / GUST_PERIOD) * Math.PI * 2) > 1 - GUST_SHARE * 2;

/** Cruza bajo con el viento, subiendo y bajando un poco. */
function blowWithTheWind(mote: Flier, out: THREE.Vector3): THREE.Vector3 {
  const phase = vary(mote, PHASE, FULL_TURN);
  const bob = (DUST_BOB / DUST_BOB_SPEED) * (Math.cos(phase) - Math.cos(mote.age * DUST_BOB_SPEED + phase));
  return out
    .copy(mote.home)
    .addScaledVector(DUST_WIND, mote.age)
    .setY(mote.home.y + bob);
}

export const SAND_DUST: MoteKind = {
  count: DUST_GRAINS,
  layers: [{ colors: [0xffe4a8], opacity: 0.85, size: [0.04, 0.08] }],
  life: [1.2, 2.6],
  height: [0.05, 0.3],
  birthRate: (time) => (isGusting(time) ? DUST_GUST_BIRTHS : 0),
  flight: blowWithTheWind,
  brightness: lifeFade,
};

// --- Las luciernagas del pantano: puntitos de luz amarilla verdosa que revolotean despacio sobre los
// arboles, los juncos y el agua, y se encienden y se apagan cada una a su ritmo. Suman su luz a lo de
// detras: asi brillan tambien de dia.

/** Lo que se alejan de su sitio al revolotear y lo que suben y bajan (casillas). */
const FIREFLY_DRIFT = 0.3;
const FIREFLY_BOB = 0.06;
/** Lo deprisa que revolotean (radianes por segundo de su vaiven). */
const FIREFLY_PACE: Range = [0.3, 0.7];
/** Lo que tarda cada una en encenderse y apagarse una vez (segundos). */
const BLINK_SECONDS: Range = [1.6, 3.2];
/** Cuanto de cada parpadeo esta encendida (algo mas de la mitad) y lo deprisa que se enciende y se apaga. */
const BLINK_ON = 0.2;
const BLINK_EDGE = 1.6;

/** Vuela en lazos lentos alrededor de donde nacio, subiendo y bajando un poco. */
function hoverInLoops(mote: Flier, out: THREE.Vector3): THREE.Vector3 {
  const phase = vary(mote, PHASE, FULL_TURN);
  const turn = mote.age * vary(mote, PACE, FIREFLY_PACE) + phase;
  return out
    .set(Math.sin(turn) * FIREFLY_DRIFT, Math.sin(turn * 1.9) * FIREFLY_BOB, Math.sin(turn * 0.7 + phase) * FIREFLY_DRIFT)
    .add(mote.home);
}

/** Se enciende y se apaga a pulsos, y entra y sale despacio de su vida. */
function blinking(mote: Flier): number {
  const wave = Math.sin((mote.age / vary(mote, BLINK, BLINK_SECONDS)) * Math.PI * 2 + vary(mote, PHASE, FULL_TURN));
  return THREE.MathUtils.clamp((wave + BLINK_ON) * BLINK_EDGE, 0, 1) * lifeFade(mote);
}

export const FIREFLIES: MoteKind = {
  count: 48,
  layers: [
    { colors: [0xc8ff50], opacity: 0.55, size: [0.16, 0.16], glow: true },
    { colors: [0xf6ffa8], opacity: 1, size: [0.035, 0.035], glow: true },
  ],
  life: [7, 15],
  height: [0.2, 0.7],
  /** Al empezar no se encienden todas a la vez. */
  birthRate: () => 5,
  flight: hoverInLoops,
  brightness: blinking,
};

// --- La rana del pantano: ranitas, mas pequeñas que un soldado (docs/ESTETICA.md, «Pantano»), que de
// vez en cuando dan un saltito en su sitio y se giran.

export const FROG: CritterKind = {
  model: 'frog',
  size: 0.55,
  every: [5, 14],
  move: { seconds: 0.35, turn: [0.6, 1.8], pose: hopping(0.08) },
};

// --- Las hojas del bosque: caen de las copas cerca de la camara, verdes y ocres, despacio, meciendose
// de un lado a otro y girando (se estrechan y se ensanchan). Pocas: es ambiente, no otoño.

/** Lo que bajan (casillas por segundo): en lo que viven llegan, como mucho, al suelo desde lo bajo de la copa. */
const LEAF_FALL = 0.06;
/** Lo que se mecen a los lados (casillas) y lo deprisa (radianes por segundo). */
const LEAF_SWAY = 0.12;
const LEAF_SWAY_SPEED: Range = [1.6, 2.6];
/** Lo que las lleva el viento (casillas por segundo). */
const LEAF_DRIFT = WIND_DIRECTION.clone().multiplyScalar(0.05);
/** Lo deprisa que giran (radianes por segundo) y lo estrechas que se ven de canto. */
const LEAF_SPIN: Range = [3, 6];
const LEAF_EDGE_ON = 0.35;
/** De lado respecto al viento: hacia donde se mecen. */
const ACROSS_THE_WIND = new THREE.Vector3(-WIND_DIRECTION.z, 0, WIND_DIRECTION.x);

/** Cae despacio desde la copa, meciendose de un lado a otro y llevada un poco por el viento. */
function fallSwaying(mote: Flier, out: THREE.Vector3): THREE.Vector3 {
  const sway = Math.sin(mote.age * vary(mote, PACE, LEAF_SWAY_SPEED) + vary(mote, PHASE, FULL_TURN)) * LEAF_SWAY;
  return out
    .copy(mote.home)
    .addScaledVector(LEAF_DRIFT, mote.age)
    .addScaledVector(ACROSS_THE_WIND, sway)
    .setY(mote.home.y - LEAF_FALL * mote.age);
}

/** Gira: de frente se ve entera y de canto, estrecha. */
const turning = (mote: Flier): number =>
  LEAF_EDGE_ON + (1 - LEAF_EDGE_ON) * Math.abs(Math.cos(mote.age * vary(mote, SPIN, LEAF_SPIN) + vary(mote, PHASE, FULL_TURN)));

export const FALLING_LEAVES: MoteKind = {
  count: 18,
  layers: [{ colors: [0x5e9a34, 0x7cb042, 0x4c8a2c, 0xc8973a, 0xb0702e], opacity: 1, size: [0.035, 0.05] }],
  life: [4, 6],
  height: [0.36, 0.5],
  birthRate: () => 3,
  flight: fallSwaying,
  brightness: lifeFade,
  scale: turning,
};

// --- La ardilla del bosque: en lo alto de un arbol, entre las copas; de vez en cuando da unos saltitos
// rapidos y se gira (docs/ESTETICA.md, «Bosque»).

export const SQUIRREL: CritterKind = {
  model: 'squirrel',
  size: 0.6,
  every: [3, 9],
  move: { seconds: 0.6, turn: [0.8, 2.2], pose: hopping(0.035, 3) },
};

// --- El ciervo del bosque: en el borde, mirando fuera; de vez en cuando asoma un poco y vuelve.

export const DEER: CritterKind = {
  model: 'deer',
  size: 0.5,
  every: [8, 18],
  move: { seconds: 4, turn: [0, 0], pose: peeking(0.08) },
};

// --- Los pajaros del bosque: de vez en cuando uno sale de una copa cerca de la camara, vuela bajo sobre
// el bosque batiendo las alas, en arco, y se mete en la copa de otra casilla de bosque unas casillas mas
// alla (si no hay ninguna a esa distancia, no sale).

/** A cuantas casillas de la suya esta la copa en la que acaba. */
const BIRD_LANDING: Range = [1.5, 3];
/** Lo que sube el arco sobre las copas y lo que se aparta de la linea recta a mitad de camino (casillas). */
const BIRD_ARC = 0.35;
const BIRD_CURVE: Range = [-0.4, 0.4];
/** El vaiven de cada aletazo: lo que sube y baja (casillas) y lo deprisa (radianes por segundo). */
const BIRD_BOB = 0.015;
const BIRD_BOB_SPEED = 30;

/** Va de su copa a la otra (`goal`) en un arco, apartandose un poco de la linea recta. */
function hopToAnotherTree(bird: Flier, out: THREE.Vector3): THREE.Vector3 {
  const { home } = bird;
  const goal = bird.goal ?? home;
  const progress = bird.age / bird.life;
  const midway = Math.sin(progress * Math.PI);
  const across = Math.atan2(goal.z - home.z, goal.x - home.x) + Math.PI / 2;
  const bend = vary(bird, CURVE, BIRD_CURVE) * midway;
  out.lerpVectors(home, goal, progress);
  out.x += Math.cos(across) * bend;
  out.z += Math.sin(across) * bend;
  out.y += midway * (BIRD_ARC + Math.sin(bird.age * BIRD_BOB_SPEED) * BIRD_BOB);
  return out;
}

export const FOREST_BIRDS: TravellerKind = {
  model: 'bird',
  size: 0.6,
  count: 5,
  life: [2.5, 4],
  height: [0.38, 0.45],
  birthRate: () => 0.6,
  landing: { distance: BIRD_LANDING },
  flight: hopToAnotherTree,
  wings: { beats: 5, narrowest: 0.35 },
};

// --- La lagartija del desierto: tomando el sol en una losa de arenisca o al pie de un cactus; de vez en
// cuando hace sus flexiones (sube y baja dos veces) y se gira.

export const LIZARD: CritterKind = {
  model: 'lizard',
  size: 0.5,
  every: [2, 7],
  move: { seconds: 0.5, turn: [0.6, 2.4], pose: hopping(0.015, 2) },
};

// --- Las bolas rodadoras: de vez en cuando una cruza unas casillas de arena cerca de la camara, rodando
// con el viento y dando botes, subiendo y bajando las dunas (va por el suelo). No cruza las mesetas: solo
// sale si hay arena hasta donde va.

const TUMBLEWEED_SIZE = 0.7;
/** Lo que mide su radio (casillas): el de su modelo (3,5 de 32 por casilla), a su tamaño. A esa altura va su centro. */
const TUMBLEWEED_RADIUS = (3.5 / 32) * TUMBLEWEED_SIZE;
/** Cuantos botes da en su viaje y lo que sube cada uno (casillas). */
const TUMBLEWEED_BOUNCES: Range = [3, 5];
const TUMBLEWEED_BOUNCE: Range = [0.03, 0.08];

/** Rueda en linea recta hasta su sitio (`goal`), a botes. Su altura es sobre el suelo (`onTheGround`). */
function rollWithTheWind(ball: Flier, out: THREE.Vector3): THREE.Vector3 {
  const progress = ball.age / ball.life;
  const bounces = Math.round(vary(ball, PACE, TUMBLEWEED_BOUNCES));
  const bounce = Math.abs(Math.sin(progress * Math.PI * bounces)) * vary(ball, BOUNCE, TUMBLEWEED_BOUNCE);
  return out.lerpVectors(ball.home, ball.goal ?? ball.home, progress).setY(TUMBLEWEED_RADIUS + bounce);
}

export const TUMBLEWEEDS: TravellerKind = {
  model: 'tumbleweed',
  size: TUMBLEWEED_SIZE,
  count: 2,
  life: [3.5, 5],
  height: [0, 0],
  birthRate: () => 0.15,
  reach: 0.5,
  landing: { distance: [2.5, 4], toward: { direction: WIND_DIRECTION, spread: 0.35 }, overland: true },
  flight: rollWithTheWind,
  onTheGround: true,
  /** Lo que avanza por segundo entre su radio, mas o menos: rueda sin patinar. */
  rolls: 10,
};

// --- Los remolinos de polvo: de vez en cuando, cerca de la camara, uno pequeño de granos de arena que
// suben girando en embudo, se mueven un poco con el viento y se deshacen. Cada remolino es una tanda de
// motas que nacen juntas (`together`).

const DEVIL_GRAINS = 50;
/** Lo alto del embudo y lo ancho (radio, casillas): abajo y lo que se abre hasta arriba. */
const DEVIL_HEIGHT = 0.85;
const DEVIL_FOOT = 0.03;
const DEVIL_FLARE = 0.22;
/** Lo deprisa que giran los granos (radianes por segundo) y que parte del embudo suben por segundo. */
const DEVIL_SPIN: Range = [6, 9];
const DEVIL_RISE = 0.3;
/** Lo que lo lleva el viento (casillas por segundo) y lo que se cimbrea arriba (casillas, y lo deprisa). */
const DEVIL_DRIFT = WIND_DIRECTION.clone().multiplyScalar(0.12);
const DEVIL_SWAY = 0.05;
const DEVIL_SWAY_SPEED = 1.7;

/** A que altura del embudo va un grano (0 abajo, 1 arriba): sube y, al llegar arriba, vuelve abajo. */
function levelOf(grain: Flier): number {
  const level = vary(grain, LEVEL, [0, 1]) + grain.age * DEVIL_RISE;
  return level - Math.floor(level);
}

/** Sube girando alrededor del eje del remolino, mas abierto cuanto mas arriba. */
function swirlUp(grain: Flier, out: THREE.Vector3): THREE.Vector3 {
  const level = levelOf(grain);
  const radius = DEVIL_FOOT + DEVIL_FLARE * level;
  const turn = vary(grain, PHASE, FULL_TURN) + grain.age * vary(grain, PACE, DEVIL_SPIN);
  const sway = Math.sin(grain.age * DEVIL_SWAY_SPEED) * DEVIL_SWAY * level;
  out.copy(grain.home).addScaledVector(DEVIL_DRIFT, grain.age);
  out.x += Math.cos(turn) * radius + sway;
  out.y += level * DEVIL_HEIGHT;
  out.z += Math.sin(turn) * radius;
  return out;
}

/** Se ve mas abajo que arriba, donde se deshace (asi no se nota cuando vuelve abajo), y entra y sale despacio. */
const thinningUp = (grain: Flier): number => (1 - levelOf(grain) ** 2) * lifeFade(grain);

export const DUST_DEVILS: MoteKind = {
  count: DEVIL_GRAINS * 2,
  together: DEVIL_GRAINS,
  layers: [{ colors: [0xf6dca8, 0xeacb8e, 0xfff0cc], opacity: 0.9, size: [0.035, 0.065] }],
  life: [4, 6],
  height: [0, 0],
  birthRate: () => 0.12,
  reach: 0.5,
  flight: swirlUp,
  brightness: thinningUp,
};

// --- Los buitres: uno o dos dan vueltas en lo alto sobre el desierto cerca de la camara, planeando sin
// batir las alas, con su sombra en el suelo (la del sol, como todo lo del tablero). Llegan de lejos
// planeando en espiral y se van igual.

/** El circulo: su radio (casillas) y lo deprisa que lo dan (radianes por segundo; todos hacia el mismo lado). */
const VULTURE_ORBIT: Range = [0.9, 1.4];
const VULTURE_PACE: Range = [0.35, 0.5];
/** De lo lejos que llegan (casillas, ademas del circulo) y lo que tardan en llegar y en irse (segundos). */
const VULTURE_ARRIVAL = 5;
const VULTURE_GLIDE_IN = 4;
/** Lo que suben y bajan mientras planean (casillas) y lo despacio (radianes por segundo). */
const VULTURE_SOAR = 0.06;
const VULTURE_SOAR_SPEED = 0.6;

/** Da vueltas sobre donde nacio; al llegar y al irse, desde mas lejos (en espiral). */
function circleOverhead(vulture: Flier, out: THREE.Vector3): THREE.Vector3 {
  const away = Math.max(0, 1 - Math.min(vulture.age, vulture.life - vulture.age) / VULTURE_GLIDE_IN);
  const radius = vary(vulture, ORBIT, VULTURE_ORBIT) + VULTURE_ARRIVAL * away * away;
  const turn = vary(vulture, PHASE, FULL_TURN) + vulture.age * vary(vulture, PACE, VULTURE_PACE);
  out.copy(vulture.home);
  out.x += Math.cos(turn) * radius;
  out.y += Math.sin(vulture.age * VULTURE_SOAR_SPEED) * VULTURE_SOAR;
  out.z += Math.sin(turn) * radius;
  return out;
}

export const VULTURES: TravellerKind = {
  model: 'vulture',
  size: 0.55,
  count: 2,
  life: [16, 24],
  height: [1.3, 1.6],
  birthRate: () => 0.06,
  reach: 0.4,
  flight: circleOverhead,
};

// --- Los copos de la nieve: puntitos blancos que bajan muy despacio sobre la nieve y el hielo,
// meciendose con el viento, y de vez en cuando brillan al sol (un destello corto). Suman su luz, como
// las luciernagas: asi destacan sobre la nieve.

/** Lo que bajan (casillas por segundo): en lo que viven no llegan al suelo. */
const FLAKE_FALL = 0.04;
const FLAKE_DRIFT = WIND_DIRECTION.clone().multiplyScalar(0.06);
/** Lo que se mecen a los lados (casillas) y lo deprisa (radianes por segundo). */
const FLAKE_SWAY = 0.06;
const FLAKE_SWAY_SPEED: Range = [1, 1.8];
/** Lo que tarda cada uno en dar la vuelta y volver a brillar (segundos). */
const SPARKLE_SECONDS: Range = [1.2, 2.4];
/** Lo corto que es el destello (cuanto mas, mas corto), lo que se ve sin brillar y lo que mide entonces. */
const SPARKLE_SHARPNESS = 10;
const FLAKE_DIM = 0.35;
const FLAKE_SMALL = 0.45;

/** Baja despacio meciendose y con el viento. */
function floatDown(flake: Flier, out: THREE.Vector3): THREE.Vector3 {
  const sway = Math.sin(flake.age * vary(flake, PACE, FLAKE_SWAY_SPEED) + vary(flake, PHASE, FULL_TURN)) * FLAKE_SWAY;
  out.copy(flake.home).addScaledVector(FLAKE_DRIFT, flake.age).addScaledVector(ACROSS_THE_WIND, sway);
  out.y -= flake.age * FLAKE_FALL;
  return out;
}

/** Lo que le da el sol al copo a su edad (0 a 1): casi nunca y, al dar la vuelta, un destello corto. */
function flashOf(flake: Flier): number {
  const turn = Math.sin((flake.age / vary(flake, BLINK, SPARKLE_SECONDS)) * Math.PI * 2 + vary(flake, PHASE, FULL_TURN));
  return Math.max(0, turn) ** SPARKLE_SHARPNESS;
}

export const SNOW_GLITTER: MoteKind = {
  count: 90,
  layers: [{ colors: [0xffffff, 0xeef6ff, 0xfff6dc], opacity: 1, size: [0.045, 0.065], glow: true }],
  life: [4, 7],
  height: [0.3, 0.7],
  birthRate: () => 16,
  reach: 0.5,
  flight: floatDown,
  /** Se ve poco y, cuando le da el sol, brilla un momento y se agranda. */
  brightness: (flake) => (FLAKE_DIM + (1 - FLAKE_DIM) * flashOf(flake)) * lifeFade(flake),
  scale: (flake) => FLAKE_SMALL + (1 - FLAKE_SMALL) * flashOf(flake),
};

// --- El pingüino de la nieve: en el hielo de la orilla, mirando al agua. De vez en cuando da unos
// pasitos de pato (se balancea de un lado a otro); alguna vez se tumba de barriga, se desliza hasta el
// agua y se hunde, y al rato salta del agua a su sitio y se da la vuelta para volver a mirarla.

const PENGUIN_SIZE = 0.5;
/** Los pasitos de pato: cuantos, lo que se ladea y se tuerce en cada uno, lo que sube y lo que avanza y vuelve (casillas). */
const WADDLE_STEPS = 4;
const WADDLE_SWAY = 0.3;
const WADDLE_TWIST = 0.15;
const WADDLE_STEP_UP = 0.006;
const WADDLE_REACH = 0.04;

/** Se balancea de un pie al otro, cada paso: se ladea, se tuerce y sube un poco. */
function stepLikeADuck(progress: number, steps: number, pose: CritterPose): CritterPose {
  const step = Math.sin(progress * Math.PI * steps);
  pose.roll = step * WADDLE_SWAY;
  pose.yaw += step * WADDLE_TWIST;
  pose.lift = Math.abs(step) * WADDLE_STEP_UP;
  return pose;
}

/** Unos pasitos de pato hacia el agua y otros de vuelta. */
function waddle(progress: number, pose: CritterPose): CritterPose {
  pose.forward = Math.sin(progress * Math.PI) * WADDLE_REACH;
  return stepLikeADuck(progress, WADDLE_STEPS, pose);
}

/** Las partes de la zambullida, en lo que va de ella (de 0 a 1): cuando acaba cada una. */
const DIVE_FLOPPED = 0.08;
const DIVE_AT_THE_EDGE = 0.26;
const DIVE_IN = 0.34;
const DIVE_SURFACING = 0.72;
const DIVE_LANDED = 0.86;
/** Donde se acaba su casilla (casillas por delante de su sitio), hasta donde se desliza y hasta donde cae. */
const SHORE = 0.2;
const SLIDE_REACH = SHORE + 0.08;
const FALL_REACH = 0.45;
/** Lo que se le va la cabeza hacia abajo al caer (radianes). */
const FALL_TILT = 0.4;
/** Lo hondo que nada bajo el agua, de donde salta (por delante y bajo el agua) y lo que sube por encima del hielo al saltar. */
const SWIM_DEPTH = 0.25;
const LEAP_FROM = 0.4;
const LEAP_DEPTH = 0.12;
const LEAP_ABOVE = 0.08;
/** Lo que va inclinado hacia delante al salir del agua (de cabeza) y lo que sube tumbado: su tripa (casillas). */
const LEAP_TILT = 1.1;
const BELLY = (2 / 32) * PENGUIN_SIZE;
const TURN_BACK_STEPS = 3;

/** Lo que va de una parte del movimiento (0 antes de empezarla, 1 acabada). */
const partOf = (progress: number, from: number, to: number): number => THREE.MathUtils.clamp((progress - from) / (to - from), 0, 1);

/** Se tumba de barriga y se desliza, cada vez mas deprisa, hasta el borde del hielo. */
function slideToTheEdge(progress: number, pose: CritterPose): CritterPose {
  const flopped = partOf(progress, 0, DIVE_FLOPPED);
  pose.pitch = (flopped * Math.PI) / 2;
  pose.forward = partOf(progress, DIVE_FLOPPED, DIVE_AT_THE_EDGE) ** 2 * SLIDE_REACH;
  pose.lift = flopped * BELLY;
  return pose;
}

/** Se cae del borde al agua (lo que baje), de cabeza, cada vez mas deprisa, y se hunde. */
function fallIn(part: number, pose: CritterPose, drop: number): CritterPose {
  pose.pitch = Math.PI / 2 + part * FALL_TILT;
  pose.forward = THREE.MathUtils.lerp(SLIDE_REACH, FALL_REACH, part);
  pose.lift = BELLY - part ** 2 * (drop + SWIM_DEPTH + BELLY);
  return pose;
}

/** Bajo el agua (no se ve): se da la vuelta para salir hacia su sitio. */
function swim(pose: CritterPose, drop: number): CritterPose {
  pose.pitch = Math.PI / 2;
  pose.forward = FALL_REACH;
  pose.lift = -(drop + SWIM_DEPTH);
  pose.yaw = Math.PI;
  return pose;
}

/** Salta del agua de cabeza, en arco por encima del borde del hielo, y cae de pie en su sitio (mirando al hielo). */
function leapOut(part: number, pose: CritterPose, drop: number): CritterPose {
  pose.yaw = Math.PI;
  pose.pitch = (1 - part) * LEAP_TILT;
  pose.forward = (1 - part) * LEAP_FROM;
  pose.lift = -(1 - part) * (drop + LEAP_DEPTH) + Math.sin(part * Math.PI) * (drop + LEAP_ABOVE);
  return pose;
}

/** Se tira al agua y vuelve: acaba como empezo (una vuelta entera, mirando al agua). */
function bellyDive(progress: number, pose: CritterPose, drop: number): CritterPose {
  if (progress < DIVE_AT_THE_EDGE) return slideToTheEdge(progress, pose);
  if (progress < DIVE_IN) return fallIn(partOf(progress, DIVE_AT_THE_EDGE, DIVE_IN), pose, drop);
  if (progress < DIVE_SURFACING) return swim(pose, drop);
  if (progress < DIVE_LANDED) return leapOut(partOf(progress, DIVE_SURFACING, DIVE_LANDED), pose, drop);
  const turned = partOf(progress, DIVE_LANDED, 1);
  pose.yaw = Math.PI * (1 + turned);
  return stepLikeADuck(turned, TURN_BACK_STEPS, pose);
}

export const PENGUIN: CritterKind = {
  model: 'penguin',
  size: PENGUIN_SIZE,
  every: [2, 6],
  move: { seconds: 1.2, turn: [0, 0], pose: waddle },
  sometimes: { move: { seconds: 7, turn: [0, 0], pose: bellyDive }, share: 0.25 },
};

// --- La foca de la nieve: tumbada en el hielo de la orilla, mirando al agua; de vez en cuando levanta
// la cabeza (apoyada en la cola) y mira a un lado y a otro.

const SEAL_SIZE = 0.55;
/** Lo que levanta la cabeza (radianes), lo que mira a los lados y lo que hay de sus pies (el origen) a la punta de la cola. */
const SEAL_RAISE = 0.3;
const SEAL_LOOK = 0.5;
const SEAL_TAIL = (7 / 32) * SEAL_SIZE;

/** Levanta la cabeza, mira a un lado y al otro y la vuelve a bajar; la cola no se mete en el hielo. */
function lookAround(progress: number, pose: CritterPose): CritterPose {
  const raised = Math.sqrt(Math.sin(progress * Math.PI));
  pose.pitch = -raised * SEAL_RAISE;
  pose.lift = Math.sin(raised * SEAL_RAISE) * SEAL_TAIL;
  pose.yaw = Math.sin(progress * Math.PI * 2) * SEAL_LOOK * raised;
  return pose;
}

export const SEAL: CritterKind = {
  model: 'seal',
  size: SEAL_SIZE,
  every: [6, 14],
  move: { seconds: 3.5, turn: [0, 0], pose: lookAround },
};

// --- Las mariposas de la llanura: amarillas y blancas, revolotean sobre las flores en lazos que no se
// repiten, subiendo y bajando, batiendo las alas deprisa (visto desde arriba, se estrechan y se ensanchan).

/** Lo que se alejan de su flor al revolotear (casillas: un lazo grande y otro pequeño encima) y lo deprisa. */
const BUTTERFLY_LOOP = 0.3;
const BUTTERFLY_WOBBLE = 0.12;
const BUTTERFLY_PACE: Range = [0.8, 1.4];
/** Lo que suben y bajan a cada aletazo (casillas) y lo deprisa (radianes por segundo). */
const BUTTERFLY_BOB = 0.05;
const BUTTERFLY_BOB_SPEED = 6;

/** Revolotea alrededor de donde nacio en lazos irregulares (uno grande y otro pequeño, cada uno a su paso). */
function flitAbout(butterfly: Flier, out: THREE.Vector3): THREE.Vector3 {
  const phase = vary(butterfly, PHASE, FULL_TURN);
  const turn = butterfly.age * vary(butterfly, PACE, BUTTERFLY_PACE) + phase;
  const wobble = turn * 2.7 + phase;
  out.set(
    Math.sin(turn) * BUTTERFLY_LOOP + Math.sin(wobble) * BUTTERFLY_WOBBLE,
    Math.abs(Math.sin(butterfly.age * BUTTERFLY_BOB_SPEED + phase)) * BUTTERFLY_BOB,
    Math.sin(turn * 0.8 + phase) * BUTTERFLY_LOOP + Math.cos(wobble) * BUTTERFLY_WOBBLE,
  );
  return out.add(butterfly.home);
}

/** Lo comun de las mariposas de cada color. */
const BUTTERFLY: Omit<TravellerKind, 'model'> = {
  size: 0.55,
  count: 4,
  life: [6, 10],
  height: [0.12, 0.28],
  birthRate: () => 0.4,
  reach: 0.6,
  flight: flitAbout,
  wings: { beats: 7, narrowest: 0.15 },
};
export const YELLOW_BUTTERFLIES: TravellerKind = { ...BUTTERFLY, model: 'butterfly_yellow' };
export const WHITE_BUTTERFLIES: TravellerKind = { ...BUTTERFLY, model: 'butterfly_white' };

// --- El conejo de la llanura: escondido en su madriguera (en algunas casillas de hierba); de vez en
// cuando asoma, mira a un lado y a otro con un saltito y se vuelve a meter.

const RABBIT_SIZE = 0.5;
/** Lo que sube para asomar: lo que esta metido en el monticulo de su madriguera (casillas; pieces.ts lo sienta ahi). */
export const RABBIT_CLIMB = 0.18;
/** Cuando ha salido del todo y cuando empieza a meterse (en lo que va de su movimiento, de 0 a 1). */
const RABBIT_OUT = 0.12;
const RABBIT_BACK = 0.85;
/** Lo que mira a los lados (radianes) y lo que sube su saltito (casillas). */
const RABBIT_LOOK = 0.6;
const RABBIT_HOP = 0.025;

/** Asoma deprisa, mira a un lado y a otro con un saltito cada vez y se vuelve a meter. */
function peekOutOfTheBurrow(progress: number, pose: CritterPose): CritterPose {
  const out = Math.min(progress / RABBIT_OUT, (1 - progress) / (1 - RABBIT_BACK), 1);
  const looking = THREE.MathUtils.clamp((progress - RABBIT_OUT) / (RABBIT_BACK - RABBIT_OUT), 0, 1);
  const glance = Math.sin(looking * Math.PI * 2);
  pose.lift = Math.sin((out * Math.PI) / 2) * RABBIT_CLIMB + Math.abs(glance) * RABBIT_HOP;
  pose.yaw = glance * RABBIT_LOOK;
  return pose;
}

export const RABBIT: CritterKind = {
  model: 'rabbit',
  size: RABBIT_SIZE,
  every: [4, 10],
  move: { seconds: 4, turn: [0.3, 1.5], pose: peekOutOfTheBurrow },
};

// --- Los peces de la llanura: de vez en cuando, cerca de la camara, uno salta del agua en arco y vuelve
// a caer (sube de morro y cae de cabeza). Sale de debajo del agua: no hace falta que crezca.

/** Lo que avanza en el salto, lo que sube sobre el agua y lo hondo que empieza y acaba (casillas). */
const FISH_LEAP: Range = [0.25, 0.4];
const FISH_HEIGHT: Range = [0.14, 0.24];
const FISH_DEPTH = 0.15;
/** Lo que se aparta del centro de su casilla, como mucho: el salto no se sale del agua. */
const FISH_ASIDE: Range = [0, 0.12];

/** Salta en arco cerca del centro de su casilla de agua, de debajo del agua a debajo del agua. */
function leapOutOfTheWater(fish: Flier, out: THREE.Vector3): THREE.Vector3 {
  const progress = fish.age / fish.life;
  const heading = vary(fish, PHASE, FULL_TURN);
  const aside = vary(fish, CURVE, FISH_ASIDE);
  const along = (progress - 0.5) * vary(fish, PACE, FISH_LEAP);
  out.set(
    Math.round(fish.home.x) + Math.cos(heading) * along - Math.sin(heading) * aside,
    fish.home.y - FISH_DEPTH + Math.sin(progress * Math.PI) * (vary(fish, LEVEL, FISH_HEIGHT) + FISH_DEPTH),
    Math.round(fish.home.z) + Math.sin(heading) * along + Math.cos(heading) * aside,
  );
  return out;
}

export const JUMPING_FISH: TravellerKind = {
  model: 'fish',
  size: 0.5,
  count: 3,
  life: [0.8, 1.1],
  height: [0, 0],
  birthRate: () => 0.5,
  reach: 0.5,
  flight: leapOutOfTheWater,
  pitches: true,
  grows: false,
};

// --- Las bandadas de la llanura: de vez en cuando pasan unos gansos en V, altos, cruzando lo que se mira
// de lado a lado sin pararse, batiendo las alas despacio. Cada uno va en su puesto de la V (`rank`).

const GEESE_IN_A_FLOCK = 7;
/** Lo que se separa cada fila de la V de la de delante, hacia atras y a cada lado (casillas). */
const VEE_BACK = 0.3;
const VEE_SIDE = 0.3;
/** Lo que cruzan en su vida, la mitad antes de pasar por donde nacieron (casillas). */
const FLOCK_SPAN = 16;
/** Su vaiven al volar: lo que suben y bajan (casillas) y lo deprisa (radianes por segundo). */
const GOOSE_BOB = 0.02;
const GOOSE_BOB_SPEED = 3;

/** Va en su puesto de la V, en linea recta por donde nacio la bandada, hacia donde va (`goal`). */
function flyInAVee(goose: Flier, out: THREE.Vector3): THREE.Vector3 {
  const { home } = goose;
  const goal = goose.goal ?? home;
  const length = Math.hypot(goal.x - home.x, goal.z - home.z) || 1;
  const forwardX = (goal.x - home.x) / length;
  const forwardZ = (goal.z - home.z) / length;
  const rank = goose.rank ?? 0;
  const row = Math.ceil(rank / 2);
  const side = rank % 2 === 1 ? -1 : 1;
  const along = (goose.age / goose.life - 0.5) * FLOCK_SPAN - row * VEE_BACK;
  const aside = side * row * VEE_SIDE;
  return out.set(
    home.x + forwardX * along - forwardZ * aside,
    home.y + Math.sin(goose.age * GOOSE_BOB_SPEED + goose.seed) * GOOSE_BOB,
    home.z + forwardZ * along + forwardX * aside,
  );
}

export const GEESE: TravellerKind = {
  model: 'goose',
  size: 0.5,
  count: GEESE_IN_A_FLOCK * 2,
  together: GEESE_IN_A_FLOCK,
  life: [12, 16],
  height: [1.2, 1.4],
  birthRate: () => 0.04,
  reach: 0.4,
  landing: { distance: [3, 6] },
  flight: flyInAVee,
  wings: { beats: 2.2, narrowest: 0.4 },
};
