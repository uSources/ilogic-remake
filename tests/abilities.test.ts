import { beforeEach, describe, expect, it } from 'vitest';
import { abilitiesOf, abilityOf, auraFactor } from '@core/abilities';
import {
  CONTENT,
  DEFAULT_RULES,
  MoveType,
  Movement,
  POWER,
  TerrainType,
  UNIT,
  UNIT_ABILITIES,
  useRules,
  type AbilityDef,
} from '@core/data';
import { validateContent, type Content } from '@core/content';
import { captureStrength, hitChance, moveRange, moveUnit, newUnit, tileProtection, validPath, visibility } from '@core/rules';
import { settings } from '../src/settings';
import { abilitiesVM } from '../src/ui/hudModels';
import { blankState } from './helpers';

/** Primera unidad que tiene la habilidad `kind` (el test no depende de cual sea). */
const withAbility = (kind: AbilityDef['kind']): number => {
  const i = UNIT_ABILITIES.findIndex((l) => l.some((a) => a.kind === kind));
  if (i < 0) throw new Error(`ninguna unidad tiene ${kind}`);
  return i;
};
/** Primera unidad que cumple `f` y no tiene habilidades. */
const plain = (f: (t: number) => boolean): number => UNIT_ABILITIES.findIndex((l, t) => l.length === 0 && f(t));
const ranged = (t: number) => UNIT.minalc[t]! > 0 && UNIT.canfight[t]!;
const melee = (t: number) => UNIT.minalc[t]! === 0 && UNIT.canfight[t]!;
const moves = (mt: MoveType) => (t: number) => Movement.of(t) === mt && UNIT.mover[t]! >= 4;

beforeEach(() => {
  useRules({ ...DEFAULT_RULES, fog: false, terrainCost: false, veterancy: false });
  settings.lang = 'es';
});

describe('habilidades: contenido', () => {
  const clone = (): Content => structuredClone(CONTENT) as Content;
  const unitWith = (c: Content, abilities: unknown) => {
    c.units[0]!.abilities = abilities as AbilityDef[];
    return validateContent(c);
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
    useRules({ ...DEFAULT_RULES, abilities: false });
    const t = withAbility('guard');
    expect(abilityOf(t, 'guard')).toBeUndefined();
    expect(abilitiesOf(t)).toEqual([]);
  });
});

describe('habilidades: escudo (guard)', () => {
  it('los ataques a distancia aciertan menos; los de cuerpo a cuerpo igual', () => {
    const G = withAbility('guard');
    const factor = abilityOf(G, 'guard')!.factor;
    const R = plain((t) => ranged(t) && POWER[t]![G]! > 0);
    const M = plain((t) => melee(t) && POWER[t]![G]! > 0);
    const s = blankState();
    const def = newUnit(s, G, 1, 10, 10);
    const far = newUnit(s, R, 0, 10, 10 - (UNIT.minalc[R]! + 1));
    const near = newUnit(s, M, 0, 9, 10);
    expect(hitChance(s, far, def)).toBeCloseTo(POWER[R]![G]! * factor);
    expect(hitChance(s, near, def)).toBeCloseTo(POWER[M]![G]!);
    useRules({ ...DEFAULT_RULES, abilities: false, veterancy: false });
    expect(hitChance(s, far, def)).toBeCloseTo(POWER[R]![G]!);
  });
});

describe('habilidades: zona de control', () => {
  const Z = withAbility('zoneOfControl');
  const TANK = plain(moves(MoveType.VEHICLE));
  const PLANE = plain(moves(MoveType.AIR));

  it('quien entra al lado se para: no sigue desde ahi', () => {
    const s = blankState();
    newUnit(s, Z, 1, 10, 10);
    const u = newUnit(s, TANK, 0, 10, 13);
    const r = moveRange(s, u);
    expect(r.steps[10]![11]).toBeGreaterThan(0); // entra en la zona
    expect(r.steps[11]![10]).toBeGreaterThan(0); // otra casilla de la zona, entrando por fuera
    // (11, 9) esta a 5 pasos, pero todos los caminos cortos pasan por la zona.
    expect(r.steps[11]![9]).toBe(0);
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
    useRules({ ...DEFAULT_RULES, fog: false, terrainCost: false, veterancy: false, abilities: false });
    expect(moveRange(s, newUnit(s, TANK, 0, 10, 13)).steps[11]![9]).toBeGreaterThan(0);
  });

  it('desde dentro de la zona se puede salir el turno siguiente', () => {
    const s = blankState();
    newUnit(s, Z, 1, 10, 10);
    const u = newUnit(s, TANK, 0, 10, 11);
    expect(moveRange(s, u).steps[10]![14]).toBeGreaterThan(0);
  });

  it('no para a los movimientos que no estan en stops (aviones)', () => {
    expect(abilityOf(Z, 'zoneOfControl')!.stops).not.toContain('air');
    const s = blankState();
    newUnit(s, Z, 1, 10, 10);
    const u = newUnit(s, PLANE, 0, 10, 13);
    expect(moveRange(s, u).steps[11]![10]).toBeGreaterThan(0);
  });

  it('con niebla solo cuenta si se ve', () => {
    useRules({ ...DEFAULT_RULES, terrainCost: false });
    const s = blankState();
    s.map[5]![8] = TerrainType.WOODS; // el bosque la esconde salvo desde al lado
    newUnit(s, Z, 1, 5, 8);
    const u = newUnit(s, TANK, 0, 5, 5);
    // (4, 9) solo se alcanza pasando por su zona: sin verla, el alcance no la delata.
    expect(moveRange(s, u).steps[4]![9]).toBeGreaterThan(0);
    newUnit(s, TANK, 0, 6, 8); // un aliado al lado la descubre
    expect(moveRange(s, u).steps[4]![9]).toBe(0);
  });
});

describe('habilidades: apoyo (aura)', () => {
  const A = withAbility('aura');
  const { radius, defense } = UNIT_ABILITIES[A]!.find((a) => a.kind === 'aura') as Extract<AbilityDef, { kind: 'aura' }>;
  const M = plain(melee);

  it('protege a las propias cercanas, no a si misma ni a las enemigas', () => {
    const s = blankState();
    const sup = newUnit(s, A, 0, 10, 10);
    const ally = newUnit(s, M, 0, 10 + radius, 10);
    const far = newUnit(s, M, 0, 10 + radius + 1, 10);
    const foe = newUnit(s, M, 1, 10, 10 - radius);
    expect(auraFactor(s, ally)).toBe(defense);
    expect(auraFactor(s, far)).toBe(1);
    expect(auraFactor(s, sup)).toBe(1);
    expect(auraFactor(s, foe)).toBe(1);
    expect(hitChance(s, foe, ally)).toBeCloseTo(POWER[M]![M]! * defense);
  });

  it('no se suma con otra aura', () => {
    const s = blankState();
    newUnit(s, A, 0, 10, 10);
    newUnit(s, A, 0, 12, 10);
    const ally = newUnit(s, M, 0, 11, 10);
    expect(auraFactor(s, ally)).toBe(defense);
  });
});

describe('habilidades: perforante (piercing)', () => {
  it('ignora la proteccion del bosque', () => {
    const P = withAbility('piercing');
    const ignore = abilityOf(P, 'piercing')!.ignoreCover;
    const target = plain((t) => POWER[P]![t]! > 0 && Movement.canWalk(Movement.of(t), TerrainType.WOODS));
    const other = plain((t) => melee(t) && POWER[t]![target]! > 0);
    const s = blankState();
    s.map[10]![10] = TerrainType.WOODS;
    const def = newUnit(s, target, 1, 10, 10);
    const atk = newUnit(s, P, 0, 10, 10 - (UNIT.minalc[P]! + 1));
    const cmp = newUnit(s, other, 0, 9, 10);
    const cover = tileProtection(s, def);
    expect(cover).toBeLessThan(1);
    expect(hitChance(s, atk, def)).toBeCloseTo(POWER[P]![target]! * (cover + (1 - cover) * ignore));
    expect(hitChance(s, cmp, def)).toBeCloseTo(POWER[other]![target]! * cover);
  });
});

describe('habilidades: interfaz', () => {
  it('nombre y explicacion con sus numeros, en los dos idiomas', () => {
    const G = withAbility('guard');
    const pct = Math.round((1 - abilityOf(G, 'guard')!.factor) * 100);
    expect(abilitiesVM(G)).toEqual([{ name: 'Escudo', desc: `Los ataques a distancia le aciertan un ${pct} % menos.` }]);
    settings.lang = 'en';
    expect(abilitiesVM(withAbility('zoneOfControl'))[0]!.desc).toContain('foot, vehicles');
    useRules({ ...DEFAULT_RULES, abilities: false });
    expect(abilitiesVM(G)).toEqual([]);
  });
});

describe('habilidades: explorador (scout)', () => {
  it('ve dentro del bosque en todo su radio; otra unidad solo desde al lado', () => {
    useRules({ ...DEFAULT_RULES, fog: true, forestHides: true, weather: false });
    const s = blankState();
    s.map[10]![14] = TerrainType.WOODS;
    const scout = newUnit(s, withAbility('scout'), 0, 10, 10);
    expect(visibility(s, 0)[10]![14]).toBe(true); // a 4 casillas, dentro de su vision
    scout.type = plain((t) => UNIT.vision[t]! >= UNIT.vision[withAbility('scout')]!);
    expect(visibility(s, 0)[10]![14]).toBe(false);
  });
});

describe('habilidades: captura rapida (quickCapture)', () => {
  it('resta un 50 % mas al capturar que una unidad igual sin la habilidad', () => {
    const s = blankState();
    const fast = newUnit(s, withAbility('quickCapture'), 0, 5, 5);
    const factor = (abilityOf(fast.type, 'quickCapture') as { factor: number }).factor;
    expect(captureStrength(fast)).toBe(Math.ceil(10 * factor));
    fast.life = 40;
    expect(captureStrength(fast)).toBe(Math.ceil(4 * factor));
    useRules({ ...DEFAULT_RULES, abilities: false });
    expect(captureStrength(fast)).toBe(4); // con la regla apagada, como cualquiera
  });
});
