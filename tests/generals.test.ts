import { beforeEach, describe, expect, it } from 'vitest';
import { readContentFiles, validateContent } from '@core/content';
import { DEFAULT_RULES, GENERALS, UNIT, UNIT_NAMES, useRules } from '@core/data';
import { abilityBlock, chargeStars, generalHitFactor, newGeneral, useAbility } from '@core/generals';
import { seededRng } from '@core/geom';
import { attackFull, endRound, hitChance, newUnit, visibility } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

const T = (n: string) => UNIT_NAMES.indexOf(n);

function withBrisa(): GameState {
  const s = blankState();
  s.generals = [newGeneral('Brisa'), null];
  return s;
}

beforeEach(() => useRules({ ...DEFAULT_RULES, fog: true, weather: false }));

describe('generales: datos', () => {
  it('generals.json es valido y Brisa existe', () => {
    expect(validateContent(readContentFiles())).toEqual([]);
    expect(GENERALS.map((g) => g.id)).toContain('Brisa');
  });

  it('explica lo que esta mal', () => {
    const c = structuredClone(readContentFiles());
    const g = c.generals[0]!;
    g.passive.push({ kind: 'attack', factor: 1.2, units: ['Dragon'] });
    g.abilities[0]!.cost = 99;
    (g.abilities[1]!.effect as { kind: string }).kind = 'nuke';
    const errs = validateContent(c);
    expect(errs).toContain('general Brisa: passive.attack.units nombra "Dragon", que no existe');
    expect(errs.some((e) => e.includes('habilidad recon: cost'))).toBe(true);
    expect(errs.some((e) => e.includes('effect.kind "nuke" no existe'))).toBe(true);
  });
});

describe('generales: reglas', () => {
  it('ventaja fija: los aviones de Brisa aciertan +10 %, el resto igual', () => {
    const s = withBrisa();
    const plane = newUnit(s, T('Fighter'), 0, 5, 5);
    const tank = newUnit(s, T('Tank'), 0, 6, 6);
    const target = newUnit(s, T('Tank'), 1, 5, 6);
    expect(generalHitFactor(s, plane, target)).toBeCloseTo(1.1);
    expect(generalHitFactor(s, tank, target)).toBe(1);
    const without = structuredClone(s);
    without.generals = undefined;
    expect(hitChance(s, plane, target)).toBeCloseTo(hitChance(without, plane, target) * 1.1);
  });

  it('la barra se carga con el daño hecho y recibido', () => {
    const s = withBrisa();
    const a = newUnit(s, T('Tank'), 0, 5, 5);
    const d = newUnit(s, T('Tank'), 1, 5, 6);
    const r = attackFull(s, a, d, seededRng(3));
    const value = ((r.damage + r.counter) * UNIT.cost[T('Tank')]!) / 100;
    expect(s.generals![0]!.charge).toBeCloseTo(value / 6000);
  });

  it('ataque aereo: 3x3, solo enemigos, no mata, gasta carga y una vez por turno', () => {
    const s = withBrisa();
    s.generals![0]!.charge = 6;
    const e1 = newUnit(s, T('Tank'), 1, 10, 10);
    const e2 = newUnit(s, T('Soldier'), 1, 11, 11);
    e2.life = 25;
    const far = newUnit(s, T('Tank'), 1, 12, 10);
    const mine = newUnit(s, T('Tank'), 0, 9, 9);
    expect(abilityBlock(s, 0, 'airstrike')).toBe('target');
    const ev = useAbility(s, 0, 'airstrike', { x: 10, y: 10 })!;
    expect(e1.life).toBe(80);
    expect(e2.life).toBe(10); // no baja de minLife
    expect(far.life).toBe(100); // fuera del cuadrado
    expect(mine.life).toBe(100); // las propias no
    expect(ev.hits).toEqual([
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
    newUnit(s, T('Soldier'), 0, 1, 1);
    s.generals![0]!.charge = 2;
    expect(visibility(s, 0)[15]![15]).toBe(false);
    useAbility(s, 0, 'recon');
    expect(visibility(s, 0)[15]![15]).toBe(true);
    expect(visibility(s, 1)[15]![15]).toBe(false); // el enemigo no
    endRound(s);
    expect(visibility(s, 0)[15]![15]).toBe(false);
  });

  it('sin general no pasa nada', () => {
    const s = blankState();
    expect(abilityBlock(s, 0, 'airstrike', { x: 1, y: 1 })).toBe('noGeneral');
    expect(useAbility(s, 0, 'airstrike', { x: 1, y: 1 })).toBeNull();
  });

  it('se guarda y se carga; un general que no existe se quita', () => {
    const s = withBrisa();
    newUnit(s, T('Soldier'), 0, 1, 1);
    s.generals![0]!.charge = 3.5;
    const back = deserialize(serialize(s))!;
    expect(back.generals).toEqual([{ id: 'Brisa', charge: 3.5, used: false, reveal: false }, null]);
    const bad = JSON.parse(serialize(s));
    bad.generals = [
      { id: 'Nadie', charge: 99 },
      { id: 'Brisa', charge: 99 },
    ];
    expect(deserialize(JSON.stringify(bad))!.generals).toEqual([null, { id: 'Brisa', charge: 6, used: false, reveal: false }]);
  });
});
