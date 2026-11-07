import { describe, expect, it } from 'vitest';
import buildingsFile from '@core/content/buildings.json';
import unitsFile from '@core/content/units.json';
import missionsFile from '@core/content/missions.json';
import { entryOf, findEntry, loadContent, validateContent, type Content } from '@core/content';
import { canMoveOn, terrainMoveCost } from '@core/rules';
import { defaultContent } from '@core/content/default';

const UNIT_NAMES = defaultContent().units.list.map((unitType) => unitType.id);
const BUILDING_NAMES = defaultContent().buildings.list.map((buildingType) => buildingType.id);

const clone = (): Content => structuredClone(defaultContent().files) as Content;
const errsOf = (content: Content) => validateContent(content);

describe('contenido (src/core/content/*.json)', () => {
  it('el contenido del juego es valido', () => {
    expect(errsOf(clone())).toEqual([]);
  });

  // Las partidas guardan el id del tipo (no su puesto), pero el orden es el de los menus y el de los
  // empates de la IA (tests/aiGolden.test.ts), y una partida con un tipo borrado ya no se lee: lo que
  // ya existe no se mueve ni se borra. Si este test falla, la unidad nueva no va al final de la lista.
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
    expect(missionsFile.$schema).toBe('./missions.schema.json');
  });

  it('explica lo que esta mal', () => {
    const files = clone();
    files.units[0]!.attack!.hitChance.Dragon = 0.5;
    files.units[1]!.builtAt = ['Castle'];
    files.units[2]!.id = 'Soldier';
    files.units[3]!.name = { es: 'Jeep', en: '' };
    files.units[4]!.attack!.range = [3, 2];
    files.buildings[0]!.hq = true;
    const errors = errsOf(files);
    expect(errors).toContain('unidad Soldier: attack.hitChance nombra "Dragon", que no existe');
    expect(errors).toContain('unidad Tank: builtAt nombra "Castle", que no existe');
    expect(errors.some((error) => error.includes('id repetido'))).toBe(true);
    expect(errors.some((error) => error.includes('name.en'))).toBe(true);
    expect(errors.some((error) => error.includes('attack.range'))).toBe(true);
    expect(errors.some((error) => error.includes('"hq": true'))).toBe(true);
  });

  it('una unidad nueva al final sale resuelta en el catalogo, con sus campos con nombre', () => {
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
      attack: { range: [2, 3], firesAfterMove: false, hitChance: { Soldier: 0.9, Sniper: 0.5 } },
      builtAt: ['City'],
      repairedAt: ['City'],
    });
    files.units[0]!.attack!.hitChance.Sniper = 0.6;
    expect(errsOf(files)).toEqual([]);
    const content = loadContent(files);
    const sniper = entryOf(content.units, 'Sniper', 'unidad');
    expect(content.units.list.indexOf(sniper)).toBe(19);
    expect(sniper.attack).toEqual({ minRange: 2, maxRange: 3, firesAfterMove: false, hitChance: { Soldier: 0.9, Sniper: 0.5 } });
    expect(sniper.cargoSlots).toBe(0);
    expect(sniper.canCapture).toBe(false);
    expect(sniper.builtAt).toEqual(['City']);
    expect(entryOf(content.units, 'Soldier', 'unidad').attack!.hitChance.Sniper).toBe(0.6);
    expect(sniper.art).toBe('Sniper');
  });

  it('moverse y disparar es un campo propio, no sale del alcance minimo', () => {
    const files = clone();
    const soldier = files.units[0]!;
    delete (soldier.attack as Partial<NonNullable<typeof soldier.attack>>).firesAfterMove;
    expect(errsOf(files).some((error) => error.includes('attack.firesAfterMove'))).toBe(true);
    soldier.attack!.firesAfterMove = false;
    expect(errsOf(files)).toEqual([]);
    const content = loadContent(files);
    const melee = entryOf(content.units, soldier.id, 'unidad');
    expect(melee.attack).toMatchObject({ minRange: 1, firesAfterMove: false });
  });

  it('el catalogo: por id, en orden, y un id que no esta lo dice', () => {
    const { units } = defaultContent();
    expect(units.list.map((unitType) => unitType.id)).toEqual(UNIT_NAMES);
    expect(findEntry(units, 'Tank')).toBe(units.list[1]);
    expect(findEntry(units, 'Dragon')).toBeUndefined();
    expect(findEntry(units, 'toString')).toBeUndefined();
    expect(() => entryOf(units, 'Dragon', 'unidad')).toThrow('unidad "Dragon" no existe');
    expect(defaultContent().hq.id).toBe('Base');
    expect(defaultContent().clearWeather.id).toBe('Clear');
    expect(defaultContent().plainTerrain.id).toBe('Grass');
  });

  it('el contenido esta congelado (tambien los tipos resueltos)', () => {
    const tank = entryOf(defaultContent().units, 'Tank', 'unidad');
    expect(Object.isFrozen(tank)).toBe(true);
    expect(Object.isFrozen(tank.attack!.hitChance)).toBe(true);
    expect(Object.isFrozen(defaultContent().units.byId)).toBe(true);
  });

  it('terreno, reglas e IA: explica lo que esta mal', () => {
    const files = clone();
    files.terrain[2]!.movement.vehicle = 0;
    files.terrain[3]!.movement.air = null;
    files.terrain[4]!.mapLetter = '~';
    (files.settings.defaults as unknown as Record<string, unknown>).fog = 'si';
    (files.settings.defaults as unknown as Record<string, unknown>).magic = true;
    files.ai.killBonus = -1;
    const errors = errsOf(files);
    expect(errors).toContain('terreno Woods: movement.vehicle tiene que ser un coste de 1 a 9 o null (no se pasa)');
    expect(errors).toContain('terreno Sand: movement.air pasa por todo: tiene que tener un coste');
    expect(errors).toContain('terreno Cactus: la letra "~" ya es de otro terreno');
    expect(errors).toContain('settings.json: defaults.fog tiene que ser true o false');
    expect(errors).toContain('settings.json: regla desconocida "magic"');
    expect(errors.some((error) => error.startsWith('ai.json: killBonus'))).toBe(true);
  });

  it('las letras de la partida por texto: una por terreno y por edificio, y la de un edificio en mayuscula', () => {
    const files = clone();
    files.terrain[1]!.textLetter = files.terrain[0]!.textLetter;
    files.terrain[2]!.textLetter = 'ff';
    files.buildings[1]!.textLetter = 'o';
    files.buildings[2]!.textLetter = files.buildings[0]!.textLetter;
    const errors = errsOf(files);
    expect(errors).toContain(`terreno ${files.terrain[1]!.id}: textLetter: la letra "${files.terrain[0]!.textLetter}" ya es de otro`);
    expect(errors).toContain(`terreno ${files.terrain[2]!.id}: textLetter tiene que ser una sola letra`);
    expect(errors).toContain(
      `edificio ${files.buildings[1]!.id}: textLetter tiene que ser una mayuscula (la de otro equipo sale en minuscula)`,
    );
    expect(errors).toContain(`edificio ${files.buildings[2]!.id}: textLetter: la letra "${files.buildings[0]!.textLetter}" ya es de otro`);
  });

  it('la letra de un terreno no puede ser la de un edificio (en el mapa, la de otro equipo sale en minuscula)', () => {
    const files = clone();
    const factory = files.buildings.find((building) => building.id === 'Factory')!;
    files.terrain[3]!.textLetter = factory.textLetter.toLowerCase();
    expect(errsOf(files)).toContain(
      `terreno ${files.terrain[3]!.id}: textLetter "${factory.textLetter.toLowerCase()}" se confunde en el mapa con el edificio Factory (de otro equipo sale en minuscula)`,
    );
  });

  it('temas y generador de mapas: nombran terrenos, unidades y edificios que existen', () => {
    const files = clone();
    files.themes[0]!.mapLetters.T = 'Jungle';
    files.themes[1]!.generator = { ...files.themes[1]!.generator, narrowWater: 'Lava' };
    files.mapgen = { ...files.mapgen, startingUnits: ['Soldier', 'Dragon'], neutralBuildings: { Castle: [1, 2] } };
    files.weather[0]!.chance = { ...files.weather[0]!.chance, Moon: 1 };
    const errors = errsOf(files);
    expect(errors).toContain('tema Plains: mapLetters.T nombra el terreno "Jungle", que no existe');
    expect(errors).toContain('tema Desert: generator.narrowWater nombra el terreno "Lava", que no existe');
    expect(errors).toContain('mapgen.json: startingUnits nombra "Dragon", que no existe');
    expect(errors).toContain('mapgen.json: neutralBuildings nombra el edificio "Castle", que no existe');
    expect(errors).toContain('clima Clear: chance nombra el tema "Moon", que no existe');
  });

  it('un tema y su generador, resueltos (themes.json)', () => {
    const snowy = entryOf(defaultContent().themes, 'Snowy', 'tema');
    expect(snowy.generator.shoreWater).toBe('Ice');
    expect(snowy.generator.narrowWater).toBeNull();
    expect(snowy.mapLetters['.']).toBe('Snow');
    expect(defaultContent().themes.list.map((theme) => theme.id)).toEqual(['Plains', 'Desert', 'Forest', 'Swamp', 'Snowy']);
  });

  it('movimiento: tipos legibles sobre terrain.json', () => {
    const tank = entryOf(defaultContent().units, 'Tank', 'unidad');
    const terrain = (id: string) => entryOf(defaultContent().terrain, id, 'terreno');
    expect(tank.movement).toBe('vehicle');
    expect(defaultContent().movements.list.map((movement) => movement.id)).toEqual(['foot', 'vehicle', 'air', 'amphibious']);
    expect(canMoveOn('vehicle', terrain('Water'))).toBe(false);
    expect(canMoveOn('air', terrain('DWater'))).toBe(true);
    expect(terrainMoveCost('vehicle', terrain('Woods'))).toBe(2);
  });

  it('un tipo de movimiento nuevo es su entrada en movements.json y su coste en cada terreno', () => {
    const files = clone();
    files.movements.push({ id: 'hover', name: { es: 'Aerodeslizador', en: 'Hovercraft' }, motion: 'drive' });
    expect(validateContent(files).join('\n')).toMatch(/movement\.hover tiene que ser un coste/);
    for (const terrain of files.terrain) terrain.movement.hover = terrain.water ? 1 : 2;
    files.units[0]!.movement = 'hover';
    const content = loadContent(files);
    expect(content.weather.list[0]!.move.hover).toBe(0);
    expect(content.units.list[0]!.motion).toBe('drive');
    const broken = clone();
    broken.units[0]!.movement = 'teleport';
    expect(validateContent(broken).join('\n')).toMatch(/el movimiento "teleport", que no existe/);
  });

  it('art: una unidad sin dibujo usa el de otra', () => {
    expect(defaultContent().units.list.map((unitType) => unitType.art)).toEqual(UNIT_NAMES);
    const files = clone();
    files.units.push({ ...structuredClone(files.units[0]!), id: 'Sniper', art: 'Soldier' });
    expect(errsOf(files)).toEqual([]);
    expect(entryOf(loadContent(files).units, 'Sniper', 'unidad').art).toBe('Soldier');
    files.units[19]!.art = 'Dragon';
    expect(errsOf(files)).toContain('unidad Sniper: art nombra "Dragon", que no existe');
  });
});
