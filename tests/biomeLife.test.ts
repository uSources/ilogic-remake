import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIREFLIES, SAND_DUST } from '../src/view3d/engine/life/kinds';
import type { Mote, MoteKind } from '../src/view3d/engine/life/motes';
import { WIND_DIRECTION } from '../src/view3d/engine/core/space';

/** Lo que vive en los biomas (engine/life/kinds.ts): que las motas se vean bien, sean de la clase que sean. */

const KINDS: Record<string, MoteKind> = { SAND_DUST, FIREFLIES };
const SEEDS = [0.1, 1.7, 250, 999];

const moteAt = (seed: number, age: number, life: number): Mote => ({ home: new THREE.Vector3(3, 0.4, 5), age, life, seed });

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

  it('el polvo sale en rafagas: a ratos nace y a ratos no', () => {
    const rates = Array.from({ length: 70 }, (_, tenth) => SAND_DUST.birthRate(tenth / 10));
    expect(rates.some((rate) => rate > 0)).toBe(true);
    expect(rates.some((rate) => rate === 0)).toBe(true);
  });
});
