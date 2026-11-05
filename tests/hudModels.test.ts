import type Phaser from 'phaser';
import { beforeEach, describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { createLayer } from '@core/mapGrid';
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
import { blankState } from './helpers';

const { UNIT, UNIT_NAMES, BUILDING_NAMES, HQ, MAX_FUNDS, WEATHER } = defaultContent().tables;

/** Texturas de mentira: todas las imagenes "existen" (las fichas solo usan sus nombres). */
const textures = {
  exists: () => true,
  get: () => ({ has: () => true }),
  getFrame: () => null,
} as unknown as Phaser.Textures.TextureManager;
const unitType = (name: (typeof UNIT_NAMES)[number]) => UNIT_NAMES.indexOf(name);

beforeEach(() => {
  settings.lang = 'es';
});

describe('datos de la interfaz', () => {
  it('ficha de casilla: la unidad enemiga solo si se ve; el edificio sin dueño si no se ve', () => {
    const s = blankState();
    newUnit(s, unitType('Tank'), 1, { x: 4, y: 4 });
    s.buildings.push({ type: HQ, owner: 1, x: 4, y: 4, capture: null });
    const fog = createLayer(s, false);
    const hidden = tileVM(textures, s, { x: 4, y: 4 }, { vis: fog, hidden: new Set() });
    expect(hidden.unit).toBeUndefined();
    expect(hidden.building?.owner).toBe('unknown');
    const seen = tileVM(textures, s, { x: 4, y: 4 }, { vis: createLayer(s, true), hidden: new Set() });
    expect(seen.unit?.team).toBe(1);
    expect(seen.building?.owner).toBe('enemy');
    expect(seen.terrain.defense).toBeGreaterThan(0);
  });

  it('ficha: la unidad que se esta moviendo sale aunque su sprite este oculto', () => {
    const s = blankState();
    const unit = newUnit(s, unitType('Soldier'), 0, { x: 2, y: 2 });
    const vm = tileVM(textures, s, { x: 2, y: 2 }, { vis: createLayer(s, true), hidden: new Set([unit.uid]), selected: unit });
    expect(vm.unit?.name).toBeTruthy();
    expect(tileVM(textures, s, { x: 2, y: 2 }, { vis: createLayer(s, true), hidden: new Set([unit.uid]) }).unit).toBeUndefined();
  });

  it('textos: movimiento y alcance, puntos de captura', () => {
    expect(unitStatsText(blankState(), unitType('Soldier'))).toMatch(/\d.*·/);
    expect(unitStatsText(blankState(), unitType('Transport'))).not.toMatch(/–/);
    const s = blankState();
    const unit = newUnit(s, unitType('Soldier'), 0, { x: 3, y: 3 });
    expect(captureHintText(s, unit)).toBeUndefined();
    s.buildings.push({ type: 0, owner: 1, x: 3, y: 3, capture: null });
    expect(captureHintText(s, unit)).toMatch(/^\d+→\d+$/);
  });

  it('minimapa: oculta las unidades enemigas que no se ven y las que se estan animando', () => {
    const s = blankState();
    const mine = newUnit(s, unitType('Soldier'), 0, { x: 1, y: 1 });
    newUnit(s, unitType('Soldier'), 1, { x: 9, y: 9 });
    const vis = createLayer(s, false);
    vis.set({ x: 1, y: 1 }, true);
    expect(minimapVM([], s, vis, new Set()).units).toEqual([{ x: 1, y: 1, team: 0 }]);
    expect(minimapVM([], s, vis, new Set([mine.uid])).units).toEqual([]);
  });
});

describe('clima en la barra de arriba', () => {
  const weatherIndex = (id: string) => WEATHER.ids.indexOf(id);

  it('resume los efectos de cada clima', () => {
    expect(weatherEffectsText(blankState(), weatherIndex('Clear'))).toBe('Sin efectos');
    expect(weatherEffectsText(blankState(), weatherIndex('Rain'))).toBe('Vehículos −1 mov. · Visión −1 · Puntería −10 %');
    expect(weatherEffectsText(blankState(), weatherIndex('Snow'))).toBe('Infantería/Vehículos/Anfibios −1 mov. · Visión −1');
    settings.lang = 'en';
    expect(weatherEffectsText(blankState(), weatherIndex('Storm'))).toBe('Aircraft −2 move · Vision −2 · Aim −15 %');
  });

  it('enseña el clima de hoy y el pronostico solo si cambia mañana', () => {
    const s = blankState();
    s.weather = { kind: weatherIndex('Rain'), left: 2, next: weatherIndex('Clear') };
    expect(weatherVM(s)).toMatchObject({ id: 'Rain', name: 'Lluvia', next: null });
    s.weather.left = 1;
    expect(weatherVM(s)!.next).toBe('Despejado');
  });

  it('sin la regla no hay indicador', () => {
    expect(weatherVM(blankState(rulesWith(defaultContent(), { weather: false })))).toBeNull();
  });
});

describe('panel de combate', () => {
  const icons = { attacker: 'a', defender: 'd' };
  const both = { attacker: true, defender: true };

  it('las vidas bajan por etapas y tu unidad sale a la izquierda', () => {
    const s = blankState();
    const enemy = newUnit(s, unitType('Tank'), 1, { x: 10, y: 10 });
    const mine = newUnit(s, unitType('Tank'), 0, { x: 10, y: 11 });
    const event = attackEvent(s, enemy, mine, () => 0.5);
    const start = combatVM(blankState(), event, 'start', icons, both)!;
    expect(start.left.team).toBe(0);
    expect(start.left.role).toBe('defender');
    expect(start.right.role).toBe('attacker');
    expect(start.left.life).toBe(100);
    expect(start.left.hurt).toBeNull();
    const hit = combatVM(blankState(), event, 'hit', icons, both)!;
    expect(hit.left.life).toBe(100 - event.damage);
    expect(hit.left.hurt).toBe(event.damage);
    expect(hit.right.life).toBe(100);
    expect(hit.counter).toBe(true);
    const counter = combatVM(blankState(), event, 'counter', icons, both)!;
    expect(counter.right.life).toBe(100 - event.counter!);
    expect(counter.right.hurt).toBe(event.counter);
  });

  it('una unidad en la niebla no se delata', () => {
    const s = blankState();
    const art = newUnit(s, unitType('Artillery'), 1, { x: 10, y: 10 });
    const mine = newUnit(s, unitType('Soldier'), 0, { x: 10, y: 13 });
    const event = attackEvent(s, art, mine, () => 0.5);
    const vm = combatVM(blankState(), event, 'hit', icons, { attacker: false, defender: true })!;
    expect(vm.right).toMatchObject({ name: '???', icon: null, hit: null, rank: 0 });
    expect(vm.left.icon).toBe('d');
    expect(vm.counter).toBe(false);
  });

  it('marca la unidad destruida', () => {
    const s = blankState();
    const attacker = newUnit(s, unitType('Tank'), 0, { x: 10, y: 10 });
    const defender = newUnit(s, unitType('Soldier'), 1, { x: 10, y: 11 });
    defender.life = 1;
    const vm = combatVM(
      blankState(),
      attackEvent(s, attacker, defender, () => 0.5),
      'hit',
      icons,
      both,
    )!;
    expect(vm.right).toMatchObject({ life: 0, ko: true });
    expect(vm.counter).toBe(false);
  });

  it('eventos antiguos sin datos: sin panel', () => {
    expect(
      combatVM(blankState(), { kind: 'attack', attacker: 1, target: { x: 0, y: 0 }, damage: 5, killed: false }, 'hit', icons, both),
    ).toBeNull();
  });
});

describe('desglose de la barra de arriba', () => {
  const buildingType = (name: string) => BUILDING_NAMES.indexOf(name);
  const army = () => {
    const s = blankState();
    s.funds = [5000, 5000];
    for (const [index, buildingName] of ['City', 'City', 'Factory', 'Oil'].entries())
      s.buildings.push({ type: buildingType(buildingName), owner: 0, x: 1 + index, y: 1, capture: null });
    s.buildings.push({ type: buildingType('City'), owner: 1, x: 9, y: 9, capture: null });
    newUnit(s, unitType('Tank'), 0, { x: 5, y: 5 });
    newUnit(s, unitType('Soldier'), 0, { x: 6, y: 5 });
    newUnit(s, unitType('Soldier'), 0, { x: 7, y: 5 });
    newUnit(s, unitType('Bomber'), 1, { x: 9, y: 8 });
    return s;
  };

  it('ingresos por tipo de edificio y mantenimiento por tipo de unidad, con las cuentas de endRound', () => {
    const s = army();
    s.rules = rulesWith(defaultContent(), { upkeep: 0.1, commandPoints: 30 });
    const economy = economyVM(s, 0);
    expect(economy.income.lines.map((line) => [line.label, line.count])).toEqual([
      ['Ciudad', 2],
      ['Fábrica', 1],
      ['Pozo de petróleo', 1],
    ]);
    expect(economy.income.total).toBe(economy.income.lines.reduce((sum, line) => sum + line.amount, 0));
    expect(economy.upkeep!.lines.find((line) => line.label === 'Soldado')!.count).toBe(2);
    // El enemigo no cuenta
    expect(economy.upkeep!.lines.some((line) => line.label === 'Bombardero')).toBe(false);
    expect(economy.net).toBe(economy.income.total - economy.upkeep!.total);
    const next = economy.next;
    endRound(s);
    expect(s.funds[0]).toBe(next); // lo que dice el desglose es lo que pasa
    expect(economy.commandPoints!.used).toBe(UNIT.command[unitType('Tank')]! + 2 * UNIT.command[unitType('Soldier')]!);
    expect(economy.commandPoints!.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(economy.commandPoints!.used);
  });

  it('si no llega para el mantenimiento, avisa de lo que se paga', () => {
    const s = army();
    s.rules = rulesWith(defaultContent(), { upkeep: 1 });
    s.funds[0] = 0;
    s.buildings = s.buildings.filter((building) => building.owner !== 0);
    const economy = economyVM(s, 0);
    expect(economy.income.total).toBe(0);
    expect(economy.shortfall).toBe(0);
    expect(economy.next).toBe(0);
  });

  it('sin las reglas de mantenimiento y mando no salen esos apartados; el tope de dinero cuenta', () => {
    const s = army();
    s.rules = rulesWith(defaultContent(), { upkeep: 0, commandPoints: null });
    s.funds[0] = MAX_FUNDS;
    const economy = economyVM(s, 0);
    expect(economy.upkeep).toBeNull();
    expect(economy.commandPoints).toBeNull();
    expect(economy.next).toBe(MAX_FUNDS);
  });

  it('dia: lo que queda y los puntos solo con limite de dias', () => {
    const s = army();
    s.day = 18;
    s.rules = rulesWith(defaultContent(), { dayLimit: null });
    expect(dayInfoVM(s)).toEqual({ day: 18, limit: null, left: null, score: null });
    s.rules = rulesWith(defaultContent(), { dayLimit: 20 });
    expect(dayInfoVM(s)).toEqual({ day: 18, limit: 20, left: 3, score: [score(s, 0), score(s, 1)] });
  });
});
