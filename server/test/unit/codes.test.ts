import { describe, expect, it } from 'vitest';
import { isRoomCode, newRoomCode, newToken, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, sameToken } from '../../src/codes';

describe('codigos de sala y fichas', () => {
  it('un codigo tiene 6 letras del alfabeto sin 0, O, 1, I ni L, y cada uno es distinto', () => {
    const codes = Array.from({ length: 200 }, newRoomCode);
    for (const code of codes) {
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[0O1IL]/);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
  });

  it('solo es un codigo lo que tiene esa forma', () => {
    expect(isRoomCode('ABCDEF')).toBe(true);
    expect(isRoomCode('abcdef')).toBe(false);
    expect(isRoomCode('ABCDE')).toBe(false);
    expect(isRoomCode('ABCD0F')).toBe(false);
    expect(isRoomCode(42)).toBe(false);
  });

  it('una ficha de 24 bytes son 32 letras de base64 para URL, distintas cada vez', () => {
    const tokens = Array.from({ length: 50 }, () => newToken(24));
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('comparar fichas: iguales solo si son la misma entera', () => {
    expect(sameToken('abc', 'abc')).toBe(true);
    expect(sameToken('abc', 'abd')).toBe(false);
    expect(sameToken('abc', 'ab')).toBe(false);
    expect(sameToken('', '')).toBe(true);
    expect(sameToken('', 'a')).toBe(false);
  });
});
