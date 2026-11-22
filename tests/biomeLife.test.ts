import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mapGrid } from '@core/mapGrid';
import type { Pos } from '@core/model';
import { seededRng } from '@core/util/random';
import { spotsByCritter, tilesByMote, tilesByTraveller } from '../src/view3d/engine/life/biomeLife';
import { Births, type BirthPlan, type Flier } from '../src/view3d/engine/life/births';
import { poseAt, type CritterMove, type CritterPose } from '../src/view3d/engine/life/critters';
import {
  DEER,
  DUST_DEVILS,
  FALLING_LEAVES,
  FIREFLIES,
  FOREST_BIRDS,
  FROG,
  LIZARD,
  PENGUIN,
  SAND_DUST,
  SEAL,
  SNOW_GLITTER,
  SQUIRREL,
  TUMBLEWEEDS,
  VULTURES,
} from '../src/view3d/engine/life/kinds';
import type { MoteKind } from '../src/view3d/engine/life/motes';
import { WIND_DIRECTION } from '../src/view3d/engine/core/space';
import { groupBy } from '../src/view3d/engine/core/groupBy';
import { tileNoise } from '../src/view3d/engine/terrain/placed';
import { blankState } from './helpers';

/** Lo que vive en los biomas (engine/life/kinds.ts): que las motas se vean bien, sean de la clase que sean. */

const KINDS: Record<string, MoteKind> = { SAND_DUST, FIREFLIES, FALLING_LEAVES, DUST_DEVILS, SNOW_GLITTER };
const SEEDS = [0.1, 1.7, 250, 999];

const moteAt = (seed: number, age: number, life: number): Flier => ({ home: new THREE.Vector3(3, 0.4, 5), age, life, seed });

/** Lo que va viendose una mota a lo largo de su vida, en pasos. */
const brightnessOverLife = (kind: MoteKind, seed: number): number[] =>
  Array.from({ length: 101 }, (_, step) => kind.brightness(moteAt(seed, (kind.life[1] * step) / 100, kind.life[1])));

describe('las motas del ambiente', () => {
  it.each(Object.keys(KINDS))('%s nace y se va apagada (nada sale ni desaparece de golpe) y nunca pasa de entera', (name) => {
    const kind = KINDS[name]!;
    for (const seed of SEEDS) {
      const seen = brightnessOverLife(kind, seed);
      expect(seen[0]).toBeCloseTo(0);
      expect(seen.at(-1)).toBeCloseTo(0);
      expect(seen.every((value) => value >= 0 && value <= 1)).toBe(true);
    }
  });

  it('el polvo sale de donde nace y cruza con el viento', () => {
    const born = moteAt(SEEDS[1]!, 0, 2);
    const later = moteAt(SEEDS[1]!, 2, 2);
    expect(SAND_DUST.flight(born, new THREE.Vector3()).distanceTo(born.home)).toBeCloseTo(0);
    const crossed = SAND_DUST.flight(later, new THREE.Vector3()).sub(later.home);
    expect(crossed.dot(WIND_DIRECTION)).toBeGreaterThan(1);
  });

  it('las luciernagas revolotean cerca de su sitio', () => {
    const lifetime = Array.from({ length: 60 }, (_, step) => moteAt(SEEDS[2]!, step / 4, 15));
    const away = lifetime.map((mote) => FIREFLIES.flight(mote, new THREE.Vector3()).distanceTo(mote.home));
    expect(Math.max(...away)).toBeLessThan(0.5);
  });

  it('las hojas caen de la copa meciendose, sin pasar del suelo, y giran (se estrechan sin desaparecer)', () => {
    const [lowestBirth] = FALLING_LEAVES.height;
    const lifetime = Array.from({ length: 61 }, (_, step) =>
      moteAt(SEEDS[3]!, (FALLING_LEAVES.life[1] * step) / 60, FALLING_LEAVES.life[1]),
    );
    const fallen = lifetime.map((mote) => mote.home.y - FALLING_LEAVES.flight(mote, new THREE.Vector3()).y);
    expect(fallen.every((drop, step) => step === 0 || drop > fallen[step - 1]!)).toBe(true);
    expect(Math.max(...fallen)).toBeLessThanOrEqual(lowestBirth + 1e-9);
    const sizes = lifetime.map((mote) => FALLING_LEAVES.scale!(mote));
    expect(Math.min(...sizes)).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.3);
  });

  it('el polvo sale en rafagas: a ratos nace y a ratos no', () => {
    const rates = Array.from({ length: 70 }, (_, tenth) => SAND_DUST.birthRate(tenth / 10));
    expect(rates.some((rate) => rate > 0)).toBe(true);
    expect(rates.some((rate) => rate === 0)).toBe(true);
  });
});

/** Un pantano todo de agua (sin decorado en la mitad de las casillas, alternas) y sus casillas. */
function swampOfWater() {
  const s = blankState();
  s.theme = 'Swamp';
  const positions = [...mapGrid(s).cells()].map((cell) => cell.pos);
  for (const pos of positions) s.map[pos.x]![pos.y] = 'Water';
  const hasDecor = (pos: Pos) => (pos.x + pos.y) % 2 === 0;
  const ground = {
    positions,
    groundOf: (pos: Pos) => new THREE.Vector3(pos.x, 0, pos.y),
    heightAt: () => 0,
    decorPlaceOf: (pos: Pos) => (hasDecor(pos) ? new THREE.Matrix4().makeTranslation(pos.x, 0.1, pos.y) : null),
  };
  return { s, positions, ground, hasDecor };
}

describe('donde vive cada cosa en el tablero', () => {
  it('cada mota sale de las casillas cuya pieza la lleva', () => {
    const { s, positions } = swampOfWater();
    expect(tilesByMote(s, positions)).toEqual(new Map([[FIREFLIES, positions]]));
    s.theme = 'Desert';
    for (const pos of positions) s.map[pos.x]![pos.y] = 'Sand';
    expect(tilesByMote(s, positions)).toEqual(
      new Map([
        [SAND_DUST, positions],
        [DUST_DEVILS, positions],
      ]),
    );
  });

  it('las ranas se sientan en el nenufar de las casillas con decorado que les tocan, siempre en el mismo sitio', () => {
    const { s, positions, ground, hasDecor } = swampOfWater();
    // Las de siempre: la primera clase de sitio de una pieza decide con las sales 8 (si lleva) y 9 (hacia donde mira).
    const expected = positions
      .filter((pos) => hasDecor(pos) && tileNoise(pos, 8) < 0.3)
      .map((pos) => ({ pos, at: new THREE.Vector3(pos.x, 0.1 + 1 / 32, pos.y), heading: tileNoise(pos, 9) * Math.PI * 2, drop: 0 }));
    const spots = spotsByCritter(s, ground);
    expect([...spots.keys()]).toEqual([FROG]);
    expect(spots.get(FROG)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(positions.filter(hasDecor).length);
  });
});

describe('los pajaros del bosque', () => {
  const life = FOREST_BIRDS.life[0];
  const goal = new THREE.Vector3(5, 0.4, 6.5);
  const birdAt = (seed: number, age: number): Flier => ({ ...moteAt(seed, age, life), goal });
  const flownTo = (seed: number, age: number) => FOREST_BIRDS.flight(birdAt(seed, age), new THREE.Vector3());

  it.each(SEEDS)('salen de su copa, vuelan bajo en arco y acaban en la otra (semilla %s)', (seed) => {
    expect(flownTo(seed, 0).distanceTo(birdAt(seed, 0).home)).toBeCloseTo(0);
    expect(flownTo(seed, life).distanceTo(goal)).toBeCloseTo(0);
    const heights = Array.from({ length: 41 }, (_, step) => flownTo(seed, (life * step) / 40).y - goal.y);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...heights)).toBeLessThan(0.5);
  });

  /** Lo que nace de unas casillas de bosque, cerca de la primera (a menos de `radius`), hasta que no nace nada mas. */
  function bornFrom(tiles: readonly Pos[], radius = 2): Flier[] {
    const plan = { ...FOREST_BIRDS, count: 50, birthRate: () => 1000 };
    const births = new Births(plan, tiles, (pos) => new THREE.Vector3(pos.x, 0, pos.y), seededRng(2013));
    births.tick(1, new THREE.Vector3(tiles[0]!.x, 0, tiles[0]!.y), radius);
    return Array.from({ length: 50 }, () => births.next()).filter((bird): bird is Flier => bird !== null);
  }
  const takeOffOf = (bird: Flier): Pos => ({ x: Math.round(bird.home.x), y: Math.round(bird.home.z) });

  it('cada uno acaba en otra casilla de bosque a la distancia de su clase, a la altura a la que salio', () => {
    const woods = Array.from({ length: 6 }, (_, x) => ({ x, y: 0 }));
    const [nearest, farthest] = FOREST_BIRDS.landing!.distance;
    const birds = bornFrom(woods);
    expect(birds.length).toBeGreaterThan(0);
    for (const bird of birds) {
      const landing = woods.find((pos) => Math.abs(pos.x - bird.goal!.x) <= 0.5 && Math.abs(pos.y - bird.goal!.z) <= 0.5)!;
      const takeOff = takeOffOf(bird);
      expect(landing).toBeDefined();
      expect(Math.hypot(landing.x - takeOff.x, landing.y - takeOff.y)).toBeGreaterThanOrEqual(nearest);
      expect(Math.hypot(landing.x - takeOff.x, landing.y - takeOff.y)).toBeLessThanOrEqual(farthest);
      expect(bird.goal!.y).toBeCloseTo(bird.home.y);
    }
  });

  it('en un bosque de una casilla no sale ninguno: no tienen otra copa a la que ir', () => {
    expect(bornFrom([{ x: 3, y: 3 }])).toEqual([]);
  });

  it('de un arbol suelto no salen, aunque cerca haya bosque mas lejos de lo que vuelan', () => {
    const lone = { x: 0, y: 0 };
    const grove = [
      { x: 6, y: 0 },
      { x: 8, y: 0 },
    ];
    const birds = bornFrom([lone, ...grove], 10);
    expect(birds.length).toBeGreaterThan(0);
    expect(birds.filter((bird) => takeOffOf(bird).x === lone.x)).toEqual([]);
  });
});

describe('como se mueven los animales en su sitio', () => {
  /** Sus posturas a lo largo del movimiento (copias: `poseAt` escribe siempre en la misma). */
  const posesOf = (move: CritterMove, drop = 0): CritterPose[] =>
    Array.from({ length: 241 }, (_, step) => ({ ...poseAt(move, step / 240, drop) }));
  /** Cuantas veces sube y vuelve a bajar. */
  const bumps = (values: number[]) =>
    values.filter((value, step) => step > 0 && value > values[step - 1]! && value >= (values[step + 1] ?? 0)).length;
  /** Acaba como empezo: en su sitio, derecho y mirando a donde miraba (una vuelta entera cuenta como ninguna). */
  const expectBackHome = (pose: CritterPose) => {
    expect(pose.lift).toBeCloseTo(0);
    expect(pose.forward).toBeCloseTo(0);
    expect(pose.pitch).toBeCloseTo(0);
    expect(pose.roll).toBeCloseTo(0);
    expect(Math.cos(pose.yaw)).toBeCloseTo(1);
  };

  it('la ardilla da sus saltitos seguidos y acaba en el suelo', () => {
    const lifts = posesOf(SQUIRREL.move).map((pose) => pose.lift);
    expect(bumps(lifts)).toBe(3);
    expect(Math.min(...lifts)).toBeGreaterThanOrEqual(0);
    expectBackHome(posesOf(SQUIRREL.move).at(-1)!);
  });

  it('el ciervo asoma sin saltar y vuelve a su sitio', () => {
    const poses = posesOf(DEER.move);
    expect(Math.max(...poses.map((pose) => pose.forward))).toBeGreaterThan(0.05);
    expect(poses.every((pose) => pose.lift === 0)).toBe(true);
    expectBackHome(poses.at(-1)!);
  });

  it('el pingüino anda como un pato: se balancea de un lado a otro y vuelve a su sitio', () => {
    const poses = posesOf(PENGUIN.move);
    const rolls = poses.map((pose) => pose.roll);
    expect(Math.min(...rolls)).toBeLessThan(-0.2);
    expect(Math.max(...rolls)).toBeGreaterThan(0.2);
    expect(poses.every((pose) => pose.lift >= 0 && Math.abs(pose.forward) < 0.1)).toBe(true);
    expectBackHome(poses.at(-1)!);
  });

  // El agua de la orilla, un dieciseisavo por debajo del hielo o, ademas, un escalon (0.3).
  it.each([1 / 16, 0.3 + 1 / 16])(
    'el pingüino se tira de barriga al agua (%s mas abajo) y vuelve a su sitio mirando otra vez al agua',
    (drop) => {
      const poses = posesOf(PENGUIN.sometimes!.move, drop);
      // Tumbado de barriga (la cabeza por delante), mas alla del borde de su casilla (a 0.2 de su sitio).
      expect(poses.some((pose) => pose.pitch > 1.5 && pose.forward > 0.2)).toBe(true);
      // Se hunde bajo el agua, y solo donde hay agua: en su casilla, nunca por debajo del hielo.
      expect(Math.min(...poses.map((pose) => pose.lift))).toBeLessThan(-drop - 0.2);
      expect(poses.every((pose) => pose.lift >= -1e-9 || pose.forward > 0.2)).toBe(true);
      expectBackHome(poses.at(-1)!);
      expect(PENGUIN.sometimes!.share).toBeLessThan(0.5);
    },
  );

  it('la foca levanta la cabeza y mira a los lados sin meter la cola en el hielo, y la vuelve a bajar', () => {
    const poses = posesOf(SEAL.move);
    expect(Math.min(...poses.map((pose) => pose.pitch))).toBeLessThan(-0.2);
    expect(poses.every((pose) => pose.pitch <= 0 && pose.lift >= 0)).toBe(true);
    expect(new Set(poses.map((pose) => Math.sign(Math.round(pose.yaw * 100))))).toEqual(new Set([-1, 0, 1]));
    expectBackHome(poses.at(-1)!);
  });
});

/** Un bosque con una pradera a la derecha (desde `meadowFrom` en x), con los arboles sin girar. */
function forestWithMeadow(meadowFrom: number) {
  const s = blankState();
  s.theme = 'Forest';
  const positions = [...mapGrid(s).cells()].map((cell) => cell.pos);
  for (const pos of positions) s.map[pos.x]![pos.y] = pos.x < meadowFrom ? 'Woods' : 'Grass';
  const ground = {
    positions,
    groundOf: (pos: Pos) => new THREE.Vector3(pos.x, 0, pos.y),
    heightAt: () => 0,
    decorPlaceOf: (pos: Pos) => (pos.x < meadowFrom ? new THREE.Matrix4().makeTranslation(pos.x, 0, pos.y) : null),
  };
  return { s, positions, ground };
}

describe('lo que vive en el bosque', () => {
  it('las hojas caen y los pajaros salen de los arboles del bosque, y no de los de la llanura', () => {
    const { s, positions } = forestWithMeadow(4);
    const woods = positions.filter((pos) => pos.x < 4);
    expect(tilesByMote(s, positions)).toEqual(new Map([[FALLING_LEAVES, woods]]));
    expect(tilesByTraveller(s, positions)).toEqual(new Map([[FOREST_BIRDS, woods]]));
    s.theme = 'Plains';
    expect(tilesByMote(s, positions).size).toBe(0);
    expect(tilesByTraveller(s, positions).size).toBe(0);
  });

  it('el ciervo solo esta en el borde del bosque que da a la pradera, mirando hacia ella', () => {
    const meadowFrom = 4;
    const { s, ground } = forestWithMeadow(meadowFrom);
    // Su sitio esta hacia +x en el modelo de arboles: solo vale la ultima columna del bosque.
    const deer = spotsByCritter(s, ground).get(DEER) ?? [];
    expect(deer.length).toBeGreaterThan(0);
    expect(deer.every((spot) => spot.pos.x === meadowFrom - 1)).toBe(true);
    // Mirar hacia +x: el modelo, que mira a -z, girado un cuarto de vuelta hacia la derecha.
    expect(deer.every((spot) => spot.heading === -Math.PI / 2)).toBe(true);
  });

  it('las ardillas estan en lo alto de algunos arboles, mirando a cualquier lado', () => {
    const { s, ground, positions } = forestWithMeadow(8);
    const squirrels = spotsByCritter(s, ground).get(SQUIRREL) ?? [];
    expect(squirrels.length).toBeGreaterThan(0);
    expect(squirrels.length).toBeLessThan(positions.filter((pos) => pos.x < 8).length / 2);
    expect(squirrels.every((spot) => spot.at.y > 0.3)).toBe(true);
    expect(new Set(squirrels.map((spot) => spot.heading)).size).toBeGreaterThan(1);
  });
});

/** Lo que nace de unas casillas cerca de la primera (a menos de `radius`) con un plan, hasta que no nace nada mas. */
function bornWith(plan: BirthPlan, tiles: readonly Pos[], radius: number): Flier[] {
  const births = new Births({ ...plan, birthRate: () => 1000 }, tiles, (pos) => new THREE.Vector3(pos.x, 0, pos.y), seededRng(2013));
  births.tick(1, new THREE.Vector3(tiles[0]!.x, 0, tiles[0]!.y), radius);
  return Array.from({ length: plan.count }, () => births.next()).filter((flier): flier is Flier => flier !== null);
}
const tileUnder = (point: THREE.Vector3): Pos => ({ x: Math.round(point.x), y: Math.round(point.z) });

describe('lo que vive en el desierto', () => {
  it('los granos de un remolino nacen juntos: en el mismo sitio y con la misma vida, cada uno con su semilla', () => {
    const grains = bornWith(
      { ...DUST_DEVILS, count: 20, together: 10 },
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      3,
    );
    expect(grains).toHaveLength(20);
    for (const devil of [grains.slice(0, 10), grains.slice(10)]) {
      expect(devil.every((grain) => grain.home.equals(devil[0]!.home) && grain.life === devil[0]!.life)).toBe(true);
      expect(new Set(devil.map((grain) => grain.seed)).size).toBe(10);
    }
  });

  it.each(SEEDS)('el remolino sube girando en embudo, sin irse lejos de su eje (semilla %s)', (seed) => {
    const lifetime = Array.from({ length: 50 }, (_, step) => moteAt(seed, step / 10, 5));
    for (const grain of lifetime) {
      const at = DUST_DEVILS.flight(grain, new THREE.Vector3());
      const axis = grain.home.clone().addScaledVector(WIND_DIRECTION, grain.age * 0.12);
      expect(Math.hypot(at.x - axis.x, at.z - axis.z)).toBeLessThan(0.35);
      expect(at.y - grain.home.y).toBeGreaterThanOrEqual(0);
      expect(at.y - grain.home.y).toBeLessThan(1);
    }
  });

  it.each(SEEDS)('la bola rueda de donde nace a donde va, por encima del suelo y a botes (semilla %s)', (seed) => {
    const life = TUMBLEWEEDS.life[0];
    const ballAt = (age: number) =>
      TUMBLEWEEDS.flight({ ...moteAt(seed, age, life), goal: new THREE.Vector3(6, 0.4, 4.5) }, new THREE.Vector3());
    expect(ballAt(0).x).toBeCloseTo(3);
    expect(ballAt(life).x).toBeCloseTo(6);
    expect(ballAt(life).z).toBeCloseTo(4.5);
    // Va por el suelo: su altura es sobre el, desde su radio (no lo atraviesa) y dando botes.
    const heights = Array.from({ length: 41 }, (_, step) => ballAt((life * step) / 40).y);
    expect(Math.min(...heights)).toBeGreaterThan(0.05);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.02);
  });

  it('las bolas van con el viento y no cruzan lo que no es arena (una meseta)', () => {
    const mesa = 5;
    const sand = Array.from({ length: 13 * 3 }, (_, index) => ({ x: index % 13, y: Math.floor(index / 13) })).filter(
      (pos) => pos.x !== mesa,
    );
    const balls = bornWith({ ...TUMBLEWEEDS, count: 200 }, sand, 20);
    expect(balls.length).toBeGreaterThan(0);
    const [nearest, farthest] = TUMBLEWEEDS.landing!.distance;
    for (const ball of balls) {
      const from = tileUnder(ball.home);
      const to = tileUnder(ball.goal!);
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      expect(distance).toBeGreaterThanOrEqual(nearest);
      expect(distance).toBeLessThanOrEqual(farthest);
      expect(((to.x - from.x) * WIND_DIRECTION.x + (to.y - from.y) * WIND_DIRECTION.z) / distance).toBeGreaterThan(Math.cos(0.35) - 1e-9);
      expect(from.x < mesa).toBe(to.x < mesa);
    }
  });

  it.each(SEEDS)('el buitre llega de lejos, da vueltas en lo alto sobre donde nacio y se va (semilla %s)', (seed) => {
    const life = 20;
    const vultureAt = (age: number) => VULTURES.flight(moteAt(seed, age, life), new THREE.Vector3());
    const home = moteAt(seed, 0, life).home;
    const awayFromHome = (age: number) => Math.hypot(vultureAt(age).x - home.x, vultureAt(age).z - home.z);
    expect(awayFromHome(0)).toBeGreaterThan(5);
    expect(awayFromHome(life)).toBeGreaterThan(5);
    for (const age of [6, 8, 10, 12, 14]) {
      expect(awayFromHome(age)).toBeGreaterThanOrEqual(0.9);
      expect(awayFromHome(age)).toBeLessThanOrEqual(1.4);
      expect(Math.abs(vultureAt(age).y - home.y)).toBeLessThan(0.1);
    }
  });
});

/** Un desierto: arena con algunas losas (las casillas pares en y), una columna de meseta y otra de cactus. */
function desertWithMesa() {
  const s = blankState();
  s.theme = 'Desert';
  const positions = [...mapGrid(s).cells()].map((cell) => cell.pos);
  const terrainOf = (pos: Pos) => (pos.x === 3 ? 'SandMountain' : pos.x === 6 ? 'Cactus' : 'Sand');
  for (const pos of positions) s.map[pos.x]![pos.y] = terrainOf(pos);
  const hasDecor = (pos: Pos) => terrainOf(pos) === 'Cactus' || (terrainOf(pos) === 'Sand' && pos.y % 2 === 0);
  const ground = {
    positions,
    groundOf: (pos: Pos) => new THREE.Vector3(pos.x, 0, pos.y),
    heightAt: () => 0,
    decorPlaceOf: (pos: Pos) => (hasDecor(pos) ? new THREE.Matrix4().makeTranslation(pos.x, 0, pos.y) : null),
  };
  return { s, positions, ground, terrainOf, hasDecor };
}

describe('donde vive cada cosa en el desierto', () => {
  it('las bolas ruedan solo por la arena; los buitres vuelan sobre todo el desierto', () => {
    const { s, positions, terrainOf } = desertWithMesa();
    expect(tilesByTraveller(s, positions)).toEqual(
      new Map([
        [TUMBLEWEEDS, positions.filter((pos) => terrainOf(pos) === 'Sand')],
        [VULTURES, positions],
      ]),
    );
  });

  it('las lagartijas toman el sol en las losas de la arena y al pie de los cactus, y no en la meseta', () => {
    const { s, ground, terrainOf, hasDecor } = desertWithMesa();
    const lizards = spotsByCritter(s, ground).get(LIZARD) ?? [];
    expect(lizards.every((spot) => hasDecor(spot.pos))).toBe(true);
    expect(lizards.some((spot) => terrainOf(spot.pos) === 'Sand')).toBe(true);
    expect(lizards.some((spot) => terrainOf(spot.pos) === 'Cactus')).toBe(true);
    // En la losa, encima; junto al cactus, en la arena.
    expect(lizards.every((spot) => spot.at.y === (terrainOf(spot.pos) === 'Sand' ? 2 / 16 : 0))).toBe(true);
  });
});

/**
 * Un mapa nevado: nieve a la izquierda, una columna de hielo en la orilla (`shore`) y el agua a la
 * derecha; ademas, un poco de hielo suelto en la nieve (en `x = 0`), sin agua al lado.
 */
function snowyShore() {
  const s = blankState();
  s.theme = 'Snowy';
  const shore = 3;
  const positions = [...mapGrid(s).cells()].map((cell) => cell.pos);
  const terrainOf = (pos: Pos) => (pos.x > shore ? 'Water' : pos.x === shore || (pos.x === 0 && pos.y % 2 === 0) ? 'Ice' : 'Snow');
  for (const pos of positions) s.map[pos.x]![pos.y] = terrainOf(pos);
  const ground = {
    positions,
    groundOf: (pos: Pos) => new THREE.Vector3(pos.x, terrainOf(pos) === 'Water' ? 0.0625 : 0.125, pos.y),
    heightAt: () => 0,
    decorPlaceOf: () => null,
  };
  return { s, positions, ground, terrainOf, shore };
}

describe('lo que vive en la nieve', () => {
  it('los copos brillan sobre la nieve y el hielo, y no sobre el agua', () => {
    const { s, positions, terrainOf } = snowyShore();
    expect(tilesByMote(s, positions)).toEqual(new Map([[SNOW_GLITTER, positions.filter((pos) => terrainOf(pos) !== 'Water')]]));
  });

  it('los pingüinos y las focas estan en el suelo del hielo que da al agua, a un lado del centro y mirando al agua', () => {
    const { s, ground, shore } = snowyShore();
    const spots = spotsByCritter(s, ground);
    const penguins = spots.get(PENGUIN) ?? [];
    expect(penguins.length).toBeGreaterThan(0);
    for (const spot of [...penguins, ...(spots.get(SEAL) ?? [])]) {
      expect(spot.pos.x).toBe(shore);
      // Mirar hacia +x: el modelo, que mira a -z, girado un cuarto de vuelta hacia la derecha.
      expect(spot.heading).toBe(-Math.PI / 2);
      // Del lado del agua, lejos del centro (donde va la unidad), y en el hielo.
      expect(spot.at.x - spot.pos.x).toBeGreaterThan(0.2);
      expect(spot.at.y).toBeCloseTo(0.125);
      // Al agua de delante, para tirarse: lo que esta mas abajo.
      expect(spot.drop).toBeCloseTo(0.0625);
    }
  });

  it('los de una casilla van juntos, del mismo lado, sin pisarse', () => {
    const { s, ground } = snowyShore();
    const spots = [...spotsByCritter(s, ground).values()].flat();
    const byTile = groupBy(spots, (spot) => `${spot.pos.x},${spot.pos.y}`);
    const crowded = [...byTile.values()].filter((tile) => tile.length > 1);
    expect(crowded.length).toBeGreaterThan(0);
    for (const tile of crowded) {
      const gaps = tile.flatMap((spot, index) => tile.slice(index + 1).map((other) => spot.at.distanceTo(other.at)));
      expect(Math.min(...gaps)).toBeGreaterThan(0.1);
    }
  });
});
