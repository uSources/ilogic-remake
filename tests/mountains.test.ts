import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { terrainAt, themeOf } from '@core/gameContent';
import { neighbors4 } from '@core/geom';
import { mapGrid } from '@core/mapGrid';
import { skirmishConfig } from '@core/match';
import type { GameState, Pos } from '@core/model';
import { distanceMap } from '@core/rules/distance';
import { duel } from '@core/teams';

/** [CAMBIO] Las montañas del mapa al azar salen en sierras (themes.json, "generator.mountains"). */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const matchOf = (seed: number): GameState => createMatch(skirmishConfig({ seed, teams: duel('ai', 'ai') }));
const tilesOf = (s: GameState): Pos[] => [...mapGrid(s).cells()].map((cell) => cell.pos);
const isMountain = (s: GameState, pos: Pos): boolean => terrainAt(s, pos).id === themeOf(s).generator.mountains?.terrain;

describe('montañas: las sierras del generador', () => {
  it('cada tema con sierras tiene un terreno de montaña que los vehiculos no cruzan', () => {
    for (const theme of defaultContent().themes.list) {
      const ranges = theme.generator.mountains;
      if (!ranges) continue;
      const mountain = defaultContent().terrain.list.find((terrain) => terrain.id === ranges.terrain)!;
      expect(mountain.moveCost[defaultContent().mapgen.passMovement], theme.id).toBeNull();
    }
  });

  it('salen juntas: casi ninguna montaña esta sola', () => {
    for (const seed of SEEDS) {
      const s = matchOf(seed);
      const mountains = tilesOf(s).filter((pos) => isMountain(s, pos));
      const alone = mountains.filter((pos) => !neighbors4(mapGrid(s), pos).some((next) => isMountain(s, next)));
      expect(mountains.length, `semilla ${seed}`).toBeGreaterThan(0);
      expect(alone.length / mountains.length, `semilla ${seed}`).toBeLessThan(0.25);
    }
  });

  it('ninguna sierra parte en dos la tierra por la que pasan los vehiculos', () => {
    const movement = defaultContent().mapgen.passMovement;
    for (const seed of SEEDS) {
      const s = matchOf(seed);
      const passable = tilesOf(s).filter((pos) => terrainAt(s, pos).moveCost[movement] !== null);
      const regionOf = new Map<string, number>();
      passable.forEach((pos, index) => {
        if (regionOf.has(`${pos.x},${pos.y}`)) return;
        distanceMap(s, pos, movement).forEach((distance, reached) => {
          if (distance !== Infinity) regionOf.set(`${reached.x},${reached.y}`, index);
        });
      });
      for (const pos of tilesOf(s).filter((tile) => isMountain(s, tile))) {
        const touched = new Set(neighbors4(mapGrid(s), pos).flatMap((next) => regionOf.get(`${next.x},${next.y}`) ?? []));
        expect(touched.size, `semilla ${seed}, montaña en ${pos.x},${pos.y}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
