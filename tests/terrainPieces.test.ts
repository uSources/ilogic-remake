import { existsSync } from 'node:fs';
import { defaultContent } from '@core/content/default';
import { describe, expect, it } from 'vitest';
import { FIREFLIES, FROG } from '../src/view3d/engine/life/kinds';
import { bankOf, pieceAt, TERRAIN_MODEL_FILES, TERRAIN_PIECES, THEME_PIECES } from '../src/view3d/engine/terrain/pieces';
import { PAINTS } from '../tools/art/ashfox/models/terrain.mjs';
import { blankState } from './helpers';

/** Lo que lleva cada terreno en 3D (y lo que cambia cada tema, como el pantano) nombra cosas que existen. */

/** La pintura del lateral de las casillas de tierra de cada tema (en el desierto, la arena es relieve, no un modelo). */
const SIDE_PAINT_BY_THEME: Readonly<Record<string, string>> = { Plains: 'earth', Forest: 'earth', Snowy: 'ice_rock', Swamp: 'mud' };
const hexOf = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

describe('las piezas del terreno 3D', () => {
  it('cada modelo que se carga tiene su GLB exportado', () => {
    expect(TERRAIN_MODEL_FILES.filter((file) => !existsSync(`public/assets/models/${file}.glb`))).toEqual([]);
  });

  it('los temas y los terrenos que nombran existen en el contenido', () => {
    const content = defaultContent();
    const themes = content.themes.list.map((theme) => theme.id);
    const terrain = content.terrain.list.map((type) => type.id);
    const named = [TERRAIN_PIECES, ...Object.values(THEME_PIECES)].flatMap((pieces) => Object.keys(pieces));
    expect(Object.keys(THEME_PIECES).filter((theme) => !themes.includes(theme))).toEqual([]);
    expect(named.filter((id) => !terrain.includes(id))).toEqual([]);
  });

  it('la tierra del agua en el borde del mapa es la del lateral de las casillas de su tema', () => {
    const s = blankState();
    const banks = Object.keys(SIDE_PAINT_BY_THEME).map((theme) => {
      s.theme = theme;
      const bank = bankOf(s);
      return [bank.shade, bank.middle, bank.light].map(hexOf);
    });
    expect(banks).toEqual(Object.values(SIDE_PAINT_BY_THEME).map((paint) => PAINTS[paint]?.ramp));
  });

  it('el agua del pantano es turbia, con nenufares y ranas; la de los demas temas, la de siempre', () => {
    const s = blankState();
    const water = { x: 2, y: 3 };
    s.map[water.x]![water.y] = 'Water';
    expect(pieceAt(s, water).tile).toBe('tile_water');
    s.theme = 'Swamp';
    expect(pieceAt(s, water)).toMatchObject({ tile: 'tile_swamp_water', decor: ['lilies_0', 'lilies_1', 'lilies_2'], motes: [FIREFLIES] });
    expect(pieceAt(s, water).critters).toEqual([expect.objectContaining({ kind: FROG, share: expect.any(Number) })]);
  });
});
