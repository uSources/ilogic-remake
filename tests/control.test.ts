import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { MoveType } from '@core/content';
import { defaultContent } from '@core/content/default';
import { manhattan, seededRng } from '@core/geom';
import { createLayer } from '@core/mapGrid';
import { createGame, saveContext } from '@core/defaultGames';
import { placeControlPoints } from '@core/mapgen';
import { controlRound, endRound, groundDistance, inControlZone, newUnit } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/model';
import { blankState, savedByVersion1, unitTypeNamed, hqId } from './helpers';
import { duel, teamState } from '@core/teams';

const HQ = hqId();

/** [CAMBIO] Puntos de control: zonas que dan dinero cada ronda a su dueño si no estan disputadas. */
const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank');

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
  it('con unidades de un solo bando en la zona es suyo y paga; vacio sigue pagando a su dueño', () => {
    const s = withPoints();
    // En la zona (radio 1) aunque no en el centro.
    const unit = newUnit(s, SOLDIER, 0, { x: 11, y: 9 });
    const before = teamState(s, 0).funds;
    const control = controlRound(s)!;
    expect(s.controlPoints![0]!.owner).toBe(0);
    expect(control.held).toEqual([1, 1]);
    expect(control.contested).toBe(0);
    expect(control.income).toEqual([defaultContent().defaultRules.controlIncome, defaultContent().defaultRules.controlIncome]);
    expect(teamState(s, 0).funds).toBe(before + defaultContent().defaultRules.controlIncome);
    unit.x = 13; // fuera de la zona
    controlRound(s);
    expect(s.controlPoints![0]!.owner).toBe(0);
  });

  it('disputado (unidades de los dos bandos dentro): no paga a nadie ni cambia de dueño', () => {
    const s = withPoints();
    newUnit(s, TANK, 0, { x: 4, y: 14 });
    newUnit(s, SOLDIER, 1, { x: 6, y: 15 });
    const funds = s.teams.map((team) => team.funds);
    const control = controlRound(s)!;
    expect(control.contested).toBe(1);
    expect(s.controlPoints![1]!.owner).toBe(1);
    expect(control.held).toEqual([0, 0]);
    expect(s.teams.map((team) => team.funds)).toEqual(funds);
  });

  it('el enemigo se lo queda echando a todos los del otro bando de la zona', () => {
    const s = withPoints();
    newUnit(s, TANK, 0, { x: 5, y: 13 });
    controlRound(s);
    expect(s.controlPoints![1]!.owner).toBe(0);
  });

  it('una unidad fuera de la zona no cuenta', () => {
    const s = withPoints();
    newUnit(s, TANK, 0, { x: 12, y: 12 });
    controlRound(s);
    expect(s.controlPoints![0]!.owner).toBeNull();
    expect(inControlZone(s, { x: 10, y: 10 }, { x: 11, y: 11 })).toBe(true);
    expect(inControlZone(s, { x: 10, y: 10 }, { x: 12, y: 10 })).toBe(false);
  });

  it('endRound suma su dinero a los ingresos del informe', () => {
    const s = withPoints();
    newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const round = endRound(s);
    expect(round.control?.held).toEqual([1, 1]);
    expect(round.income[0]).toBeGreaterThanOrEqual(defaultContent().defaultRules.controlIncome);
  });

  it('sin puntos no hay nada en el informe', () => {
    const s = blankState();
    expect(endRound(s).control).toBeUndefined();
  });

  it('los mapas al azar los ponen igual de lejos de las dos salidas y separados entre si', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame(seededRng(seed * 7919), { teams: duel('human', 'ai') });
      const points = s.controlPoints ?? [];
      total += points.length;
      expect(points.length).toBeLessThanOrEqual(defaultContent().defaultRules.controlPoints);
      const hq = (team: 0 | 1) => s.buildings.find((building) => building.type === HQ && building.owner === team)!;
      const da = groundDistance(s, hq(0), MoveType.FOOT, createLayer(s, false));
      const db = groundDistance(s, hq(1), MoveType.FOOT, createLayer(s, false));
      for (const point of points) {
        expect(point.owner).toBeNull();
        expect(s.buildings.some((building) => building.x === point.x && building.y === point.y)).toBe(false);
        // Casi a la misma distancia de las dos Bases (las salidas estan junto a ellas).
        expect(Math.abs(da.at(point) - db.at(point))).toBeLessThanOrEqual(8);
      }
      // Las zonas no se tocan.
      for (const firstPoint of points)
        for (const secondPoint of points)
          if (firstPoint !== secondPoint)
            expect(manhattan(firstPoint, secondPoint)).toBeGreaterThanOrEqual(3 + 2 * defaultContent().defaultRules.controlRadius);
    }
    expect(total).toBeGreaterThan(20 * 2);
  });

  it('con la regla a 0 no se ponen', () => {
    const s = blankState({ controlPoints: 0 });
    placeControlPoints(s, { x: 0, y: 0 }, { x: 19, y: 19 }, seededRng(1));
    expect(s.controlPoints).toBeUndefined();
  });

  it('la IA manda unidades a por los puntos que no son suyos', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 });
    s.controlPoints = [{ x: 14, y: 12, owner: 0 }];
    const tank = newUnit(s, TANK, 1, { x: 18, y: 12 });
    const d0 = manhattan(tank, s.controlPoints[0]!);
    Array.from(aiTurn(s, seededRng(1), 1));
    expect(manhattan(tank, s.controlPoints[0]!)).toBeLessThan(d0);
  });

  it('se guardan con la partida; las partidas antiguas siguen sin ellos', () => {
    const s = withPoints();
    const back = deserialize(serialize(s), saveContext(defaultContent()))!;
    expect(back.controlPoints).toEqual(s.controlPoints);
    const raw = JSON.parse(serialize(s)) as { rules: Record<string, unknown>; controlPoints: unknown };
    delete raw.rules.controlPoints;
    delete raw.rules.controlIncome;
    delete raw.rules.controlRadius;
    raw.controlPoints = [{ x: -1, y: 2, owner: 0 }];
    const old = deserialize(savedByVersion1(JSON.stringify(raw)), saveContext(defaultContent()))!;
    expect(old.rules).toMatchObject({ controlPoints: 0, controlIncome: 0, controlRadius: 0 });
    expect(old.controlPoints).toBeUndefined();
  });
});
