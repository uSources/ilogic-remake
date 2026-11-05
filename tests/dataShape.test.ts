import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { findEntry } from '@core/content';
import { nameOf, settings } from '../src/settings';

/**
 * Los tipos del contenido se resuelven al cargarlo: cada referencia por id (fabricas, reparacion,
 * transporte, acierto, graficos de 2013) apunta a algo que existe. Este test dice cual falta.
 */
describe('tipos del contenido resueltos', () => {
  const content = defaultContent();

  it('lo que nombra cada unidad existe', () => {
    for (const unitType of content.units.list) {
      for (const building of [...unitType.builtAt, ...unitType.repairedAt])
        expect(findEntry(content.buildings, building), unitType.id).toBeDefined();
      for (const other of [...unitType.carries, ...Object.keys(unitType.heals), ...Object.keys(unitType.attack?.hitChance ?? {})])
        expect(findEntry(content.units, other), unitType.id).toBeDefined();
      for (const terrain of Object.keys(unitType.classicSprite)) expect(findEntry(content.terrain, terrain), unitType.id).toBeDefined();
      expect(unitType.cargoSlots > 0 || unitType.carries.length === 0, unitType.id).toBe(true);
    }
  });

  it('cada unidad tiene nombre en español e ingles y alguien la fabrica', () => {
    for (const lang of ['es', 'en'] as const) {
      settings.lang = lang;
      for (const unitType of content.units.list) expect(nameOf(unitType), `${unitType.id} (${lang})`).not.toBe('');
    }
    settings.lang = 'es';
    for (const unitType of content.units.list) expect(unitType.builtAt.length, `${unitType.id} no se puede comprar`).toBeGreaterThan(0);
  });
});
