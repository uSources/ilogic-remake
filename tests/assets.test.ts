import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATLAS_PAGES, LOOSE_IMAGES } from '../src/atlasPages';
import { IMAGE_KEYS } from '../src/assetList';
import { BUILDING_NAMES, HQ, UNIT_ART, UNIT_NAMES } from '@core/data';
import { requiredArtKeys } from '../src/ui/terrainArt';

/** Comprueba que los graficos compilados (npm run assets) estan completos. */
const frames = new Map<string, { w: number; h: number }>();
for (let i = 0; i < ATLAS_PAGES; i++) {
  const json = JSON.parse(readFileSync(`public/assets/atlas/atlas-${i}.json`, 'utf8'));
  for (const [k, f] of Object.entries<{ frame: { w: number; h: number } }>(json.frames)) frames.set(k, f.frame);
}

describe('graficos compilados', () => {
  it('cada imagen esta en el atlas o se carga suelta', () => {
    const missing = IMAGE_KEYS.filter((k) => !frames.has(k) && !LOOSE_IMAGES.includes(k));
    expect(missing).toEqual([]);
    for (const k of LOOSE_IMAGES) expect(existsSync(`public/assets/img/${k}.png`)).toBe(true);
  });

  it('el terreno nuevo tiene todas sus laminas', () => {
    expect(requiredArtKeys().filter((k) => !frames.has(k))).toEqual([]);
  });

  it('cada unidad y edificio tiene sus versiones de bando', () => {
    const need = [
      // Las que tienen "art" en units.json se pintan con el dibujo de otra mientras no tengan el suyo.
      ...UNIT_ART.flatMap((n) => ['b', 'i', 'r'].map((s) => `u/${s}_${n}`)),
      ...BUILDING_NAMES.flatMap((n, i) => (i === HQ ? ['b', 'r'] : ['b', 'r', 'n']).map((s) => `flat/bld_${s}_${n}`)),
    ];
    expect(need.filter((k) => !frames.has(k))).toEqual([]);
  });

  it('avisa de las unidades que aun usan el dibujo de otra', () => {
    const borrowed = UNIT_NAMES.filter((n, i) => UNIT_ART[i] !== n);
    if (borrowed.length) console.warn(`Unidades sin dibujo propio (usan "art"): ${borrowed.join(', ')}`);
    expect(
      borrowed.every((n) => !frames.has(`u/b_${n}`)),
      'tiene dibujo propio: quitar "art" de units.json',
    ).toBe(true);
  });

  it('las unidades caben en la casilla y los edificios no pasan de 32x48', () => {
    const big = [...frames]
      .filter(([k, f]) => (k.startsWith('u/') && (f.w > 32 || f.h > 32)) || (k.startsWith('flat/bld_') && (f.w > 32 || f.h > 48)))
      .map(([k]) => k);
    expect(big).toEqual([]);
  });
});
