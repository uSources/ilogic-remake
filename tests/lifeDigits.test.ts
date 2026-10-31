import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glyphRows, outlined, scaled } from '../src/ui/lifeDigits';

const font = readFileSync('tools/art/font/ilogic.txt', 'utf8');

describe('cifras de vida (letra Ilogic)', () => {
  it('estan las cifras del 1 al 9, de 7 filas', () => {
    for (let n = 1; n <= 9; n++) {
      const rows = glyphRows(font, String(n));
      expect(rows, String(n)).not.toBeNull();
      expect(rows!.length, String(n)).toBe(7);
    }
  });

  it('el 5 y el 8 son distintos (en la letra de antes se confundian)', () => {
    expect(glyphRows(font, '5')).not.toEqual(glyphRows(font, '8'));
    expect(glyphRows(font, '5')![1]).toBe('#....');
  });

  it('un glifo que no esta da null', () => {
    expect(glyphRows(font, '☃')).toBeNull();
  });

  it('agrandar: cada pixel pasa a ser 2×2', () => {
    expect(scaled(['#.', '.#'], 2)).toEqual(['##..', '##..', '..##', '..##']);
  });

  it('borde oscuro de un pixel alrededor de la cifra, tambien en diagonal', () => {
    expect(outlined(['#'])).toEqual(['ooo', 'o#o', 'ooo']);
    expect(outlined(['#.', '.#'])).toEqual(['ooo ', 'o#oo', 'oo#o', ' ooo']);
  });
});
