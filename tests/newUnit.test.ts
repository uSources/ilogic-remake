import { describe, expect, it } from 'vitest';
import { buildTables, validateContent, type Content } from '@core/content';
import { mutableCopy } from '@core/util/freeze';
import { defaultContent } from '@core/content/default';
import { addUnitLike } from '../tools/content/newUnit';

describe('npm run unit -- new', () => {
  const { units, copied } = addUnitLike(mutableCopy<Content>(defaultContent().files).units, 'Sniper', 'Soldier');
  const content: Content = { ...mutableCopy<Content>(defaultContent().files), units };
  const T = buildTables(content);
  const sniper = T.UNIT_NAMES.indexOf('Sniper');
  const soldier = T.UNIT_NAMES.indexOf('Soldier');

  it('la deja al final, valida y con el dibujo de la original', () => {
    expect(validateContent(content)).toEqual([]);
    expect(sniper).toBe(defaultContent().files.units.length);
    expect(T.UNIT_ART[sniper]).toBe('Soldier');
    expect(T.UNIT.cost[sniper]).toBe(T.UNIT.cost[soldier]);
  });

  it('copia la columna de daño: quien ataca a la original ataca igual a la nueva', () => {
    for (let a = 0; a < sniper; a++) expect(T.POWER[a]![sniper], T.UNIT_NAMES[a]).toBe(T.POWER[a]![soldier]);
    expect(T.POWER[sniper]![sniper]).toBe(T.POWER[soldier]![soldier]);
    expect(copied.attackers.length).toBeGreaterThan(5);
  });

  it('transportes y suministros la atienden como a la original', () => {
    for (let t = 0; t < sniper; t++) expect(T.CAN_CARRY[t]![sniper]).toBe(T.CAN_CARRY[t]![soldier]);
    expect(copied.carriers.length).toBeGreaterThan(0);
  });

  it('no toca el contenido original', () => {
    expect(defaultContent().files.units.some((unit) => unit.id === 'Sniper')).toBe(false);
    expect(defaultContent().files.units[0]!.attack!.hitChance.Sniper).toBeUndefined();
  });

  it('explica los errores', () => {
    expect(() => addUnitLike(mutableCopy<Content>(defaultContent().files).units, 'Tank', 'Soldier')).toThrow('Ya hay una unidad "Tank"');
    expect(() => addUnitLike(mutableCopy<Content>(defaultContent().files).units, 'Sniper', 'Dragon')).toThrow(
      'No hay ninguna unidad "Dragon"',
    );
  });
});
