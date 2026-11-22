import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mapGrid } from '@core/mapGrid';
import type { Pos } from '@core/model';
import { spotsByCritter, tilesByMote, tilesByTraveller } from '../src/view3d/engine/life/biomeLife';
import { Births, type Flier } from '../src/view3d/engine/life/births';
import { forwardAt, liftAt } from '../src/view3d/engine/life/critters';
import { DEER, FALLING_LEAVES, FIREFLIES, FOREST_BIRDS, FROG, SAND_DUST, SQUIRREL } from '../src/view3d/engine/life/kinds';
import type { MoteKind } from '../src/view3d/engine/life/motes';
import { WIND_DIRECTION } from '../src/view3d/engine/core/space';
import { tileNoise } from '../src/view3d/engine/terrain/placed';
import { blankState } from './helpers';

/** Lo que vive en los biomas (engine/life/kinds.ts): que las motas se vean bien, sean de la clase que sean. */

const KINDS: Record<string, MoteKind> = { SAND_DUST, FIREFLIES, FALLING_LEAVES };
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
    expect(tilesByMote(s, positions)).toEqual(new Map([[SAND_DUST, positions]]));
  });

  it('las ranas se sientan en el nenufar de las casillas con decorado que les tocan, siempre en el mismo sitio', () => {
    const { s, positions, ground, hasDecor } = swampOfWater();
    // Las de siempre: la primera clase de sitio de una pieza decide con las sales 8 (si lleva) y 9 (hacia donde mira).
    const expected = positions
      .filter((pos) => hasDecor(pos) && tileNoise(pos, 8) < 0.3)
      .map((pos) => ({ pos, at: new THREE.Vector3(pos.x, 0.1 + 1 / 32, pos.y), heading: tileNoise(pos, 9) * Math.PI * 2 }));
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

  /** Lo que nace de unas casillas de bosque, cerca de la primera, hasta que no nace nada mas. */
  function bornFrom(tiles: readonly Pos[]): Flier[] {
    const births = new Births({ ...FOREST_BIRDS, count: 50, birthRate: () => 1000 }, tiles, (pos) => new THREE.Vector3(pos.x, 0, pos.y));
    births.tick(1, new THREE.Vector3(tiles[0]!.x, 0, tiles[0]!.y), 2);
    return Array.from({ length: 50 }, () => births.next()).filter((bird): bird is Flier => bird !== null);
  }

  it('cada uno acaba en otra casilla de bosque a la distancia de su clase, a la altura a la que salio', () => {
    const woods = Array.from({ length: 6 }, (_, x) => ({ x, y: 0 }));
    const [nearest, farthest] = FOREST_BIRDS.landing!;
    const birds = bornFrom(woods);
    expect(birds.length).toBeGreaterThan(0);
    for (const bird of birds) {
      const landing = woods.find((pos) => Math.abs(pos.x - bird.goal!.x) <= 0.5 && Math.abs(pos.y - bird.goal!.z) <= 0.5)!;
      const takeOff = { x: Math.round(bird.home.x), y: Math.round(bird.home.z) };
      expect(landing).toBeDefined();
      expect(Math.hypot(landing.x - takeOff.x, landing.y - takeOff.y)).toBeGreaterThanOrEqual(nearest);
      expect(Math.hypot(landing.x - takeOff.x, landing.y - takeOff.y)).toBeLessThanOrEqual(farthest);
      expect(bird.goal!.y).toBeCloseTo(bird.home.y);
    }
  });

  it('en un bosque de una casilla no sale ninguno: no tienen otra copa a la que ir', () => {
    expect(bornFrom([{ x: 3, y: 3 }])).toEqual([]);
  });
});

describe('como se mueven los animales en su sitio', () => {
  const along = (value: (progress: number) => number) => Array.from({ length: 121 }, (_, step) => value(step / 120));
  /** Cuantas veces sube y vuelve a bajar. */
  const bumps = (values: number[]) =>
    values.filter((value, step) => step > 0 && value > values[step - 1]! && value >= (values[step + 1] ?? 0)).length;

  it('la ardilla da sus saltitos seguidos y acaba en el suelo', () => {
    const lifts = along((progress) => liftAt(SQUIRREL.move, progress));
    expect(bumps(lifts)).toBe(SQUIRREL.move.hops);
    expect(lifts.at(-1)).toBeCloseTo(0);
    expect(Math.max(...lifts)).toBeCloseTo(SQUIRREL.move.height);
  });

  it('el ciervo asoma sin saltar y vuelve a su sitio', () => {
    const forward = along((progress) => forwardAt(DEER.move, progress));
    expect(Math.max(...forward)).toBeCloseTo(DEER.move.reach!);
    expect(forward.at(-1)).toBeCloseTo(0);
    expect(along((progress) => liftAt(DEER.move, progress)).every((lift) => lift === 0)).toBe(true);
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
