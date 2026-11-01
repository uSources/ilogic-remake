import type Phaser from 'phaser';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING_NAMES, DEFAULT_RULES, HQ, MAX_FUNDS, UNIT, UNIT_NAMES, useRules } from '@core/data';
import { grid } from '@core/geom';
import { attackEvent, endRound, newUnit, score } from '@core/rules';
import { settings } from '../src/settings';
import {
  captureHintText,
  combatVM,
  dayInfoVM,
  economyVM,
  minimapVM,
  tileVM,
  unitStatsText,
  weatherEffectsText,
  weatherVM,
} from '../src/ui/hudModels';
import { WEATHER } from '@core/data';
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

describe('clima en la barra de arriba', () => {
  const W = (id: string) => WEATHER.ids.indexOf(id);

  it('resume los efectos de cada clima', () => {
    expect(weatherEffectsText(W('Clear'))).toBe('Sin efectos');
    expect(weatherEffectsText(W('Rain'))).toBe('Vehículos −1 mov. · Visión −1 · Puntería −10 %');
    expect(weatherEffectsText(W('Snow'))).toBe('Infantería/Vehículos/Anfibios −1 mov. · Visión −1');
    settings.lang = 'en';
    expect(weatherEffectsText(W('Storm'))).toBe('Aircraft −2 move · Vision −2 · Aim −15 %');
  });

  it('enseña el clima de hoy y el pronostico solo si cambia mañana', () => {
    const s = blankState();
    s.weather = { kind: W('Rain'), left: 2, next: W('Clear') };
    expect(weatherVM(s)).toMatchObject({ id: 'Rain', name: 'Lluvia', next: null });
    s.weather.left = 1;
    expect(weatherVM(s)!.next).toBe('Despejado');
  });

  it('sin la regla no hay indicador', () => {
    useRules({ ...DEFAULT_RULES, weather: false });
    expect(weatherVM(blankState())).toBeNull();
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

describe('desglose de la barra de arriba', () => {
  const B = (n: string) => BUILDING_NAMES.indexOf(n);
  const army = () => {
    const s = blankState();
    s.funds = [5000, 5000];
    for (const [i, b] of ['City', 'City', 'Factory', 'Oil'].entries())
      s.buildings.push({ type: B(b), owner: 0, x: 1 + i, y: 1, capture: null });
    s.buildings.push({ type: B('City'), owner: 1, x: 9, y: 9, capture: null });
    newUnit(s, T('Tank'), 0, 5, 5);
    newUnit(s, T('Soldier'), 0, 6, 5);
    newUnit(s, T('Soldier'), 0, 7, 5);
    newUnit(s, T('Bomber'), 1, 9, 8);
    return s;
  };

  it('ingresos por tipo de edificio y mantenimiento por tipo de unidad, con las cuentas de endRound', () => {
    useRules({ upkeep: 0.1, commandPoints: 30 });
    const s = army();
    const e = economyVM(s, 0);
    expect(e.income.lines.map((l) => [l.label, l.count])).toEqual([
      ['Ciudad', 2],
      ['Fábrica', 1],
      ['Pozo de petróleo', 1],
    ]);
    expect(e.income.total).toBe(e.income.lines.reduce((n, l) => n + l.amount, 0));
    expect(e.upkeep!.lines.find((l) => l.label === 'Soldado')!.count).toBe(2);
    // El enemigo no cuenta
    expect(e.upkeep!.lines.some((l) => l.label === 'Bombardero')).toBe(false);
    expect(e.net).toBe(e.income.total - e.upkeep!.total);
    const next = e.next;
    endRound(s);
    expect(s.funds[0]).toBe(next); // lo que dice el desglose es lo que pasa
    expect(e.command!.used).toBe(UNIT.command[T('Tank')]! + 2 * UNIT.command[T('Soldier')]!);
    expect(e.command!.lines.reduce((n, l) => n + l.amount, 0)).toBe(e.command!.used);
  });

  it('si no llega para el mantenimiento, avisa de lo que se paga', () => {
    useRules({ upkeep: 1 });
    const s = army();
    s.funds[0] = 0;
    s.buildings = s.buildings.filter((b) => b.owner !== 0);
    const e = economyVM(s, 0);
    expect(e.income.total).toBe(0);
    expect(e.shortfall).toBe(0);
    expect(e.next).toBe(0);
  });

  it('sin las reglas de mantenimiento y mando no salen esos apartados; el tope de dinero cuenta', () => {
    useRules({ upkeep: 0, commandPoints: null });
    const s = army();
    s.funds[0] = MAX_FUNDS;
    const e = economyVM(s, 0);
    expect(e.upkeep).toBeNull();
    expect(e.command).toBeNull();
    expect(e.next).toBe(MAX_FUNDS);
  });

  it('dia: lo que queda y los puntos solo con limite de dias', () => {
    const s = army();
    s.day = 18;
    useRules({ dayLimit: null });
    expect(dayInfoVM(s)).toEqual({ day: 18, limit: null, left: null, score: null });
    useRules({ dayLimit: 20 });
    expect(dayInfoVM(s)).toEqual({ day: 18, limit: 20, left: 3, score: [score(s, 0), score(s, 1)] });
  });
});
