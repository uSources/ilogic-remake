import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { TERRAIN_TYPES } from '@core/content';
import { unitLabel, settings } from '../src/settings';

/**
 * Las tablas de datos van por indice de unidad, edificio y terreno: al añadir uno, todas tienen que
 * crecer a la vez (skill nueva-unidad). Este test dice cual falta.
 */
describe('tablas de datos', () => {
  const tables = defaultContent().tables;
  const unitCount = tables.UNIT_NAMES.length,
    buildingCount = tables.BUILDING_NAMES.length,
    terrainCount = TERRAIN_TYPES;

  it.each(Object.entries(tables.UNIT))('UNIT.%s tiene un valor por unidad', (_k, row) => {
    expect((row as readonly unknown[]).length).toBe(unitCount);
  });

  it.each([
    ['HEALER', unitCount, buildingCount],
    ['SPAWNER', unitCount, buildingCount],
    ['CAN_CARRY', unitCount, unitCount],
    ['POWER', unitCount, unitCount],
    ['UNIT_HEALS', unitCount, unitCount],
    ['UNIT_TERRAIN_PREFIX', unitCount, terrainCount],
    ['BUILDING_TERRAIN_PREFIX', buildingCount, terrainCount],
  ] as const)('%s es de %i x %i', (name, rows, cols) => {
    const table = (tables as unknown as Record<string, readonly (readonly unknown[])[]>)[name]!;
    expect(table.length).toBe(rows);
    for (const row of table) expect(row.length).toBe(cols);
  });

  it('cada unidad tiene nombre en español e ingles y alguien la fabrica', () => {
    for (const lang of ['es', 'en'] as const) {
      settings.lang = lang;
      for (let i = 0; i < unitCount; i++) expect(unitLabel(defaultContent(), i), `${tables.UNIT_NAMES[i]} (${lang})`).not.toBe('?');
    }
    settings.lang = 'es';
    for (let i = 0; i < unitCount; i++) expect(tables.SPAWNER[i]!.some(Boolean), `${tables.UNIT_NAMES[i]} no se puede comprar`).toBe(true);
  });
});
