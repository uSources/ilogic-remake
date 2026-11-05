import { describe, expect, it } from 'vitest';
import buildingsFile from '@core/content/buildings.json';
import unitsFile from '@core/content/units.json';
import { buildTables, validateContent, type Content, TERRAIN_NAMES, TerrainType, MOVEMENTS, MoveType, walkableFor } from '@core/content';
import { defaultContent } from '@core/content/default';

const { UNIT, UNIT_NAMES, UNIT_ART, BUILDING_NAMES, MOVE_COST } = defaultContent().tables;

const clone = (): Content => structuredClone(defaultContent().files) as Content;
const errsOf = (content: Content) => validateContent(content);

describe('contenido (src/core/content/*.json)', () => {
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
    const files = clone();
    files.units[0]!.attack!.hitChance.Dragon = 0.5;
    files.units[1]!.builtAt = ['Castle'];
    files.units[2]!.id = 'Soldier';
    files.units[3]!.name = { es: 'Jeep', en: '' };
    files.units[4]!.attack!.range = [3, 2];
    files.buildings[0]!.hq = true;
    const errs = errsOf(files);
    expect(errs).toContain('unidad Soldier: attack.hitChance nombra "Dragon", que no existe');
    expect(errs).toContain('unidad Tank: builtAt nombra "Castle", que no existe');
    expect(errs.some((error) => error.includes('id repetido'))).toBe(true);
    expect(errs.some((error) => error.includes('name.en'))).toBe(true);
    expect(errs.some((error) => error.includes('attack.range'))).toBe(true);
    expect(errs.some((error) => error.includes('"hq": true'))).toBe(true);
  });

  it('una unidad nueva al final entra en todas las tablas', () => {
    const files = clone();
    files.units.push({
      id: 'Sniper',
      name: { es: 'Francotirador', en: 'Sniper' },
      cost: 4000,
      command: 2,
      move: 3,
      vision: 6,
      movement: 'foot',
      captures: false,
      attack: { range: [2, 3], hitChance: { Soldier: 0.9, Sniper: 0.5 } },
      builtAt: ['City'],
      repairedAt: ['City'],
    });
    files.units[0]!.attack!.hitChance.Sniper = 0.6;
    expect(errsOf(files)).toEqual([]);
    const tables = buildTables(files);
    const s = tables.UNIT_NAMES.indexOf('Sniper');
    expect(s).toBe(19);
    expect(tables.UNIT.minalc[s]).toBe(1);
    expect(tables.UNIT.alcance[s]).toBe(3);
    expect(tables.POWER[s]![0]).toBe(0.9);
    expect(tables.POWER[0]![s]).toBe(0.6);
    expect(tables.POWER.every((row) => row.length === 20)).toBe(true);
    expect(tables.SPAWNER[s]![0]).toBe(true);
    expect(tables.UNIT_TERRAIN_PREFIX[s]!.length).toBe(TERRAIN_NAMES.length);
  });

  it('terreno, reglas e IA: explica lo que esta mal', () => {
    const files = clone();
    files.terrain[2]!.movement.vehicle = 0;
    files.terrain[3]!.movement.air = null;
    files.terrain.pop();
    (files.rules.defaults as unknown as Record<string, unknown>).fog = 'si';
    (files.rules.defaults as unknown as Record<string, unknown>).magic = true;
    files.ai.KILLBONUS = -1;
    const errs = errsOf(files);
    expect(errs).toContain('terreno Woods: movement.vehicle tiene que ser un coste de 1 a 9 o null (no se pasa)');
    expect(errs).toContain('terreno Sand: los aereos tienen que poder pasar por todo (movement.air)');
    expect(errs.some((error) => error.startsWith('terrain.json: tienen que estar los 15 terrenos'))).toBe(true);
    expect(errs).toContain('rules.json: defaults.fog tiene que ser true o false');
    expect(errs).toContain('rules.json: regla desconocida "magic"');
    expect(errs.some((error) => error.startsWith('ai.json: KILLBONUS'))).toBe(true);
  });

  it('MoveType y TerrainType coinciden con las listas de los JSON', () => {
    MOVEMENTS.forEach((kind, i) => expect(MoveType[kind.toUpperCase() as keyof typeof MoveType]).toBe(i));
    expect(TERRAIN_NAMES[TerrainType.WOODS]).toBe('Woods');
    expect(TERRAIN_NAMES[TerrainType.SHALLOW_WATER]).toBe('SWater');
    expect(TERRAIN_NAMES[TerrainType.ICE]).toBe('Ice');
    expect(Object.keys(TerrainType)).toHaveLength(TERRAIN_NAMES.length);
  });

  it('movimiento: tipos legibles sobre las tablas de terrain.json', () => {
    const tank = UNIT_NAMES.indexOf('Tank');
    expect(UNIT.movtype[tank]!).toBe(MoveType.VEHICLE);
    expect(walkableFor(defaultContent().tables, MoveType.VEHICLE, TerrainType.WATER)).toBe(false);
    expect(walkableFor(defaultContent().tables, MoveType.AIR, TerrainType.DEEP_WATER)).toBe(true);
    expect(MOVE_COST[MoveType.VEHICLE]![TerrainType.WOODS]).toBe(2);
  });

  it('art: una unidad sin dibujo usa el de otra', () => {
    expect(UNIT_ART).toEqual(UNIT_NAMES);
    const files = clone();
    files.units.push({ ...structuredClone(files.units[0]!), id: 'Sniper', art: 'Soldier' });
    expect(errsOf(files)).toEqual([]);
    expect(buildTables(files).UNIT_ART[19]).toBe('Soldier');
    files.units[19]!.art = 'Dragon';
    expect(errsOf(files)).toContain('unidad Sniper: art nombra "Dragon", que no existe');
  });
});
