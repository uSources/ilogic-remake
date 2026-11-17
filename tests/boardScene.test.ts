import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { GameState } from '@core/model';
import { boardScene, hitLookOf, woundedUnits, woundSmokeOf, type UnitLook } from '../src/view3d/systems/board/boardScene';
import { act, blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** El tablero tal como lo ve quien mira, sin navegador: niebla, lados, vida, quien ya jugo y capturas. */

const SOLDIER = unitTypeNamed('Soldier');

const lookOf = (s: GameState, uid: number): UnitLook | undefined => boardScene(s, PLAYER).units.find((look) => look.uid === uid);

describe('las unidades del tablero', () => {
  it('cada una, de su lado, con su forma de moverse y en su casilla', () => {
    const s = blankState({ fog: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    const foe = newUnit(s, unitTypeNamed('Tank'), ENEMY, { x: 3, y: 2 });
    expect(lookOf(s, mine.uid)).toMatchObject({ side: 'own', motion: 'march', pos: { x: 2, y: 2 }, isVisible: true });
    expect(lookOf(s, foe.uid)).toMatchObject({ side: 'enemy', motion: 'drive', type: 'Tank' });
  });

  it('con niebla, el enemigo lejos no se ve; el propio si', () => {
    const s = blankState({ fog: true, weather: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    const far = newUnit(s, SOLDIER, ENEMY, { x: 20, y: 20 });
    expect(lookOf(s, mine.uid)?.isVisible).toBe(true);
    expect(lookOf(s, far.uid)?.isVisible).toBe(false);
  });

  it('las que estan fuera del mapa (dentro de un transporte) no tienen pieza', () => {
    const s = blankState({ fog: false });
    const transport = newUnit(s, unitTypeNamed('Transport'), PLAYER, { x: 3, y: 2 });
    const carried = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    act(s, PLAYER, { kind: 'load', uid: carried.uid, into: transport.uid });
    expect(lookOf(s, carried.uid)).toBeUndefined();
  });

  it('la chapa de vida solo si esta herida, con su numero (nunca 0 mientras viva)', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    expect(lookOf(s, soldier.uid)).toMatchObject({ lifeLeft: null, lifeShown: null });
    soldier.life = 40;
    expect(lookOf(s, soldier.uid)?.lifeLeft).toBeCloseTo(0.4);
    expect(lookOf(s, soldier.uid)?.lifeShown).toBe(40);
    soldier.life = 0.3;
    expect(lookOf(s, soldier.uid)?.lifeShown).toBe(1);
  });

  it('la propia que ya ha hecho todo se ve oscurecida; la enemiga, nunca', () => {
    const s = blankState({ fog: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    const foe = newUnit(s, SOLDIER, ENEMY, { x: 6, y: 2 });
    expect(lookOf(s, mine.uid)?.isSpent).toBe(false);
    act(s, PLAYER, { kind: 'wait', uid: mine.uid });
    foe.turnState = 'done';
    expect(lookOf(s, mine.uid)?.isSpent).toBe(true);
    expect(lookOf(s, foe.uid)?.isSpent).toBe(false);
  });

  it('humo de las heridas: gris de la mitad para abajo, negro de un cuarto para abajo', () => {
    expect([100, 51, 50, 26, 25].map(woundSmokeOf)).toEqual([null, null, 'smoke', 'smoke', 'darkSmoke']);
    const s = blankState({ fog: false });
    const hurt = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    newUnit(s, SOLDIER, PLAYER, { x: 3, y: 2 });
    hurt.life = 20;
    expect(woundedUnits(s)).toEqual([{ uid: hurt.uid, smoke: 'darkSmoke' }]);
  });
});

describe('los edificios del tablero', () => {
  it('uno enemigo que no se ve, se ve de nadie (como en 2D)', () => {
    const s = blankState({ fog: true, weather: false });
    s.buildings.push({ type: 'City', owner: ENEMY, x: 20, y: 5, capture: null });
    const city = boardScene(s, PLAYER).buildings.find((look) => look.pos.x === 20 && look.pos.y === 5);
    expect(city?.side).toBe('neutral');
    s.buildings.push({ type: 'City', owner: PLAYER, x: 21, y: 5, capture: null });
    expect(boardScene(s, PLAYER).buildings.find((look) => look.pos.x === 21)?.side).toBe('own');
  });

  it('una captura a medias: lo que le queda, del lado de quien captura', () => {
    const s = blankState({ fog: false });
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    const before = boardScene(s, PLAYER).buildings.find((look) => look.pos.x === 5 && look.pos.y === 5);
    expect(before?.capture).toBeNull();
    act(s, PLAYER, { kind: 'capture', uid: soldier.uid });
    const city = boardScene(s, PLAYER).buildings.find((look) => look.pos.x === 5 && look.pos.y === 5);
    expect(city?.capture?.side).toBe('own');
    expect(city?.capture?.left).toBeGreaterThan(0);
    expect(city?.capture?.left).toBeLessThan(1);
    const points = s.buildings.find((building) => building.x === 5 && building.y === 5)?.capture?.left;
    expect(city?.capture?.points).toBe(Math.ceil(points ?? -1));
  });
});

describe('la letra de la orden', () => {
  it('las propias con orden llevan su letra; sin orden, ninguna', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    expect(lookOf(s, soldier.uid)?.orderLetter).toBeNull();
    act(s, PLAYER, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'attack', at: { x: 9, y: 9 } } });
    expect(lookOf(s, soldier.uid)?.orderLetter).toBe('A');
  });
});

describe('la barra del enemigo al que se apunta', () => {
  it('sin apuntar, nada', () => {
    expect(hitLookOf(blankState({ fog: false }), null)).toBeNull();
  });

  it('enseña su vida y la que le quedaria (de 0 a 1), aunque este entero', () => {
    const s = blankState({ fog: false });
    const attacker = newUnit(s, unitTypeNamed('Tank'), PLAYER, { x: 2, y: 2 });
    const target = newUnit(s, SOLDIER, ENEMY, { x: 3, y: 2 });
    const look = hitLookOf(s, { attacker, from: { x: 2, y: 2 }, target });
    expect(look).toMatchObject({ uid: target.uid, lifeLeft: 1 });
    expect(look!.lifeAfter).toBeGreaterThanOrEqual(0);
    expect(look!.lifeAfter).toBeLessThan(1);
  });
});
