/**
 * Lo que vive en cada bioma, como datos: las motas que vuelan (motes.ts) y los animalitos que se
 * sientan en el decorado (critters.ts). Que terreno lleva que lo dicen sus piezas (`motes` y
 * `critters` en terrain/pieces.ts). Algo nuevo para un bioma es una entrada aqui y su sitio en las
 * piezas; si es un animal, ademas su modelo de Ashfox. Como se ven, docs/ESTETICA.md.
 */
import * as THREE from 'three';
import type { Range } from '../core/random';
import { WIND_DIRECTION } from '../core/space';
import type { CritterKind } from './critters';
import { lifeFade, vary, type Mote, type MoteKind } from './motes';

/** Lo propio de cada mota que sale de su semilla (`vary`): cada cosa, su numero. */
const PHASE = 1;
const PACE = 2;
const BLINK = 3;
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
  layers: [{ color: 0xffe4a8, opacity: 0.85, size: [0.04, 0.08] }],
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
    { color: 0xc8ff50, opacity: 0.55, size: [0.16, 0.16], glow: true },
    { color: 0xf6ffa8, opacity: 1, size: [0.035, 0.035], glow: true },
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
