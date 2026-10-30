import { afterEach, describe, expect, it } from 'vitest';
import { aiTurn } from '../src/core/ai';
import { HQ, MAP_W, DEFAULT_RULES, UNIT, setMapSize, useRules } from '../src/core/data';
import { grid, seededRng } from '../src/core/geom';
import { generateGame } from '../src/core/mapgen';
import { endReason, groundDistance, newUnit, outcome, score } from '../src/core/rules';
import { deserialize, serialize } from '../src/core/save';
import { codeToSeed, seedToCode } from '../src/setup';
import { blankState } from './helpers';

afterEach(() => {
  setMapSize(32);
  useRules(DEFAULT_RULES);
});

describe('nueva partida: tamaños de mapa', () => {
  it.each([20, 32, 40])('mapas de %i: bases conectadas y edificios en proporcion', (size) => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = generateGame(seededRng(seed), { size });
      expect(s.map.length).toBe(size);
      expect(MAP_W).toBe(size);
      const hq0 = s.buildings.find((b) => b.owner === 0 && b.type === HQ)!;
      const hq1 = s.buildings.find((b) => b.owner === 1 && b.type === HQ)!;
      expect(groundDistance(s, hq0, 0, grid(false))[hq1.x]![hq1.y]).toBeGreaterThan(0);
      const neutral = s.buildings.filter((b) => b.owner === null).length;
      expect(neutral).toBeGreaterThanOrEqual(Math.floor((20 * (size * size)) / 1024));
      for (const b of s.buildings) expect(b.x < size && b.y < size).toBe(true);
    }
  });

  it('el mismo codigo da el mismo mapa; el tema se puede elegir', () => {
    const a = generateGame(seededRng(1234), { size: 20, theme: 4 });
    const b = generateGame(seededRng(1234), { size: 20, theme: 4 });
    expect(serialize(a)).toBe(serialize(b));
    expect(a.theme).toBe(4);
  });

  it('codigos de mapa: ida y vuelta, y codigos no validos', () => {
    for (const seed of [0, 1, 99999, 0xffffffff]) expect(codeToSeed(seedToCode(seed))).toBe(seed);
    expect(codeToSeed('K3F9A2')).toBe(parseInt('k3f9a2', 36));
    expect(codeToSeed('')).toBeNull();
    expect(codeToSeed('ÑÑ')).toBeNull();
    expect(codeToSeed('ZZZZZZZZ')).toBeNull();
  });

  it('una partida guardada en un mapa de 40 se carga con ese tamaño', () => {
    const s = generateGame(seededRng(7), { size: 40 });
    s.setup = { seed: 7, size: 40, theme: null };
    const json = serialize(s);
    setMapSize(32);
    const c = deserialize(json)!;
    expect(c).not.toBeNull();
    expect(MAP_W).toBe(40);
    expect(c.setup).toEqual({ seed: 7, size: 40, theme: null });
    expect(deserialize(JSON.stringify({ ...JSON.parse(json), map: grid(0).slice(0, 25) }))).toBeNull();
  });
});

describe('limite de dias', () => {
  it('al pasarse el ultimo dia gana quien tenga mas puntos', () => {
    useRules({ ...DEFAULT_RULES, dayLimit: 10 });
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 9, y: 9 }, { type: 0, owner: 1, x: 5, y: 5 });
    newUnit(s, 1, 0, 1, 1); // tanque: vale su precio
    s.day = 10;
    expect(outcome(s)).toBe('playing');
    s.day = 11;
    expect(score(s, 0)).toBe(UNIT.cost[1]! + 1000); // tanque entero + su Base
    expect(score(s, 1)).toBe(2000);
    expect(outcome(s)).toBe('won');
    expect(endReason(s)).toBe('days');
  });
});

describe('repetir el turno enemigo', () => {
  it('la IA juega igual desde el mismo estado y la misma semilla', () => {
    const s = generateGame(seededRng(3));
    for (let i = 0; i < 4; i++) for (const _ of aiTurn(s, seededRng(i), 1));
    const before = serialize(s);
    const ev1 = [...aiTurn(s, seededRng(42), 1)];
    const after = serialize(s);
    const copy = deserialize(before)!;
    const ev2 = [...aiTurn(copy, seededRng(42), 1)];
    expect(ev2).toEqual(ev1);
    expect(serialize(copy)).toBe(after);
  });
});
