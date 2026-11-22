import { defaultContent } from '@core/content/default';
import { describe, expect, it } from 'vitest';
import { undeclaredUniforms } from '../src/view3d/engine/terrain/surface';
import { surroundingFor } from '../src/view3d/engine/terrain/surroundings';

/** El suelo de alrededor de cada tema (surroundings.ts): su GLSL solo usa colores que trae. */

describe('el alrededor de cada tema', () => {
  it('el GLSL de cada suelo solo usa los uniforms comunes y sus colores', () => {
    const themes = [...defaultContent().themes.list.map((theme) => theme.id), 'TemaQueNoExiste'];
    const undeclared = themes.map((theme) => [theme, undeclaredUniforms(surroundingFor(theme).surface)]);
    expect(undeclared).toEqual(themes.map((theme) => [theme, []]));
  });

  it('un color mal escrito se ve antes de llegar al navegador', () => {
    const look = { name: 'prueba', colors: { snow: 0xffffff }, paint: 'diffuseColor.rgb = uSnwo * uTime;' };
    expect(undeclaredUniforms(look)).toEqual(['uSnwo']);
  });
});
