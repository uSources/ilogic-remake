import type Phaser from 'phaser';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, HQ, UNIT_NAMES, useRules } from '@core/data';
import { grid } from '@core/geom';
import { attackEvent, newUnit } from '@core/rules';
import { settings } from '../src/settings';
import { captureHintText, combatVM, minimapVM, tileVM, unitStatsText } from '../src/ui/hudModels';
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

describe('panel de combate', () => {
  const icons = { attacker: 'a', defender: 'd' };
  const both = { attacker: true, defender: true };

  it('las vidas bajan por etapas y tu unidad sale a la izquierda', () => {
    const s = blankState();
    const enemy = newUnit(s, T('Tank'), 1, 10, 10);
    const mine = newUnit(s, T('Tank'), 0, 10, 11);
    const ev = attackEvent(s, enemy, mine, () => 0.5);
    const start = combatVM(ev, 'start', icons, both)!;
    expect(start.left.team).toBe(0);
    expect(start.left.role).toBe('defender');
    expect(start.right.role).toBe('attacker');
    expect(start.left.life).toBe(100);
    expect(start.left.hurt).toBeNull();
    const hit = combatVM(ev, 'hit', icons, both)!;
    expect(hit.left.life).toBe(100 - ev.damage);
    expect(hit.left.hurt).toBe(ev.damage);
    expect(hit.right.life).toBe(100);
    expect(hit.counter).toBe(true);
    const counter = combatVM(ev, 'counter', icons, both)!;
    expect(counter.right.life).toBe(100 - ev.counter!);
    expect(counter.right.hurt).toBe(ev.counter);
  });

  it('una unidad en la niebla no se delata', () => {
    const s = blankState();
    const art = newUnit(s, T('Artillery'), 1, 10, 10);
    const mine = newUnit(s, T('Soldier'), 0, 10, 13);
    const ev = attackEvent(s, art, mine, () => 0.5);
    const vm = combatVM(ev, 'hit', icons, { attacker: false, defender: true })!;
    expect(vm.right).toMatchObject({ name: '???', icon: null, hit: null, rank: 0 });
    expect(vm.left.icon).toBe('d');
    expect(vm.counter).toBe(false);
  });

  it('marca la unidad destruida', () => {
    const s = blankState();
    const a = newUnit(s, T('Tank'), 0, 10, 10);
    const d = newUnit(s, T('Soldier'), 1, 10, 11);
    d.life = 1;
    const vm = combatVM(
      attackEvent(s, a, d, () => 0.5),
      'hit',
      icons,
      both,
    )!;
    expect(vm.right).toMatchObject({ life: 0, ko: true });
    expect(vm.counter).toBe(false);
  });

  it('eventos antiguos sin datos: sin panel', () => {
    expect(combatVM({ kind: 'attack', attacker: 1, target: { x: 0, y: 0 }, damage: 5, killed: false }, 'hit', icons, both)).toBeNull();
  });
});
