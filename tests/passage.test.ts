import { describe, expect, it } from 'vitest';
import { settingsWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import {
  distanceMap,
  hooksOf,
  letsAlliesThrough,
  moveRulesOf,
  newUnit,
  passBlockers,
  stepAllowed,
  surroundingsOf,
  traverse,
} from '@core/rules';
import { MoveType } from '@core/content';
import { blankState, unitTypeNamed } from './helpers';

/** Por donde se pasa: las reglas de paso (las de los modulos; si ninguna dice nada, otra unidad cierra el paso) y la regla de cada paso (stepAllowed). */

const TANK = unitTypeNamed('Tank');
const SOLDIER = unitTypeNamed('Soldier');

describe('reglas de paso', () => {
  it('las ponen los modulos; si ninguna dice nada, otra unidad cierra el paso', () => {
    expect(hooksOf(blankState(), 'passRules').map((rule) => rule.id)).toEqual(['allies', 'unseenFoes']);
    const plain = blankState(settingsWith(defaultContent(), { passAllies: false, ambush: false }));
    expect(hooksOf(plain, 'passRules')).toEqual([]);
    const mover = newUnit(plain, TANK, 0, { x: 5, y: 10 });
    newUnit(plain, TANK, 0, { x: 6, y: 10 });
    expect(surroundingsOf(plain, mover).tiles.at({ x: 6, y: 10 })).toBe('blocked');
  });

  it('passBlockers: al medir, cortan el paso las unidades que las reglas dicen (con las de quien mide delante)', () => {
    const s = blankState({ fog: true, ambush: false, passAllies: true, forestHides: true });
    const mover = newUnit(s, TANK, 0, { x: 5, y: 10 });
    const ally = newUnit(s, TANK, 0, { x: 6, y: 10 });
    const hidden = newUnit(s, SOLDIER, 1, { x: 18, y: 18 });
    const seen = newUnit(s, SOLDIER, 1, { x: 5, y: 11 });
    expect(letsAlliesThrough(s)).toBe(true);
    const blocks = passBlockers(s, mover);
    expect([ally, hidden, seen].map((unit) => blocks(unit))).toEqual([false, true, true]);
    const notSeen = passBlockers(s, mover, [{ id: 'blind', passage: ({ sees }, other) => (sees(other) ? null : 'unnoticed') }]);
    expect([ally, hidden, seen].map((unit) => notSeen(unit))).toEqual([false, false, true]);
    expect(distanceMap(s, mover, MoveType.VEHICLE, blocks).at({ x: 7, y: 10 })).toBe(2);

    const closed = blankState({ fog: true, ambush: false, passAllies: false, forestHides: true });
    expect(letsAlliesThrough(closed)).toBe(false);
  });

  it('un aliado se atraviesa, un enemigo a la vista cierra el paso y uno escondido no se sabe que esta', () => {
    const s = blankState({ fog: true, forestHides: true });
    s.map[12]![10] = 'Woods';
    const mover = newUnit(s, TANK, 0, { x: 5, y: 10 });
    const ally = newUnit(s, TANK, 0, { x: 6, y: 10 });
    const seenFoe = newUnit(s, SOLDIER, 1, { x: 7, y: 10 });
    const hiddenFoe = newUnit(s, SOLDIER, 1, { x: 12, y: 10 });
    const { tiles } = surroundingsOf(s, mover);
    expect(tiles.at(ally)).toBe('passThrough');
    expect(tiles.at(seenFoe)).toBe('blocked');
    expect(tiles.at(hiddenFoe)).toBe('empty');
    expect(tiles.at({ x: 9, y: 10 })).toBe('empty');
  });

  it('sin emboscadas se sabe de todos los enemigos, y sin pasar entre aliados el aliado cierra el paso', () => {
    const s = blankState({ fog: true, ambush: false, passAllies: false, forestHides: true });
    s.map[12]![10] = 'Woods';
    const mover = newUnit(s, TANK, 0, { x: 5, y: 10 });
    const ally = newUnit(s, TANK, 0, { x: 6, y: 10 });
    const hiddenFoe = newUnit(s, SOLDIER, 1, { x: 12, y: 10 });
    const { tiles } = surroundingsOf(s, mover);
    expect(tiles.at(ally)).toBe('blocked');
    expect(tiles.at(hiddenFoe)).toBe('blocked');
  });
});

describe('stepAllowed: la regla de cada paso', () => {
  it('a una vecina libre, sin volver a la salida y sin pasarse de lo que puede gastar', () => {
    const s = blankState({ terrainCost: false });
    const mover = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const rules = moveRulesOf(s, mover);
    const budget = rules.profile.budget;
    expect(stepAllowed(rules, { from: { x: 5, y: 5 }, to: { x: 6, y: 5 }, spent: 0 })).toBe(true);
    expect(stepAllowed(rules, { from: { x: 5, y: 5 }, to: { x: 7, y: 5 }, spent: 0 })).toBe(false);
    expect(stepAllowed(rules, { from: { x: 6, y: 5 }, to: { x: 5, y: 5 }, spent: 1 })).toBe(false);
    expect(stepAllowed(rules, { from: { x: 6, y: 5 }, to: { x: 7, y: 5 }, spent: budget })).toBe(false);
  });

  it('a la casilla de otra unidad solo para entrar en ella (unirse o subir), no andando', () => {
    const s = blankState({ passAllies: false });
    const mover = newUnit(s, TANK, 0, { x: 5, y: 5 });
    newUnit(s, TANK, 0, { x: 6, y: 5 });
    const rules = moveRulesOf(s, mover);
    const step = { from: { x: 5, y: 5 }, to: { x: 6, y: 5 }, spent: 0 };
    expect(stepAllowed(rules, step)).toBe(false);
    expect(stepAllowed(rules, step, 'join')).toBe(true);
  });
});

describe('traverse: recorrer un camino de verdad', () => {
  const path = Array.from({ length: 5 }, (_, i) => ({ x: 5 + i, y: 10 }));

  it('sin nada que lo corte, la unidad llega al final y quien llama decide lo demas', () => {
    const s = blankState();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 10 });
    expect(traverse(s, unit, path)).toEqual({ path, interruption: null });
    expect(unit).toMatchObject({ x: 9, y: 10, turnState: 'ready' });
  });

  it('un enemigo en el camino lo corta: se para antes, sin quedarse sobre un aliado, y pierde el turno', () => {
    const s = blankState();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 10 });
    newUnit(s, TANK, 0, { x: 7, y: 10 });
    newUnit(s, SOLDIER, 1, { x: 8, y: 10 });
    expect(hooksOf(s, 'pathInterruptions').map((interruption) => interruption.kind)).toEqual(['ambush']);
    const traversal = traverse(s, unit, path);
    expect(traversal.interruption).toEqual({ kind: 'ambush', at: { x: 8, y: 10 } });
    expect(traversal.path).toEqual(path.slice(0, 2));
    expect(unit).toMatchObject({ x: 6, y: 10, turnState: 'done' });
  });
});
