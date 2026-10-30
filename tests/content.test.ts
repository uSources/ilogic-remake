import { describe, expect, it } from 'vitest';
import buildingsFile from '../src/core/content/buildings.json';
import unitsFile from '../src/core/content/units.json';
import { buildTables, validateContent, type Content } from '../src/core/content';
import { CONTENT, TERRAIN_NAMES, UNIT_NAMES, BUILDING_NAMES } from '../src/core/data';

const clone = (): Content => structuredClone(CONTENT) as Content;
const errsOf = (c: Content) => validateContent(c, TERRAIN_NAMES);

describe('contenido (units.json y buildings.json)', () => {
  it('el contenido del juego es valido', () => {
    expect(errsOf(clone())).toEqual([]);
  });

  // Las partidas guardadas y los codigos de mapa guardan el tipo por numero: lo que ya existe no se
  // puede mover ni borrar. Si este test falla, la unidad nueva no va al final de la lista.
  it('el orden de siempre se mantiene (las nuevas van al final)', () => {
    const units2013 = [
      'Soldier',
      'Tank',
      'Artillery',
      'Car',
      'LTank',
      'Blocker',
      'BSoldier',
      'Transport',
      'SSoldier',
      'Missile_truck',
      'LFighter',
      'Fighter',
      'Bomber',
      'Supplier',
      'Antiair',
      'THelicopter',
      'MSoldier',
      'FSoldier',
      'WTank',
    ];
    expect(UNIT_NAMES.slice(0, units2013.length)).toEqual(units2013);
    expect(BUILDING_NAMES.slice(0, 6)).toEqual(['City', 'Oil', 'Factory', 'Stronghold', 'Airport', 'Base']);
  });

  it('los JSON apuntan a su esquema', () => {
    expect(unitsFile.$schema).toBe('./units.schema.json');
    expect(buildingsFile.$schema).toBe('./buildings.schema.json');
  });

  it('explica lo que esta mal', () => {
    const c = clone();
    c.units[0]!.attack!.hitChance.Dragon = 0.5;
    c.units[1]!.builtAt = ['Castle'];
    c.units[2]!.id = 'Soldier';
    c.units[3]!.name = { es: 'Jeep', en: '' };
    c.units[4]!.attack!.range = [3, 2];
    c.buildings[0]!.hq = true;
    const errs = errsOf(c);
    expect(errs).toContain('unidad Soldier: attack.hitChance nombra "Dragon", que no existe');
    expect(errs).toContain('unidad Tank: builtAt nombra "Castle", que no existe');
    expect(errs.some((e) => e.includes('id repetido'))).toBe(true);
    expect(errs.some((e) => e.includes('name.en'))).toBe(true);
    expect(errs.some((e) => e.includes('attack.range'))).toBe(true);
    expect(errs.some((e) => e.includes('"hq": true'))).toBe(true);
  });

  it('una unidad nueva al final entra en todas las tablas', () => {
    const c = clone();
    c.units.push({
      id: 'Sniper',
      name: { es: 'Francotirador', en: 'Sniper' },
      cost: 4000,
      move: 3,
      vision: 6,
      movement: 'foot',
      fuel: { max: 0, perTurn: 0 },
      ammo: 3,
      captures: false,
      attack: { range: [2, 3], hitChance: { Soldier: 0.9, Sniper: 0.5 } },
      builtAt: ['City'],
      repairedAt: ['City'],
      refueledAt: [],
      rearmedAt: ['City'],
    });
    c.units[0]!.attack!.hitChance.Sniper = 0.6;
    expect(errsOf(c)).toEqual([]);
    const T = buildTables(c, TERRAIN_NAMES);
    const s = T.UNIT_NAMES.indexOf('Sniper');
    expect(s).toBe(19);
    expect(T.UNIT.minalc[s]).toBe(1);
    expect(T.UNIT.alcance[s]).toBe(3);
    expect(T.POWER[s]![0]).toBe(0.9);
    expect(T.POWER[0]![s]).toBe(0.6);
    expect(T.POWER.every((row) => row.length === 20)).toBe(true);
    expect(T.SPAWNER[s]![0]).toBe(true);
    expect(T.UNIT_TERRAIN_PREFIX[s]!.length).toBe(TERRAIN_NAMES.length);
  });
});
