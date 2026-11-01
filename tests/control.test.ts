import { beforeEach, describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { DEFAULT_RULES, HQ, MoveType, RULES, useRules } from '@core/data';
import { grid, manhattan, seededRng } from '@core/geom';
import { generateGame, placeControlPoints } from '@core/mapgen';
import { controlRound, endRound, groundDistance, newUnit } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

/** [CAMBIO] Puntos de control: casillas que dan dinero cada ronda a quien las tiene. */
const SOLDIER = 0,
  TANK = 1;

beforeEach(() => useRules(DEFAULT_RULES));

function withPoints(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 });
  s.controlPoints = [
    { x: 10, y: 10, owner: null },
    { x: 5, y: 14, owner: 1 },
  ];
  return s;
}

describe('puntos de control', () => {
  it('al acabar la ronda pasan a ser de quien tiene una unidad encima y siguen suyos al irse', () => {
    const s = withPoints();
    const u = newUnit(s, SOLDIER, 0, 10, 10);
    const before = s.funds[0];
    const r = controlRound(s)!;
    expect(s.controlPoints![0]!.owner).toBe(0);
    expect(r.held).toEqual([1, 1]);
    expect(r.income).toEqual([RULES.controlIncome, RULES.controlIncome]);
    expect(s.funds[0]).toBe(before + RULES.controlIncome);
    u.x = 11;
    controlRound(s);
    expect(s.controlPoints![0]!.owner).toBe(0);
  });

  it('el enemigo se lo quita poniendose encima', () => {
    const s = withPoints();
    newUnit(s, TANK, 0, 5, 14);
    controlRound(s);
    expect(s.controlPoints![1]!.owner).toBe(0);
  });

  it('endRound suma su dinero a los ingresos del informe', () => {
    const s = withPoints();
    newUnit(s, SOLDIER, 0, 10, 10);
    const r = endRound(s);
    expect(r.control?.held).toEqual([1, 1]);
    expect(r.income[0]).toBeGreaterThanOrEqual(RULES.controlIncome);
  });

  it('sin puntos no hay nada en el informe', () => {
    const s = blankState();
    expect(endRound(s).control).toBeUndefined();
  });

  it('los mapas al azar los ponen igual de lejos de las dos salidas y separados entre si', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = generateGame(seededRng(seed * 7919));
      const pts = s.controlPoints ?? [];
      total += pts.length;
      expect(pts.length).toBeLessThanOrEqual(RULES.controlPoints);
      const hq = (team: 0 | 1) => s.buildings.find((b) => b.type === HQ && b.owner === team)!;
      const da = groundDistance(s, hq(0), MoveType.FOOT, grid(false));
      const db = groundDistance(s, hq(1), MoveType.FOOT, grid(false));
      for (const p of pts) {
        expect(p.owner).toBeNull();
        expect(s.buildings.some((b) => b.x === p.x && b.y === p.y)).toBe(false);
        // Casi a la misma distancia de las dos Bases (las salidas estan junto a ellas).
        expect(Math.abs(da[p.x]![p.y]! - db[p.x]![p.y]!)).toBeLessThanOrEqual(8);
      }
      for (const a of pts) for (const b of pts) if (a !== b) expect(manhattan(a, b)).toBeGreaterThanOrEqual(3);
    }
    expect(total).toBeGreaterThan(20 * 2);
  });

  it('con la regla a 0 no se ponen', () => {
    useRules({ controlPoints: 0 });
    const s = blankState();
    placeControlPoints(s, { x: 0, y: 0 }, { x: 19, y: 19 }, seededRng(1));
    expect(s.controlPoints).toBeUndefined();
  });

  it('la IA manda unidades a por los puntos que no son suyos', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 });
    s.controlPoints = [{ x: 14, y: 12, owner: 0 }];
    const t = newUnit(s, TANK, 1, 18, 12);
    const d0 = manhattan(t, s.controlPoints[0]!);
    Array.from(aiTurn(s, seededRng(1), 1));
    expect(manhattan(t, s.controlPoints[0]!)).toBeLessThan(d0);
  });

  it('se guardan con la partida; las partidas antiguas siguen sin ellos', () => {
    const s = withPoints();
    s.rules = { ...RULES };
    const back = deserialize(serialize(s))!;
    expect(back.controlPoints).toEqual(s.controlPoints);
    const raw = JSON.parse(serialize(s)) as { rules: Record<string, unknown>; controlPoints: unknown };
    delete raw.rules.controlPoints;
    delete raw.rules.controlIncome;
    raw.controlPoints = [{ x: -1, y: 2, owner: 0 }];
    const old = deserialize(JSON.stringify(raw))!;
    expect(old.rules).toMatchObject({ controlPoints: 0, controlIncome: 0 });
    expect(old.controlPoints).toBeUndefined();
  });
});
