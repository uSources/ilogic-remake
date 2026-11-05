import { describe, expect, it } from 'vitest';
import { entryOf, loadContent, validateContent, type Content } from '@core/content';
import { mutableCopy } from '@core/util/freeze';
import { defaultContent } from '@core/content/default';
import { addUnitLike } from '../tools/content/newUnit';

describe('npm run unit -- new', () => {
  const { units, copied } = addUnitLike(mutableCopy<Content>(defaultContent().files).units, 'Sniper', 'Soldier');
  const content: Content = { ...mutableCopy<Content>(defaultContent().files), units };
  const loaded = loadContent(content);
  const sniper = entryOf(loaded.units, 'Sniper', 'unidad');
  const soldier = entryOf(loaded.units, 'Soldier', 'unidad');
  const others = loaded.units.list.filter((unitType) => unitType !== sniper);

  it('la deja al final, valida y con el dibujo de la original', () => {
    expect(validateContent(content)).toEqual([]);
    expect(loaded.units.list.indexOf(sniper)).toBe(defaultContent().files.units.length);
    expect(sniper.art).toBe('Soldier');
    expect(sniper.cost).toBe(soldier.cost);
  });

  it('copia la columna de daño: quien ataca a la original ataca igual a la nueva', () => {
    for (const attacker of others) expect(attacker.attack?.hitChance.Sniper, attacker.id).toBe(attacker.attack?.hitChance.Soldier);
    expect(sniper.attack!.hitChance.Sniper).toBe(soldier.attack!.hitChance.Soldier);
    expect(copied.attackers.length).toBeGreaterThan(5);
  });

  it('transportes y suministros la atienden como a la original', () => {
    for (const carrier of others) expect(carrier.carries.includes('Sniper'), carrier.id).toBe(carrier.carries.includes('Soldier'));
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
