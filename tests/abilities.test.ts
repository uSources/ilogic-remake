import { beforeEach, describe, expect, it } from 'vitest';
import { abilitiesOf, abilityOf, auraFactor } from '@core/abilities';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { walkableFor, MoveType, TerrainType, type AbilityDef } from '@core/content';
import { validateContent, type Content } from '@core/content';
import { captureStrength, hitChance, moveRange, moveUnit, newUnit, tileProtection, validPath, visibility } from '@core/rules';
import { settings } from '../src/settings';
import { abilitiesVM } from '../src/ui/hudModels';
import { blankState } from './helpers';

const { UNIT, UNIT_ABILITIES, POWER } = defaultContent().tables;

/** Primera unidad que tiene la habilidad `kind` (el test no depende de cual sea). */
const withAbility = (kind: AbilityDef['kind']): number => {
  const i = UNIT_ABILITIES.findIndex((line) => line.some((ability) => ability.kind === kind));
  if (i < 0) throw new Error(`ninguna unidad tiene ${kind}`);
  return i;
};
/** Primera unidad que cumple `f` y no tiene habilidades. */
const plain = (callback: (t: number) => boolean): number => UNIT_ABILITIES.findIndex((line, type) => line.length === 0 && callback(type));
const ranged = (type: number) => UNIT.minalc[type]! > 0 && UNIT.canfight[type]!;
const melee = (type: number) => UNIT.minalc[type]! === 0 && UNIT.canfight[type]!;
const moves = (mt: MoveType) => (type: number) => UNIT.movtype[type]! === mt && UNIT.mover[type]! >= 4;

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
    for (const k of ['guard', 'zoneOfControl', 'aura', 'piercing'] as const) expect(withAbility(k)).toBeGreaterThanOrEqual(0);
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
    const c = clone();
    c.units[0]!.attack = null;
    expect(unitWith(c, [{ kind: 'piercing', ignoreCover: 1 }]).join()).toContain('no ataca');
  });

  it('con la regla apagada no cuenta ninguna', () => {
    const s = blankState({ ...TEST_RULES, abilities: false });
    const t = withAbility('guard');
    expect(abilityOf(s, t, 'guard')).toBeUndefined();
    expect(abilitiesOf(s, t)).toEqual([]);
  });
});

describe('habilidades: escudo (guard)', () => {
  it('los ataques a distancia aciertan menos; los de cuerpo a cuerpo igual', () => {
    const s = blankState(TEST_RULES);
    const G = withAbility('guard');
    const factor = abilityOf(s, G, 'guard')!.factor;
    const R = plain((type) => ranged(type) && POWER[type]![G]! > 0);
    const M = plain((type) => melee(type) && POWER[type]![G]! > 0);
    const def = newUnit(s, G, 1, { x: 10, y: 10 });
    const far = newUnit(s, R, 0, { x: 10, y: 10 - (UNIT.minalc[R]! + 1) });
    const near = newUnit(s, M, 0, { x: 9, y: 10 });
    expect(hitChance(s, far, def)).toBeCloseTo(POWER[R]![G]! * factor);
    expect(hitChance(s, near, def)).toBeCloseTo(POWER[M]![G]!);
    s.rules = { ...TEST_RULES, abilities: false };
    expect(hitChance(s, far, def)).toBeCloseTo(POWER[R]![G]!);
  });
});

describe('habilidades: zona de control', () => {
  const Z = withAbility('zoneOfControl');
  const TANK = plain(moves(MoveType.VEHICLE));
  const PLANE = plain(moves(MoveType.AIR));

  it('quien entra al lado se para: no sigue desde ahi', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, Z, 1, { x: 10, y: 10 });
    const u = newUnit(s, TANK, 0, { x: 10, y: 13 });
    const r = moveRange(s, u);
    expect(r.steps.at({ x: 10, y: 11 })).toBeGreaterThan(0); // entra en la zona
    expect(r.steps.at({ x: 11, y: 10 })).toBeGreaterThan(0); // otra casilla de la zona, entrando por fuera
    // (11, 9) esta a 5 pasos, pero todos los caminos cortos pasan por la zona.
    expect(r.steps.at({ x: 11, y: 9 })).toBe(0);
    const through = [
      { x: 10, y: 13 },
      { x: 11, y: 13 },
      { x: 11, y: 12 },
      { x: 11, y: 11 },
      { x: 11, y: 10 },
      { x: 11, y: 9 },
    ];
    expect(validPath(s, u, through, r)).toBe(false);
    expect(moveUnit(s, u, { x: 10, y: 11 }, r)).not.toBeNull();
    s.rules = { ...TEST_RULES, abilities: false };
    expect(moveRange(s, newUnit(s, TANK, 0, { x: 10, y: 13 })).steps.at({ x: 11, y: 9 })).toBeGreaterThan(0);
  });

  it('desde dentro de la zona se puede salir el turno siguiente', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, Z, 1, { x: 10, y: 10 });
    const u = newUnit(s, TANK, 0, { x: 10, y: 11 });
    expect(moveRange(s, u).steps.at({ x: 10, y: 14 })).toBeGreaterThan(0);
  });

  it('no para a los movimientos que no estan en stops (aviones)', () => {
    const s = blankState(TEST_RULES);
    expect(abilityOf(s, Z, 'zoneOfControl')!.stops).not.toContain('air');
    newUnit(s, Z, 1, { x: 10, y: 10 });
    const u = newUnit(s, PLANE, 0, { x: 10, y: 13 });
    expect(moveRange(s, u).steps.at({ x: 11, y: 10 })).toBeGreaterThan(0);
  });

  it('con niebla solo cuenta si se ve', () => {
    const s = blankState(rulesWith(defaultContent(), { terrainCost: false }));
    s.map[5]![8] = TerrainType.WOODS; // el bosque la esconde salvo desde al lado
    newUnit(s, Z, 1, { x: 5, y: 8 });
    const u = newUnit(s, TANK, 0, { x: 5, y: 5 });
    // (4, 9) solo se alcanza pasando por su zona: sin verla, el alcance no la delata.
    expect(moveRange(s, u).steps.at({ x: 4, y: 9 })).toBeGreaterThan(0);
    newUnit(s, TANK, 0, { x: 6, y: 8 }); // un aliado al lado la descubre
    expect(moveRange(s, u).steps.at({ x: 4, y: 9 })).toBe(0);
  });
});

describe('habilidades: apoyo (aura)', () => {
  const A = withAbility('aura');
  const { radius, defense } = UNIT_ABILITIES[A]!.find((ability) => ability.kind === 'aura') as Extract<AbilityDef, { kind: 'aura' }>;
  const M = plain(melee);

  it('protege a las propias cercanas, no a si misma ni a las enemigas', () => {
    const s = blankState(TEST_RULES);
    const sup = newUnit(s, A, 0, { x: 10, y: 10 });
    const ally = newUnit(s, M, 0, { x: 10 + radius, y: 10 });
    const far = newUnit(s, M, 0, { x: 10 + radius + 1, y: 10 });
    const foe = newUnit(s, M, 1, { x: 10, y: 10 - radius });
    expect(auraFactor(s, ally)).toBe(defense);
    expect(auraFactor(s, far)).toBe(1);
    expect(auraFactor(s, sup)).toBe(1);
    expect(auraFactor(s, foe)).toBe(1);
    expect(hitChance(s, foe, ally)).toBeCloseTo(POWER[M]![M]! * defense);
  });

  it('no se suma con otra aura', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, A, 0, { x: 10, y: 10 });
    newUnit(s, A, 0, { x: 12, y: 10 });
    const ally = newUnit(s, M, 0, { x: 11, y: 10 });
    expect(auraFactor(s, ally)).toBe(defense);
  });
});

describe('habilidades: perforante (piercing)', () => {
  it('ignora la proteccion del bosque', () => {
    const s = blankState(TEST_RULES);
    const P = withAbility('piercing');
    const ignore = abilityOf(s, P, 'piercing')!.ignoreCover;
    const target = plain((type) => POWER[P]![type]! > 0 && walkableFor(defaultContent().tables, UNIT.movtype[type]!, TerrainType.WOODS));
    const other = plain((type) => melee(type) && POWER[type]![target]! > 0);
    s.map[10]![10] = TerrainType.WOODS;
    const def = newUnit(s, target, 1, { x: 10, y: 10 });
    const atk = newUnit(s, P, 0, { x: 10, y: 10 - (UNIT.minalc[P]! + 1) });
    const cmp = newUnit(s, other, 0, { x: 9, y: 10 });
    const cover = tileProtection(s, def);
    expect(cover).toBeLessThan(1);
    expect(hitChance(s, atk, def)).toBeCloseTo(POWER[P]![target]! * (cover + (1 - cover) * ignore));
    expect(hitChance(s, cmp, def)).toBeCloseTo(POWER[other]![target]! * cover);
  });
});

describe('habilidades: interfaz', () => {
  it('nombre y explicacion con sus numeros, en los dos idiomas', () => {
    const s = blankState(TEST_RULES);
    const G = withAbility('guard');
    const pct = Math.round((1 - abilityOf(s, G, 'guard')!.factor) * 100);
    expect(abilitiesVM(s, G)).toEqual([{ name: 'Escudo', desc: `Los ataques a distancia le aciertan un ${pct} % menos.` }]);
    settings.lang = 'en';
    expect(abilitiesVM(s, withAbility('zoneOfControl'))[0]!.desc).toContain('foot, vehicles');
    s.rules = { ...TEST_RULES, abilities: false };
    expect(abilitiesVM(s, G)).toEqual([]);
  });
});

describe('habilidades: explorador (scout)', () => {
  it('ve dentro del bosque en todo su radio; otra unidad solo desde al lado', () => {
    const s = blankState(rulesWith(defaultContent(), { fog: true, forestHides: true, weather: false }));
    s.map[10]![14] = TerrainType.WOODS;
    const scout = newUnit(s, withAbility('scout'), 0, { x: 10, y: 10 });
    expect(visibility(s, 0).at({ x: 10, y: 14 })).toBe(true); // a 4 casillas, dentro de su vision
    scout.type = plain((type) => UNIT.vision[type]! >= UNIT.vision[withAbility('scout')]!);
    expect(visibility(s, 0).at({ x: 10, y: 14 })).toBe(false);
  });
});

describe('habilidades: captura rapida (quickCapture)', () => {
  it('resta un 50 % mas al capturar que una unidad igual sin la habilidad', () => {
    const s = blankState(TEST_RULES);
    const fast = newUnit(s, withAbility('quickCapture'), 0, { x: 5, y: 5 });
    const factor = (abilityOf(s, fast.type, 'quickCapture') as { factor: number }).factor;
    expect(captureStrength(s, fast)).toBe(Math.ceil(10 * factor));
    fast.life = 40;
    expect(captureStrength(s, fast)).toBe(Math.ceil(4 * factor));
    s.rules = { ...TEST_RULES, abilities: false };
    expect(captureStrength(s, fast)).toBe(4); // con la regla apagada, como cualquiera
  });
});
