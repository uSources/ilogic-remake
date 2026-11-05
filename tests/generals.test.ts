import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { readContentFiles, validateContent } from '@core/content';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { cloneState } from '@core/gameContent';
import { abilityBlock, chargeStars, generalHitFactor, newGeneral, useAbility } from '@core/generals';
import { seededRng } from '@core/geom';
import { attackFull, endRound, hitChance, newUnit, visibility } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/model';
import { blankState } from './helpers';

const { UNIT, UNIT_NAMES } = defaultContent().tables;

const unitType = (name: string) => UNIT_NAMES.indexOf(name);

function withBrisa(): GameState {
  const s = blankState(TEST_RULES);
  s.generals = [newGeneral(s, 'Brisa'), null];
  return s;
}

/** Reglas de las partidas de estos tests. */
const TEST_RULES = rulesWith(defaultContent(), { fog: true, weather: false });

describe('generales: datos', () => {
  it('generals.json es valido y Brisa existe', () => {
    expect(validateContent(readContentFiles())).toEqual([]);
    expect(defaultContent().files.generals.map((general) => general.id)).toContain('Brisa');
  });

  it('explica lo que esta mal', () => {
    const files = structuredClone(readContentFiles());
    const general = files.generals[0]!;
    general.passive.push({ kind: 'attack', factor: 1.2, units: ['Dragon'] });
    general.abilities[0]!.cost = 99;
    (general.abilities[1]!.effect as { kind: string }).kind = 'nuke';
    const errors = validateContent(files);
    expect(errors).toContain('general Brisa: passive.attack.units nombra "Dragon", que no existe');
    expect(errors.some((error) => error.includes('habilidad recon: cost'))).toBe(true);
    expect(errors.some((error) => error.includes('effect.kind "nuke" no existe'))).toBe(true);
  });
});

describe('generales: reglas', () => {
  it('ventaja fija: los aviones de Brisa aciertan +10 %, el resto igual', () => {
    const s = withBrisa();
    const plane = newUnit(s, unitType('Fighter'), 0, { x: 5, y: 5 });
    const tank = newUnit(s, unitType('Tank'), 0, { x: 6, y: 6 });
    const target = newUnit(s, unitType('Tank'), 1, { x: 5, y: 6 });
    expect(generalHitFactor(s, plane, target)).toBeCloseTo(1.1);
    expect(generalHitFactor(s, tank, target)).toBe(1);
    const without = cloneState(s);
    without.generals = undefined;
    expect(hitChance(s, plane, target)).toBeCloseTo(hitChance(without, plane, target) * 1.1);
  });

  it('la barra se carga con el daño hecho y recibido', () => {
    const s = withBrisa();
    const attacker = newUnit(s, unitType('Tank'), 0, { x: 5, y: 5 });
    const defender = newUnit(s, unitType('Tank'), 1, { x: 5, y: 6 });
    const result = attackFull(s, attacker, defender, seededRng(3));
    const value = ((result.damage + result.counter) * UNIT.cost[unitType('Tank')]!) / 100;
    expect(s.generals![0]!.charge).toBeCloseTo(value / 6000);
  });

  it('ataque aereo: 3x3, solo enemigos, no mata, gasta carga y una vez por turno', () => {
    const s = withBrisa();
    s.generals![0]!.charge = 6;
    const e1 = newUnit(s, unitType('Tank'), 1, { x: 10, y: 10 });
    const e2 = newUnit(s, unitType('Soldier'), 1, { x: 11, y: 11 });
    e2.life = 25;
    const far = newUnit(s, unitType('Tank'), 1, { x: 12, y: 10 });
    const mine = newUnit(s, unitType('Tank'), 0, { x: 9, y: 9 });
    expect(abilityBlock(s, 0, 'airstrike')).toBe('target');
    const event = useAbility(s, 0, 'airstrike', { x: 10, y: 10 })!;
    expect(e1.life).toBe(80);
    expect(e2.life).toBe(10); // no baja de minLife
    expect(far.life).toBe(100); // fuera del cuadrado
    expect(mine.life).toBe(100); // las propias no
    expect(event.hits).toEqual([
      { uid: e1.uid, damage: 20 },
      { uid: e2.uid, damage: 15 },
    ]);
    expect(chargeStars(s.generals![0]!)).toBe(0); // cuesta la barra entera (6)
    expect(abilityBlock(s, 0, 'recon')).toBe('used');
    endRound(s);
    expect(abilityBlock(s, 0, 'recon')).toBe('charge'); // nuevo turno, pero sin estrellas no llega
  });

  it('reconocimiento: ve todo el mapa hasta que acaba la ronda', () => {
    const s = withBrisa();
    newUnit(s, unitType('Soldier'), 0, { x: 1, y: 1 });
    s.generals![0]!.charge = 2;
    expect(visibility(s, 0).at({ x: 15, y: 15 })).toBe(false);
    useAbility(s, 0, 'recon');
    expect(visibility(s, 0).at({ x: 15, y: 15 })).toBe(true);
    expect(visibility(s, 1).at({ x: 15, y: 15 })).toBe(false); // el enemigo no
    endRound(s);
    expect(visibility(s, 0).at({ x: 15, y: 15 })).toBe(false);
  });

  it('sin general no pasa nada', () => {
    const s = blankState(TEST_RULES);
    expect(abilityBlock(s, 0, 'airstrike', { x: 1, y: 1 })).toBe('noGeneral');
    expect(useAbility(s, 0, 'airstrike', { x: 1, y: 1 })).toBeNull();
  });

  it('se guarda y se carga; un general que no existe se quita', () => {
    const s = withBrisa();
    newUnit(s, unitType('Soldier'), 0, { x: 1, y: 1 });
    s.generals![0]!.charge = 3.5;
    const back = deserialize(serialize(s), saveContext(defaultContent()))!;
    expect(back.generals).toEqual([{ id: 'Brisa', charge: 3.5, used: false, reveal: false }, null]);
    const bad = JSON.parse(serialize(s));
    bad.generals = [
      { id: 'Nadie', charge: 99 },
      { id: 'Brisa', charge: 99 },
    ];
    expect(deserialize(JSON.stringify(bad), saveContext(defaultContent()))!.generals).toEqual([
      null,
      { id: 'Brisa', charge: 6, used: false, reveal: false },
    ]);
  });
});
