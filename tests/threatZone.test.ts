import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { canDamage } from '@core/rules';
import type { GameSession } from '@core/session';
import { ThreatZone, threatLinesTo, threatTiles } from '../src/view3d/systems/threat/threatZone';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** «Ver amenaza»: a donde puede disparar algun enemigo que quien mira ve. */

const SOLDIER = unitTypeNamed('Soldier');

describe('amenaza enemiga', () => {
  it('un enemigo que se ve amenaza su casilla y las de alrededor', () => {
    const s = blankState({ fog: false });
    newUnit(s, SOLDIER, ENEMY, { x: 10, y: 10 });
    const tiles = threatTiles(s, PLAYER);
    expect(tiles).toContainEqual({ x: 10, y: 11 });
    expect(tiles).not.toContainEqual({ x: 25, y: 25 });
  });

  it('los enemigos en la niebla no se delatan', () => {
    const s = blankState({ fog: true });
    newUnit(s, SOLDIER, PLAYER, { x: 1, y: 1 });
    newUnit(s, SOLDIER, ENEMY, { x: 20, y: 20 });
    expect(threatTiles(s, PLAYER)).toEqual([]);
  });
});

describe('quien podria atacar a una unidad propia', () => {
  it('una linea desde cada enemigo que se ve y que llega a ella en su turno', () => {
    const s = blankState({ fog: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 10, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 12, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 30, y: 30 });
    expect(threatLinesTo(s, PLAYER, mine)).toEqual([{ from: { x: 12, y: 10 }, to: { x: 10, y: 10 } }]);
  });

  it('ni los que estan en la niebla ni los que no le pueden hacer daño', () => {
    const s = blankState({ fog: true });
    const plane = newUnit(s, unitTypeNamed('Fighter'), PLAYER, { x: 10, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 11, y: 10 });
    expect(canDamage(s, s.units[1]!, plane)).toBe(false);
    expect(threatLinesTo(s, PLAYER, plane)).toEqual([]);
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 1, y: 1 });
    newUnit(s, SOLDIER, ENEMY, { x: 28, y: 28 });
    expect(threatLinesTo(s, PLAYER, soldier)).toEqual([]);
  });

  it('se enseñan al mirar una unidad propia y se van al dejar de mirarla (las enemigas no)', () => {
    const s = blankState({ fog: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 10, y: 10 });
    const foe = newUnit(s, SOLDIER, ENEMY, { x: 11, y: 10 });
    const shown: unknown[][] = [];
    const marks = { showThreat: () => {}, showThreatLines: (lines: readonly unknown[]) => void shown.push([...lines]) };
    const zone = new ThreatZone({ session: { state: s } as GameSession, viewer: PLAYER, marks });
    zone.focus(mine);
    expect(shown.at(-1)).toHaveLength(1);
    zone.focus(foe);
    expect(shown.at(-1)).toEqual([]);
  });
});
