import { hqKey } from './helpers';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATLAS_PAGES, LOOSE_IMAGES } from '../src/atlasPages';
import { IMAGE_KEYS } from '../src/assetList';
import { defaultContent } from '@core/content/default';
import { requiredArtKeys } from '../src/ui/terrainArt';

const UNIT_NAMES = defaultContent().units.list.map((unitType) => unitType.id);
const BUILDING_NAMES = defaultContent().buildings.list.map((buildingType) => buildingType.id);
const HQ = hqKey();
const UNIT_ART = defaultContent().units.list.map((unitType) => unitType.art);

/** Comprueba que los graficos compilados (npm run assets) estan completos. */
const frames = new Map<string, { w: number; h: number }>();
for (let i = 0; i < ATLAS_PAGES; i++) {
  const json = JSON.parse(readFileSync(`public/assets/atlas/atlas-${i}.json`, 'utf8'));
  for (const [key, entry] of Object.entries<{ frame: { w: number; h: number } }>(json.frames)) frames.set(key, entry.frame);
}

describe('graficos compilados', () => {
  it('cada imagen esta en el atlas o se carga suelta', () => {
    const missing = IMAGE_KEYS.filter((key) => !frames.has(key) && !LOOSE_IMAGES.includes(key));
    expect(missing).toEqual([]);
    for (const image of LOOSE_IMAGES) expect(existsSync(`public/assets/img/${image}.png`)).toBe(true);
  });

  it('el terreno nuevo tiene todas sus laminas', () => {
    expect(requiredArtKeys().filter((key) => !frames.has(key))).toEqual([]);
  });

  it('cada unidad y edificio tiene sus versiones de bando', () => {
    const need = [
      // Las que tienen "art" en units.json se pintan con el dibujo de otra mientras no tengan el suyo.
      ...UNIT_ART.flatMap((name) => ['b', 'i', 'r'].map((s) => `u/${s}_${name}`)),
      ...BUILDING_NAMES.flatMap((name, i) => (i === HQ ? ['b', 'r'] : ['b', 'r', 'n']).map((s) => `flat/bld_${s}_${name}`)),
    ];
    expect(need.filter((key) => !frames.has(key))).toEqual([]);
  });

  it('avisa de las unidades que aun usan el dibujo de otra', () => {
    const borrowed = UNIT_NAMES.filter((name, i) => UNIT_ART[i] !== name);
    if (borrowed.length) console.warn(`Unidades sin dibujo propio (usan "art"): ${borrowed.join(', ')}`);
    expect(
      borrowed.every((name) => !frames.has(`u/b_${name}`)),
      'tiene dibujo propio: quitar "art" de units.json',
    ).toBe(true);
  });

  it('las unidades caben en la casilla y los edificios no pasan de 32x48', () => {
    const big = [...frames]
      .filter(
        ([key, frame]) =>
          (key.startsWith('u/') && (frame.w > 32 || frame.h > 32)) || (key.startsWith('flat/bld_') && (frame.w > 32 || frame.h > 48)),
      )
      .map(([key]) => key);
    expect(big).toEqual([]);
  });
});
