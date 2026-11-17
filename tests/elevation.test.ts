import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { entryOf } from '@core/content';
import { createMatch } from '@core/defaultGames';
import { elevationAt, elevationFor, MAX_ELEVATION } from '@core/elevation';
import { terrainAt } from '@core/gameContent';
import { neighbors4 } from '@core/geom';
import { mapGrid } from '@core/mapGrid';
import { skirmishConfig } from '@core/match';
import { newUnit } from '@core/measure';
import type { GameState, Pos } from '@core/model';
import { engagement, hitChance, movementProfile, visionOf } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { duel } from '@core/teams';
import { blankState } from './helpers';

/** [CAMBIO] Elevacion (ajuste `elevation`): alturas en el mapa, acierto, vision y subir. */

const content = defaultContent();
const TANK = entryOf(content.units, 'Tank', 'unidad');
const FIGHTER = entryOf(content.units, 'Fighter', 'unidad');

const elevatedMatch = (seed: number): GameState =>
  createMatch(skirmishConfig({ seed, teams: duel('ai', 'ai'), settingChanges: { elevation: true } }));

/** Una partida llana con elevacion y una colina a mano: nivel `level` en estas casillas. */
function withHill(hill: readonly Pos[], level: number): GameState {
  const s = blankState({ elevation: true });
  const isHill = (pos: Pos) => hill.some((tile) => tile.x === pos.x && tile.y === pos.y);
  s.elevation = s.map.map((column, x) => column.map((_, y) => (isHill({ x, y }) ? level : 0)));
  return s;
}

describe('elevacion: las alturas del mapa', () => {
  it('las lleva toda partida, con la regla o sin ella (las montañas son lo alto)', () => {
    const plain = createMatch(skirmishConfig({ seed: 5, teams: duel('ai', 'ai') }));
    expect(plain.elevation).toEqual(elevatedMatch(5).elevation);
    const mountains = [...mapGrid(plain).cells()].filter(
      ({ pos }) => terrainAt(plain, pos).moveCost.vehicle === null && !terrainAt(plain, pos).isWater,
    );
    expect(mountains.length).toBeGreaterThan(0);
    expect(mountains.some(({ pos }) => elevationAt(plain, pos) === MAX_ELEVATION)).toBe(true);
  });

  it('el agua esta abajo, entre vecinas hay como mucho un nivel y hay de todos', () => {
    for (const seed of [1, 2, 7, 9]) {
      const s = elevatedMatch(seed);
      const grid = mapGrid(s);
      const levels = new Set<number>();
      grid.forEach((_, pos) => {
        const level = elevationAt(s, pos);
        levels.add(level);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(MAX_ELEVATION);
        if (terrainAt(s, pos).isWater) expect(level, `agua en ${pos.x},${pos.y}`).toBe(0);
        for (const next of neighbors4(grid, pos)) expect(Math.abs(level - elevationAt(s, next))).toBeLessThanOrEqual(1);
      });
      expect(levels.size, `semilla ${seed}`).toBeGreaterThan(1);
    }
  });

  it('salen del mapa: el mismo mapa da las mismas alturas', () => {
    const s = elevatedMatch(3);
    expect(elevationFor(s)).toEqual(s.elevation);
    expect(elevatedMatch(3).elevation).toEqual(s.elevation);
  });

  it('se guardan y se leen con la partida', () => {
    const s = elevatedMatch(4);
    expect(deserialize(serialize(s), content)!.elevation).toEqual(s.elevation);
  });
});

describe('elevacion: lo que hace la altura', () => {
  it('desde arriba se acierta mas y desde abajo menos', () => {
    const s = withHill([{ x: 5, y: 5 }], 2);
    const high = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const low = newUnit(s, TANK, 1, { x: 6, y: 5 });
    const flat = hitChance(blankState({ elevation: true }), engagement(high, low));
    const step = s.settings.elevationHit;
    expect(hitChance(s, engagement(high, low))).toBeCloseTo(flat * (1 + 2 * step));
    expect(hitChance(s, engagement(low, high))).toBeCloseTo(flat * (1 - 2 * step));
  });

  it('a los aviones no les cambia el acierto', () => {
    const s = withHill([{ x: 5, y: 5 }], 2);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const plane = newUnit(s, FIGHTER, 1, { x: 6, y: 5 });
    const flat = blankState({ elevation: true });
    expect(hitChance(s, engagement(plane, tank))).toBeCloseTo(hitChance(flat, engagement(plane, tank)));
  });

  it('desde arriba se ve mas (en tierra)', () => {
    const s = withHill([{ x: 5, y: 5 }], 2);
    const onHill = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const below = newUnit(s, TANK, 0, { x: 9, y: 9 });
    expect(visionOf(s, onHill)).toBe(visionOf(s, below) + 2 * s.settings.elevationVision);
  });

  it('subir cuesta; bajar y seguir llano, no; volando, nunca', () => {
    const s = withHill([{ x: 5, y: 5 }], 1);
    const tank = movementProfile(s, newUnit(s, TANK, 0, { x: 4, y: 5 }));
    const plane = movementProfile(s, newUnit(s, FIGHTER, 0, { x: 3, y: 5 }));
    const [low, hill] = [
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(tank.enterCost(hill, low)).toBe(tank.enterCost(low, { x: 3, y: 5 }) + s.settings.elevationClimb);
    expect(tank.enterCost(low, hill)).toBe(tank.enterCost(low, { x: 3, y: 5 }));
    expect(plane.enterCost(hill, low)).toBe(plane.enterCost(low, { x: 3, y: 5 }));
  });
});
