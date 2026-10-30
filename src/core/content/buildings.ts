/** Edificios (buildings.json): validacion y tablas por indice (BUILDING, HQ...). */
import { type Checker, checkSprites, spriteRow } from './check';
import type { BuildingDef, ContentContext } from './types';

export function validateBuildings(buildings: readonly BuildingDef[], ctx: ContentContext, check: Checker): void {
  for (const b of buildings) {
    const s = check.scope(`edificio ${b?.id}`);
    s.texts('name', b?.name);
    s.num('earning', b?.earning, { min: 0, int: true });
    s.num('heals', b?.heals, { min: 0, max: 100, int: true });
    s.num('protection', b?.protection, { min: 0.05, max: 1 });
    s.num('vision', b?.vision, { min: 0, max: 20, int: true });
    checkSprites(s, b?.classicSprite, ctx.terrainNames);
  }
  check
    .scope('buildings.json')
    .expect(buildings.filter((b) => b?.hq).length === 1, 'tiene que haber exactamente un edificio con "hq": true');
}

export function buildBuildingTables(buildings: readonly BuildingDef[], ctx: ContentContext) {
  return {
    BUILDING_NAMES: buildings.map((b) => b.id),
    HQ: buildings.findIndex((b) => b.hq),
    BUILDING: {
      earning: buildings.map((b) => b.earning),
      heals: buildings.map((b) => b.heals),
      protection: buildings.map((b) => b.protection),
      vision: buildings.map((b) => b.vision),
    },
    BUILDING_TERRAIN_PREFIX: buildings.map((b) => spriteRow(b.classicSprite, ctx.terrainNames)),
  };
}
