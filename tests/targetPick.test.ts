import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { moveRange } from '@core/rules';
import { pointAt, pointedTarget, startPick, stepPick, targetEntries } from '../src/view3d/systems/turn/targetPick';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** Elegir a quien atacar tras «Atacar» en el bocadillo de la unidad (tablero 9 del lienzo «Todo en estilo C»). */

const SOLDIER = unitTypeNamed('Soldier');

/** Un soldado propio en (5,5) y enemigos en esas casillas. */
function soldierAmong(...enemies: { x: number; y: number }[]) {
  const s = blankState();
  const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
  const foes = enemies.map((at) => newUnit(s, SOLDIER, ENEMY, at));
  return { s, soldier, foes, range: moveRange(s, soldier) };
}

describe('elegir a quien atacar', () => {
  it('los enemigos a tiro, del mas cercano al mas lejano, con el primero señalado', () => {
    const { s, soldier, foes, range } = soldierAmong({ x: 5, y: 8 }, { x: 7, y: 5 }, { x: 30, y: 30 });
    const pick = startPick(s, soldier, range);
    expect(pick?.targets.map((target) => target.uid)).toEqual([foes[1]!.uid, foes[0]!.uid]);
    expect(pick && pointedTarget(pick)?.uid).toBe(foes[1]!.uid);
  });

  it('a igual distancia, de arriba abajo y de izquierda a derecha del mapa', () => {
    const { s, soldier, foes, range } = soldierAmong({ x: 7, y: 5 }, { x: 5, y: 3 }, { x: 3, y: 5 });
    const pick = startPick(s, soldier, range);
    expect(pick?.targets.map((target) => target.uid)).toEqual([foes[1]!.uid, foes[2]!.uid, foes[0]!.uid]);
  });

  it('sin enemigos a tiro no hay nada que elegir', () => {
    const { s, soldier, range } = soldierAmong({ x: 30, y: 30 });
    expect(startPick(s, soldier, range)).toBeNull();
  });

  it('← → pasan al siguiente o al anterior y dan la vuelta al llegar al final', () => {
    const { s, soldier, range } = soldierAmong({ x: 7, y: 5 }, { x: 5, y: 8 });
    const pick = startPick(s, soldier, range)!;
    expect(stepPick(pick, 1).pointed).toBe(1);
    expect(stepPick(stepPick(pick, 1), 1).pointed).toBe(0);
    expect(stepPick(pick, -1).pointed).toBe(1);
  });

  it('pasar el raton por un enemigo a tiro lo señala; por otra casilla, sigue el que estaba', () => {
    const { s, soldier, foes, range } = soldierAmong({ x: 7, y: 5 }, { x: 5, y: 8 });
    const pick = startPick(s, soldier, range)!;
    expect(pointedTarget(pointAt(pick, foes[1]!))?.uid).toBe(foes[1]!.uid);
    expect(pointAt(pick, { x: 20, y: 20 })).toBe(pick);
  });

  it('«Otro objetivo» solo sale si hay mas de uno', () => {
    const one = soldierAmong({ x: 7, y: 5 });
    const two = soldierAmong({ x: 7, y: 5 }, { x: 5, y: 8 });
    expect(targetEntries(startPick(one.s, one.soldier, one.range)!)).toEqual(['attack', 'back']);
    expect(targetEntries(startPick(two.s, two.soldier, two.range)!)).toEqual(['attack', 'nextTarget', 'back']);
  });
});
