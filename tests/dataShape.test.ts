import { describe, expect, it } from 'vitest';
import * as D from '../src/core/data';
import { unitLabel, settings } from '../src/settings';

/**
 * Las tablas de datos van por indice de unidad, edificio y terreno: al añadir uno, todas tienen que
 * crecer a la vez (skill nueva-unidad). Este test dice cual falta.
 */
describe('tablas de datos', () => {
  const U = D.UNIT_TYPES,
    B = D.BUILDING_TYPES,
    T = D.TERRAIN_TYPES;

  it.each(Object.entries(D.UNIT))('UNIT.%s tiene un valor por unidad', (_k, arr) => {
    expect((arr as readonly unknown[]).length).toBe(U);
  });

  it.each([
    ['HEALER', U, B],
    ['FUELER', U, B],
    ['AMMO_RESTORER', U, B],
    ['SPAWNER', U, B],
    ['CAN_CARRY', U, U],
    ['UNIT_FUELER', U, U],
    ['UNIT_AMMO_RESTORER', U, U],
    ['POWER', U, U],
    ['UNIT_HEALS', U, U],
    ['UNIT_TERRAIN_PREFIX', U, T],
    ['BUILDING_TERRAIN_PREFIX', B, T],
  ] as const)('%s es de %i x %i', (name, rows, cols) => {
    const m = (D as unknown as Record<string, readonly (readonly unknown[])[]>)[name]!;
    expect(m.length).toBe(rows);
    for (const r of m) expect(r.length).toBe(cols);
  });

  it('cada unidad tiene nombre en español e ingles y alguien la fabrica', () => {
    for (const lang of ['es', 'en'] as const) {
      settings.lang = lang;
      for (let i = 0; i < U; i++) expect(unitLabel(i), `${D.UNIT_NAMES[i]} (${lang})`).not.toBe('?');
    }
    settings.lang = 'es';
    for (let i = 0; i < U; i++) expect(D.SPAWNER[i]!.some(Boolean), `${D.UNIT_NAMES[i]} no se puede comprar`).toBe(true);
  });
});
