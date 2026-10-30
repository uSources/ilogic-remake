import type Phaser from 'phaser';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, HQ, UNIT_NAMES, useRules } from '@core/data';
import { grid } from '@core/geom';
import { newUnit } from '@core/rules';
import { settings } from '../src/settings';
import { captureHintText, minimapVM, tileVM, unitStatsText } from '../src/ui/hudModels';
import { blankState } from './helpers';

/** Texturas de mentira: todas las imagenes "existen" (las fichas solo usan sus nombres). */
const textures = {
  exists: () => true,
  get: () => ({ has: () => true }),
  getFrame: () => null,
} as unknown as Phaser.Textures.TextureManager;
const T = (n: (typeof UNIT_NAMES)[number]) => UNIT_NAMES.indexOf(n);

beforeEach(() => {
  useRules(DEFAULT_RULES);
  settings.lang = 'es';
});

describe('datos de la interfaz', () => {
  it('ficha de casilla: la unidad enemiga solo si se ve; el edificio sin dueño si no se ve', () => {
    const s = blankState();
    newUnit(s, T('Tank'), 1, 4, 4);
    s.buildings.push({ type: HQ, owner: 1, x: 4, y: 4, capture: null });
    const fog = grid(false);
    const hidden = tileVM(textures, s, { x: 4, y: 4 }, { vis: fog, hidden: new Set() });
    expect(hidden.unit).toBeUndefined();
    expect(hidden.building?.owner).toBe('unknown');
    const seen = tileVM(textures, s, { x: 4, y: 4 }, { vis: grid(true), hidden: new Set() });
    expect(seen.unit?.team).toBe(1);
    expect(seen.building?.owner).toBe('enemy');
    expect(seen.terrain.defense).toBeGreaterThan(0);
  });

  it('ficha: la unidad que se esta moviendo sale aunque su sprite este oculto', () => {
    const s = blankState();
    const u = newUnit(s, T('Soldier'), 0, 2, 2);
    const vm = tileVM(textures, s, { x: 2, y: 2 }, { vis: grid(true), hidden: new Set([u.uid]), selected: u });
    expect(vm.unit?.name).toBeTruthy();
    expect(tileVM(textures, s, { x: 2, y: 2 }, { vis: grid(true), hidden: new Set([u.uid]) }).unit).toBeUndefined();
  });

  it('textos: movimiento y alcance, puntos de captura', () => {
    expect(unitStatsText(T('Soldier'))).toMatch(/\d.*·/);
    expect(unitStatsText(T('Transport'))).not.toMatch(/–/);
    const s = blankState();
    const u = newUnit(s, T('Soldier'), 0, 3, 3);
    expect(captureHintText(s, u)).toBeUndefined();
    s.buildings.push({ type: 0, owner: 1, x: 3, y: 3, capture: null });
    expect(captureHintText(s, u)).toMatch(/^\d+→\d+$/);
  });

  it('minimapa: oculta las unidades enemigas que no se ven y las que se estan animando', () => {
    const s = blankState();
    const mine = newUnit(s, T('Soldier'), 0, 1, 1);
    newUnit(s, T('Soldier'), 1, 9, 9);
    const vis = grid(false);
    vis[1]![1] = true;
    expect(minimapVM([], s, vis, new Set()).units).toEqual([{ x: 1, y: 1, team: 0 }]);
    expect(minimapVM([], s, vis, new Set([mine.uid])).units).toEqual([]);
  });
});
