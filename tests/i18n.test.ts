import { describe, expect, it } from 'vitest';
import { TEXTS, TEXTS_BY_FEATURE } from '../src/i18n';

describe('textos por tema', () => {
  it('ninguna clave se repite entre temas (si no, un tema taparia el texto de otro en t())', () => {
    for (const byFeature of Object.values(TEXTS_BY_FEATURE)) {
      const keys = Object.values(byFeature).flatMap((feature) => Object.keys(feature));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('los dos idiomas tienen los mismos temas y las mismas claves', () => {
    expect(Object.keys(TEXTS_BY_FEATURE.en)).toEqual(Object.keys(TEXTS_BY_FEATURE.es));
    expect(Object.keys(TEXTS.en).sort()).toEqual(Object.keys(TEXTS.es).sort());
  });

  it('ningun texto esta vacio', () => {
    for (const texts of Object.values(TEXTS)) for (const text of Object.values(texts)) expect(text.trim()).not.toBe('');
  });
});
