import { beforeEach, describe, expect, it } from 'vitest';
import { abilitiesOf, abilityOf, auraFactor } from '@core/abilities';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { MoveType, type AbilityDef, type UnitType, validateContent, type Content } from '@core/content';
import { unitTypeOf } from '@core/gameContent';
import { canMoveOn, captureStrength, hitChance, moveRange, newUnit, tileProtection, validPath, visibility } from '@core/rules';
import { dispatch } from '@core/actions';
import { settings } from '../src/settings';
import { abilitiesVM } from '../src/ui/hudModels';
import { blankState, terrainNamed } from './helpers';

const UNIT_TYPES = defaultContent().units.list;
const WOODS = 'Woods';

/** Primer tipo de unidad que tiene la habilidad `kind` (el test no depende de cual sea). */
const withAbility = (kind: AbilityDef['kind']): UnitType => {
  const found = UNIT_TYPES.find((unitType) => unitType.abilities.some((ability) => ability.kind === kind));
  if (!found) throw new Error(`ninguna unidad tiene ${kind}`);
  return found;
};
/** Primer tipo que cumple `callback` y no tiene habilidades. */
const plain = (callback: (unitType: UnitType) => boolean): UnitType =>
  UNIT_TYPES.find((unitType) => unitType.abilities.length === 0 && callback(unitType))!;
const ranged = (unitType: UnitType) => (unitType.attack?.minRange ?? 1) > 1;
const melee = (unitType: UnitType) => unitType.attack?.minRange === 1;
const moves = (moveType: MoveType) => (unitType: UnitType) => unitType.movement === moveType && unitType.move >= 4;
/** Acierto de units.json de un tipo contra otro (0 si no le puede atacar). */
const power = (attacker: UnitType, defender: UnitType) => attacker.attack?.hitChance[defender.id] ?? 0;
const minRangeOf = (unitType: UnitType) => unitType.attack?.minRange ?? 1;

/** Reglas de estos tests: sin niebla, coste de terreno ni veterania, que cambiarian las cuentas. */
const TEST_RULES = rulesWith(defaultContent(), { fog: false, terrainCost: false, veterancy: false });

beforeEach(() => {
  settings.lang = 'es';
});

describe('habilidades: contenido', () => {
  const clone = (): Content => structuredClone(defaultContent().files) as Content;
  const unitWith = (content: Content, abilities: unknown) => {
    content.units[0]!.abilities = abilities as AbilityDef[];
    return validateContent(content);
  };

  it('las cuatro clases estan en alguna unidad', () => {
    for (const kind of ['guard', 'zoneOfControl', 'aura', 'piercing'] as const) expect(withAbility(kind)).toBeDefined();
  });

  it('explica lo que esta mal', () => {
    expect(unitWith(clone(), [{ kind: 'volar' }]).join()).toContain('la habilidad "volar"');
    expect(unitWith(clone(), [{ kind: 'guard', factor: 2 }]).join()).toContain('abilities[0].factor');
    expect(unitWith(clone(), [{ kind: 'zoneOfControl', stops: ['nadar'] }]).join()).toContain('el movimiento "nadar"');
    expect(unitWith(clone(), [{ kind: 'aura', radius: 0, defense: 0.9 }]).join()).toContain('abilities[0].radius');
    const twice = [
      { kind: 'guard', factor: 0.5 },
      { kind: 'guard', factor: 0.5 },
    ];
    expect(unitWith(clone(), twice).join()).toContain('repetida');
    const files = clone();
    files.units[0]!.attack = null;
    expect(unitWith(files, [{ kind: 'piercing', ignoreCover: 1 }]).join()).toContain('no ataca');
  });

  it('con la regla apagada no cuenta ninguna', () => {
    const s = blankState({ ...TEST_RULES, abilities: false });
    const guardType = withAbility('guard');
    expect(abilityOf(s, guardType, 'guard')).toBeUndefined();
    expect(abilitiesOf(s, guardType)).toEqual([]);
  });
});

describe('habilidades: escudo (guard)', () => {
  it('los ataques a distancia aciertan menos; los de cuerpo a cuerpo igual', () => {
    const s = blankState(TEST_RULES);
    const guardType = withAbility('guard');
    const factor = abilityOf(s, guardType, 'guard')!.factor;
    const rangedType = plain((type) => ranged(type) && power(type, guardType) > 0);
    const meleeType = plain((type) => melee(type) && power(type, guardType) > 0);
    const defender = newUnit(s, guardType, 1, { x: 10, y: 10 });
    const far = newUnit(s, rangedType, 0, { x: 10, y: 10 - minRangeOf(rangedType) });
    const near = newUnit(s, meleeType, 0, { x: 9, y: 10 });
    expect(hitChance(s, far, defender)).toBeCloseTo(power(rangedType, guardType) * factor);
    expect(hitChance(s, near, defender)).toBeCloseTo(power(meleeType, guardType));
    s.rules = { ...TEST_RULES, abilities: false };
    expect(hitChance(s, far, defender)).toBeCloseTo(power(rangedType, guardType));
  });
});

describe('habilidades: zona de control', () => {
  const zoneType = withAbility('zoneOfControl');
  const TANK = plain(moves(MoveType.VEHICLE));
  const PLANE = plain(moves(MoveType.AIR));

  it('quien entra al lado se para: no sigue desde ahi', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, zoneType, 1, { x: 10, y: 10 });
    const unit = newUnit(s, TANK, 0, { x: 10, y: 13 });
    const range = moveRange(s, unit);
    expect(range.steps.at({ x: 10, y: 11 })).toBeGreaterThan(0); // entra en la zona
    expect(range.steps.at({ x: 11, y: 10 })).toBeGreaterThan(0); // otra casilla de la zona, entrando por fuera
    // (11, 9) esta a 5 pasos, pero todos los caminos cortos pasan por la zona.
    expect(range.steps.at({ x: 11, y: 9 })).toBe(0);
    const through = [
      { x: 10, y: 13 },
      { x: 11, y: 13 },
      { x: 11, y: 12 },
      { x: 11, y: 11 },
      { x: 11, y: 10 },
      { x: 11, y: 9 },
    ];
    expect(validPath(s, unit, through, range)).toBe(false);
    expect(dispatch(s, 0, { kind: 'move', uid: unit.uid, to: { x: 10, y: 11 } }).ok).toBe(true);
    s.rules = { ...TEST_RULES, abilities: false };
    expect(moveRange(s, newUnit(s, TANK, 0, { x: 10, y: 13 })).steps.at({ x: 11, y: 9 })).toBeGreaterThan(0);
  });

  it('desde dentro de la zona se puede salir el turno siguiente', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, zoneType, 1, { x: 10, y: 10 });
    const unit = newUnit(s, TANK, 0, { x: 10, y: 11 });
    expect(moveRange(s, unit).steps.at({ x: 10, y: 14 })).toBeGreaterThan(0);
  });

  it('no para a los movimientos que no estan en stops (aviones)', () => {
    const s = blankState(TEST_RULES);
    expect(abilityOf(s, zoneType, 'zoneOfControl')!.stops).not.toContain('air');
    newUnit(s, zoneType, 1, { x: 10, y: 10 });
    const unit = newUnit(s, PLANE, 0, { x: 10, y: 13 });
    expect(moveRange(s, unit).steps.at({ x: 11, y: 10 })).toBeGreaterThan(0);
  });

  it('con niebla solo cuenta si se ve', () => {
    const s = blankState(rulesWith(defaultContent(), { terrainCost: false }));
    s.map[5]![8] = WOODS; // el bosque la esconde salvo desde al lado
    newUnit(s, zoneType, 1, { x: 5, y: 8 });
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    // (4, 9) solo se alcanza pasando por su zona: sin verla, el alcance no la delata.
    expect(moveRange(s, unit).steps.at({ x: 4, y: 9 })).toBeGreaterThan(0);
    newUnit(s, TANK, 0, { x: 6, y: 8 }); // un aliado al lado la descubre
    expect(moveRange(s, unit).steps.at({ x: 4, y: 9 })).toBe(0);
  });
});

describe('habilidades: apoyo (aura)', () => {
  const auraType = withAbility('aura');
  const { radius, defense } = auraType.abilities.find((ability) => ability.kind === 'aura') as Extract<AbilityDef, { kind: 'aura' }>;
  const meleeType = plain(melee);

  it('protege a las propias cercanas, no a si misma ni a las enemigas', () => {
    const s = blankState(TEST_RULES);
    const sup = newUnit(s, auraType, 0, { x: 10, y: 10 });
    const ally = newUnit(s, meleeType, 0, { x: 10 + radius, y: 10 });
    const far = newUnit(s, meleeType, 0, { x: 10 + radius + 1, y: 10 });
    const foe = newUnit(s, meleeType, 1, { x: 10, y: 10 - radius });
    expect(auraFactor(s, ally)).toBe(defense);
    expect(auraFactor(s, far)).toBe(1);
    expect(auraFactor(s, sup)).toBe(1);
    expect(auraFactor(s, foe)).toBe(1);
    expect(hitChance(s, foe, ally)).toBeCloseTo(power(meleeType, meleeType) * defense);
  });

  it('no se suma con otra aura', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, auraType, 0, { x: 10, y: 10 });
    newUnit(s, auraType, 0, { x: 12, y: 10 });
    const ally = newUnit(s, meleeType, 0, { x: 11, y: 10 });
    expect(auraFactor(s, ally)).toBe(defense);
  });
});

describe('habilidades: perforante (piercing)', () => {
  it('ignora la proteccion del bosque', () => {
    const s = blankState(TEST_RULES);
    const piercingType = withAbility('piercing');
    const ignore = abilityOf(s, piercingType, 'piercing')!.ignoreCover;
    const target = plain((type) => power(piercingType, type) > 0 && canMoveOn(type.movement, terrainNamed('Woods')));
    const other = plain((type) => melee(type) && power(type, target) > 0);
    s.map[10]![10] = WOODS;
    const defender = newUnit(s, target, 1, { x: 10, y: 10 });
    const attacker = newUnit(s, piercingType, 0, { x: 10, y: 10 - minRangeOf(piercingType) });
    const cmp = newUnit(s, other, 0, { x: 9, y: 10 });
    const cover = tileProtection(s, defender);
    expect(cover).toBeLessThan(1);
    expect(hitChance(s, attacker, defender)).toBeCloseTo(power(piercingType, target) * (cover + (1 - cover) * ignore));
    expect(hitChance(s, cmp, defender)).toBeCloseTo(power(other, target) * cover);
  });
});

describe('habilidades: interfaz', () => {
  it('nombre y explicacion con sus numeros, en los dos idiomas', () => {
    const s = blankState(TEST_RULES);
    const guardType = withAbility('guard');
    const pct = Math.round((1 - abilityOf(s, guardType, 'guard')!.factor) * 100);
    expect(abilitiesVM(s, guardType)).toEqual([{ name: 'Escudo', desc: `Los ataques a distancia le aciertan un ${pct} % menos.` }]);
    settings.lang = 'en';
    expect(abilitiesVM(s, withAbility('zoneOfControl'))[0]!.desc).toContain('foot, vehicles');
    s.rules = { ...TEST_RULES, abilities: false };
    expect(abilitiesVM(s, guardType)).toEqual([]);
  });
});

describe('habilidades: explorador (scout)', () => {
  it('ve dentro del bosque en todo su radio; otra unidad solo desde al lado', () => {
    const s = blankState(rulesWith(defaultContent(), { fog: true, forestHides: true, weather: false }));
    s.map[10]![14] = WOODS;
    const scout = newUnit(s, withAbility('scout'), 0, { x: 10, y: 10 });
    expect(visibility(s, 0).at({ x: 10, y: 14 })).toBe(true); // a 4 casillas, dentro de su vision
    scout.type = plain((type) => type.vision >= withAbility('scout').vision).id;
    expect(visibility(s, 0).at({ x: 10, y: 14 })).toBe(false);
  });
});

describe('habilidades: captura rapida (quickCapture)', () => {
  it('resta un 50 % mas al capturar que una unidad igual sin la habilidad', () => {
    const s = blankState(TEST_RULES);
    const fast = newUnit(s, withAbility('quickCapture'), 0, { x: 5, y: 5 });
    const factor = (abilityOf(s, unitTypeOf(s, fast), 'quickCapture') as { factor: number }).factor;
    expect(captureStrength(s, fast)).toBe(Math.ceil(10 * factor));
    fast.life = 40;
    expect(captureStrength(s, fast)).toBe(Math.ceil(4 * factor));
    s.rules = { ...TEST_RULES, abilities: false };
    expect(captureStrength(s, fast)).toBe(4); // con la regla apagada, como cualquiera
  });
});
