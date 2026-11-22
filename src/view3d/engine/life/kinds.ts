/**
 * Lo que vive en cada bioma, como datos: las motas que vuelan (motes.ts), los animalitos que se
 * sientan en el decorado (critters.ts) y los que se van volando (travellers.ts). Que terreno lleva que
 * lo dicen sus piezas (`motes`, `critters` y `travellers` en terrain/pieces.ts). Algo nuevo para un
 * bioma es una entrada aqui y su sitio en las piezas; si es un animal, ademas su modelo de Ashfox. Como
 * se ven, docs/ESTETICA.md.
 */
import * as THREE from 'three';
import type { Range } from '../core/random';
import { WIND_DIRECTION } from '../core/space';
import type { CritterKind } from './critters';
import { lifeFade, vary, type Mote, type MoteKind } from './motes';
import type { TravellerKind } from './travellers';

/** Lo propio de cada mota que sale de su semilla (`vary`): cada cosa, su numero. */
const PHASE = 1;
const PACE = 2;
const BLINK = 3;
const SPIN = 4;
const CURVE = 5;
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
function blowWithTheWind(mote: Mote, out: THREE.Vector3): THREE.Vector3 {
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
function hoverInLoops(mote: Mote, out: THREE.Vector3): THREE.Vector3 {
  const phase = vary(mote, PHASE, FULL_TURN);
  const turn = mote.age * vary(mote, PACE, FIREFLY_PACE) + phase;
  return out
    .set(Math.sin(turn) * FIREFLY_DRIFT, Math.sin(turn * 1.9) * FIREFLY_BOB, Math.sin(turn * 0.7 + phase) * FIREFLY_DRIFT)
    .add(mote.home);
}

/** Se enciende y se apaga a pulsos, y entra y sale despacio de su vida. */
function blinking(mote: Mote): number {
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
  move: { seconds: 0.35, height: 0.08, turn: [0.6, 1.8] },
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
function fallSwaying(mote: Mote, out: THREE.Vector3): THREE.Vector3 {
  const sway = Math.sin(mote.age * vary(mote, PACE, LEAF_SWAY_SPEED) + vary(mote, PHASE, FULL_TURN)) * LEAF_SWAY;
  return out
    .copy(mote.home)
    .addScaledVector(LEAF_DRIFT, mote.age)
    .addScaledVector(ACROSS_THE_WIND, sway)
    .setY(mote.home.y - LEAF_FALL * mote.age);
}

/** Gira: de frente se ve entera y de canto, estrecha. */
const turning = (mote: Mote): number =>
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
  move: { seconds: 0.6, height: 0.035, turn: [0.8, 2.2], hops: 3 },
};

// --- El ciervo del bosque: en el borde, mirando fuera; de vez en cuando asoma un poco y vuelve.

export const DEER: CritterKind = {
  model: 'deer',
  size: 0.5,
  every: [8, 18],
  move: { seconds: 4, height: 0, turn: [0, 0], reach: 0.08 },
};

// --- Los pajaros del bosque: de vez en cuando uno sale de una copa cerca de la camara, vuela bajo sobre
// el bosque batiendo las alas, en arco, y se mete en otra copa unas casillas mas alla.

/** Lo que sube el arco sobre las copas (casillas), lo deprisa que va (casillas por segundo) y lo que tuerce (radianes por segundo). */
const BIRD_ARC = 0.35;
const BIRD_SPEED: Range = [0.6, 0.9];
const BIRD_CURVE: Range = [-0.4, 0.4];
/** El vaiven de cada aletazo: lo que sube y baja (casillas) y lo deprisa (radianes por segundo). */
const BIRD_BOB = 0.015;
const BIRD_BOB_SPEED = 30;

/** Sale de la copa y vuela hacia su lado, torciendo un poco, en un arco que acaba en otra copa. */
function hopToAnotherTree(bird: Mote, out: THREE.Vector3): THREE.Vector3 {
  const heading = vary(bird, PHASE, FULL_TURN) + vary(bird, CURVE, BIRD_CURVE) * bird.age;
  const away = vary(bird, PACE, BIRD_SPEED) * bird.age;
  const arc = Math.sin((bird.age / bird.life) * Math.PI) * (BIRD_ARC + Math.sin(bird.age * BIRD_BOB_SPEED) * BIRD_BOB);
  const { home } = bird;
  return out.set(home.x + Math.cos(heading) * away, home.y + arc, home.z + Math.sin(heading) * away);
}

export const FOREST_BIRDS: TravellerKind = {
  model: 'bird',
  size: 0.6,
  count: 5,
  life: [2.5, 4],
  height: [0.38, 0.45],
  birthRate: () => 0.6,
  flight: hopToAnotherTree,
  wings: { beats: 5, narrowest: 0.35 },
};
