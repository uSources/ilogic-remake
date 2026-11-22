import { existsSync } from 'node:fs';
import { defaultContent } from '@core/content/default';
import { describe, expect, it } from 'vitest';
import { pieceAt, TERRAIN_MODEL_FILES, TERRAIN_PIECES, THEME_PIECES } from '../src/view3d/engine/terrain/pieces';
import { blankState } from './helpers';

/** Lo que lleva cada terreno en 3D (y lo que cambia cada tema, como el pantano) nombra cosas que existen. */

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

  it('el agua del pantano es turbia, con nenufares y ranas; la de los demas temas, la de siempre', () => {
    const s = blankState();
    const water = { x: 2, y: 3 };
    s.map[water.x]![water.y] = 'Water';
    expect(pieceAt(s, water).tile).toBe('tile_water');
    s.theme = 'Swamp';
    expect(pieceAt(s, water)).toMatchObject({ tile: 'tile_swamp_water', decor: ['lilies_0', 'lilies_1', 'lilies_2'], fireflies: true });
    expect(pieceAt(s, water).frogs?.share).toBeGreaterThan(0);
  });
});
