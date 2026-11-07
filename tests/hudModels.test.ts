import { entryOf } from '@core/content';
import { changeSettings } from '@core/gameState';
import type Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settingsWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import { createLayer } from '@core/mapGrid';
import { score } from '@core/rules';
import { endRound } from '@core/rules/round';
import { newUnit } from '@core/measure';
import { settings } from '../src/settings';
import {
  armyChartVM,
  captureHintText,
  combatVM,
  endScoreVM,
  endStatsVM,
  dayInfoVM,
  economyVM,
  minimapVM,
  tileVM,
  unitStatsText,
  weatherEffectsText,
  weatherVM,
} from '../src/ui/hudModels';
import { blankState, diceFrom, hqId, unitTypeNamed, fight, withoutHeadquarters } from './helpers';
import { ownerSideOf, sideColor, sideLetter, sideOf, sidePaint, unitSideLetter } from '../src/ui/sides';
import { PAL } from '../src/ui/palette';
import { teamState } from '@core/teams';

const HQ = hqId();
const MAX_FUNDS = defaultContent().maxFunds;

/** Texturas de mentira: todas las imagenes "existen" (las fichas solo usan sus nombres). */
const textures = {
  exists: () => true,
  get: () => ({ has: () => true }),
  getFrame: () => null,
} as unknown as Phaser.Textures.TextureManager;
const unitType = unitTypeNamed;

beforeEach(() => {
  settings.lang = 'es';
});
// Sin aislar los ficheros (isolate: false): el idioma vuelve a ser el de siempre para los demas.
afterEach(() => {
  settings.lang = 'es';
});

describe('datos de la interfaz', () => {
  it('ficha de casilla: la unidad enemiga solo si se ve; el edificio sin dueño si no se ve', () => {
    const s = blankState();
    newUnit(s, unitType('Tank'), 1, { x: 4, y: 4 });
    s.buildings.push({ type: HQ, owner: 1, x: 4, y: 4, capture: null });
    const fog = createLayer(s, false);
    const hidden = tileVM(textures, s, { x: 4, y: 4 }, { viewer: 0, vis: fog, hidden: new Set() });
    expect(hidden.unit).toBeUndefined();
    expect(hidden.building?.owner).toBe('unknown');
    const seen = tileVM(textures, s, { x: 4, y: 4 }, { viewer: 0, vis: createLayer(s, true), hidden: new Set() });
    expect(seen.unit?.side).toBe('enemy');
    expect(seen.building?.owner).toBe('enemy');
    expect(seen.terrain.defense).toBeGreaterThan(0);
  });

  it('ficha: la unidad que se esta moviendo sale aunque su sprite este oculto', () => {
    const s = blankState();
    const unit = newUnit(s, unitType('Soldier'), 0, { x: 2, y: 2 });
    const vm = tileVM(textures, s, { x: 2, y: 2 }, { viewer: 0, vis: createLayer(s, true), hidden: new Set([unit.uid]), selected: unit });
    expect(vm.unit?.name).toBeTruthy();
    expect(tileVM(textures, s, { x: 2, y: 2 }, { viewer: 0, vis: createLayer(s, true), hidden: new Set([unit.uid]) }).unit).toBeUndefined();
  });

  it('textos: movimiento y alcance, puntos de captura', () => {
    expect(unitStatsText(unitType('Soldier'))).toMatch(/\d.*·/);
    expect(unitStatsText(unitType('Transport'))).not.toMatch(/–/);
    const s = blankState();
    const unit = newUnit(s, unitType('Soldier'), 0, { x: 3, y: 3 });
    expect(captureHintText(s, unit)).toBeUndefined();
    s.buildings.push({ type: 'City', owner: 1, x: 3, y: 3, capture: null });
    expect(captureHintText(s, unit)).toMatch(/^\d+→\d+$/);
  });

  it('minimapa: oculta las unidades enemigas que no se ven y las que se estan animando', () => {
    const s = blankState();
    const mine = newUnit(s, unitType('Soldier'), 0, { x: 1, y: 1 });
    newUnit(s, unitType('Soldier'), 1, { x: 9, y: 9 });
    const vis = createLayer(s, false);
    vis.set({ x: 1, y: 1 }, true);
    expect(minimapVM({}, s, { viewer: 0, vis, hidden: new Set() }).units).toEqual([{ x: 1, y: 1, side: 'own' }]);
    expect(minimapVM({}, s, { viewer: 0, vis, hidden: new Set([mine.uid]) }).units).toEqual([]);
  });
});

describe('clima en la barra de arriba', () => {
  const weatherNamed = (id: string) => entryOf(defaultContent().weather, id, 'clima');

  it('resume los efectos de cada clima', () => {
    expect(weatherEffectsText(weatherNamed('Clear'))).toBe('Sin efectos');
    expect(weatherEffectsText(weatherNamed('Rain'))).toBe('Vehículos −1 mov. · Visión −1 · Puntería −10 %');
    expect(weatherEffectsText(weatherNamed('Snow'))).toBe('Infantería/Vehículos/Anfibios −1 mov. · Visión −1');
    settings.lang = 'en';
    expect(weatherEffectsText(weatherNamed('Storm'))).toBe('Aircraft −2 move · Vision −2 · Aim −15 %');
  });

  it('enseña el clima de hoy y el pronostico solo si cambia mañana', () => {
    const s = blankState();
    s.weather = { kind: 'Rain', left: 2, next: 'Clear' };
    expect(weatherVM(s)).toMatchObject({ id: 'Rain', name: 'Lluvia', next: null });
    s.weather.left = 1;
    expect(weatherVM(s)!.next).toBe('Despejado');
  });

  it('sin la regla no hay indicador', () => {
    expect(weatherVM(blankState(settingsWith(defaultContent(), { weather: false })))).toBeNull();
  });
});

describe('panel de combate', () => {
  const icons = { attacker: 'a', defender: 'd' };
  const both = { attacker: true, defender: true };

  it('las vidas bajan por etapas y tu unidad sale a la izquierda', () => {
    const s = blankState();
    const enemy = newUnit(s, unitType('Tank'), 1, { x: 10, y: 10 });
    const mine = newUnit(s, unitType('Tank'), 0, { x: 10, y: 11 });
    const event = fight(
      s,
      enemy,
      mine,
      diceFrom(() => 0.5),
    );
    const start = combatVM(blankState(), 0, event, 'start', icons, both);
    expect(start.left.side).toBe('own');
    expect(start.left.role).toBe('defender');
    expect(start.right.role).toBe('attacker');
    expect(start.left.life).toBe(100);
    expect(start.left.hurt).toBeNull();
    const hit = combatVM(blankState(), 0, event, 'hit', icons, both);
    expect(hit.left.life).toBe(100 - event.damage);
    expect(hit.left.hurt).toBe(event.damage);
    expect(hit.right.life).toBe(100);
    expect(hit.counter).toBe(true);
    const counter = combatVM(blankState(), 0, event, 'counter', icons, both);
    expect(counter.right.life).toBe(100 - event.counter);
    expect(counter.right.hurt).toBe(event.counter);
  });

  it('una unidad en la niebla no se delata', () => {
    const s = blankState();
    const art = newUnit(s, unitType('Artillery'), 1, { x: 10, y: 10 });
    const mine = newUnit(s, unitType('Soldier'), 0, { x: 10, y: 13 });
    const event = fight(
      s,
      art,
      mine,
      diceFrom(() => 0.5),
    );
    const vm = combatVM(blankState(), 0, event, 'hit', icons, { attacker: false, defender: true });
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
      0,
      fight(
        s,
        attacker,
        defender,
        diceFrom(() => 0.5),
      ),
      'hit',
      icons,
      both,
    )!;
    expect(vm.right).toMatchObject({ life: 0, ko: true });
    expect(vm.counter).toBe(false);
  });
});

describe('desglose de la barra de arriba', () => {
  const army = () => {
    const s = withoutHeadquarters(blankState());
    for (const team of s.teams) team.funds = 5000;
    for (const [index, buildingName] of ['City', 'City', 'Factory', 'Oil'].entries())
      s.buildings.push({ type: buildingName, owner: 0, x: 1 + index, y: 1, capture: null });
    s.buildings.push({ type: 'City', owner: 1, x: 9, y: 9, capture: null });
    newUnit(s, unitType('Tank'), 0, { x: 5, y: 5 });
    newUnit(s, unitType('Soldier'), 0, { x: 6, y: 5 });
    newUnit(s, unitType('Soldier'), 0, { x: 7, y: 5 });
    newUnit(s, unitType('Bomber'), 1, { x: 9, y: 8 });
    return s;
  };

  it('ingresos por tipo de edificio y mantenimiento por tipo de unidad, con las cuentas de endRound', () => {
    const s = army();
    changeSettings(s, settingsWith(defaultContent(), { upkeep: 0.1, commandPoints: 30 }));
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
    expect(teamState(s, 0).funds).toBe(next); // lo que dice el desglose es lo que pasa
    expect(economy.commandPoints!.used).toBe(unitType('Tank').command + 2 * unitType('Soldier').command);
    expect(economy.commandPoints!.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(economy.commandPoints!.used);
  });

  it('si no llega para el mantenimiento, avisa de lo que se paga', () => {
    const s = army();
    changeSettings(s, settingsWith(defaultContent(), { upkeep: 1 }));
    teamState(s, 0).funds = 0;
    s.buildings = s.buildings.filter((building) => building.owner !== 0);
    const economy = economyVM(s, 0);
    expect(economy.income.total).toBe(0);
    expect(economy.shortfall).toBe(0);
    expect(economy.next).toBe(0);
  });

  it('sin las reglas de mantenimiento y mando no salen esos apartados; el tope de dinero cuenta', () => {
    const s = army();
    changeSettings(s, settingsWith(defaultContent(), { upkeep: 0, commandPoints: null }));
    teamState(s, 0).funds = MAX_FUNDS;
    const economy = economyVM(s, 0);
    expect(economy.upkeep).toBeNull();
    expect(economy.commandPoints).toBeNull();
    expect(economy.next).toBe(MAX_FUNDS);
  });

  it('dia: lo que queda y los puntos solo con limite de dias', () => {
    const s = army();
    s.day = 18;
    changeSettings(s, settingsWith(defaultContent(), { dayLimit: null }));
    expect(dayInfoVM(s, 0)).toEqual({ day: 18, limit: null, left: null, score: null });
    changeSettings(s, settingsWith(defaultContent(), { dayLimit: 20 }));
    expect(dayInfoVM(s, 0)).toEqual({ day: 18, limit: 20, left: 3, score: [score(s, 0), score(s, 1)] });
  });
});

describe('lados para quien mira (con mas de dos equipos)', () => {
  /** Tres equipos: el 1 (la persona) y el 2 aliados contra el 0. */
  const threeTeams = () =>
    blankState({}, [
      { controller: 'ai', alliance: 0 },
      { controller: 'human', alliance: 1 },
      { controller: 'ai', alliance: 1 },
    ]);

  it('lo propio, lo aliado y lo enemigo salen de las alianzas, no del numero de equipo', () => {
    const s = threeTeams();
    expect([0, 1, 2].map((team) => sideOf(s, 1, team))).toEqual(['enemy', 'own', 'ally']);
    expect(ownerSideOf(s, 1, null)).toBe('neutral');
    expect(ownerSideOf(s, 0, 2)).toBe('enemy');
  });

  it('colores y letras de lado de un solo sitio: azul lo propio y aliado, rojo lo enemigo, gris lo de nadie', () => {
    expect(sideColor('own')).toBe(PAL.blue);
    expect(sideColor('ally')).toBe(PAL.blue);
    expect(sideColor('enemy')).toBe(PAL.red);
    expect(sidePaint('ally', 'fill')).toBe(sidePaint('own', 'fill'));
    expect(sidePaint('unknown', 'text')).toBe(sidePaint('neutral', 'text'));
    expect(sidePaint('enemy', 'canvas')).not.toBe(sidePaint('own', 'canvas'));
    expect([sideLetter('own'), sideLetter('ally'), sideLetter('enemy'), sideLetter('neutral')]).toEqual(['b', 'b', 'r', 'i']);
    // Gris solo lo propio o aliado que ya ha actuado: de un enemigo no se delata.
    expect([unitSideLetter('own', false), unitSideLetter('ally', false), unitSideLetter('enemy', false)]).toEqual(['i', 'i', 'r']);
  });

  it('fichas y minimapa: una unidad aliada se ve como aliada; un edificio aliado se sabe de quien es en la niebla', () => {
    const s = threeTeams();
    newUnit(s, unitType('Tank'), 2, { x: 4, y: 4 });
    s.buildings.push({ type: 'City', owner: 2, x: 9, y: 9, capture: null });
    const all = createLayer(s, true);
    expect(tileVM(textures, s, { x: 4, y: 4 }, { viewer: 1, vis: all, hidden: new Set() }).unit?.side).toBe('ally');
    const fog = createLayer(s, false);
    expect(tileVM(textures, s, { x: 9, y: 9 }, { viewer: 1, vis: fog, hidden: new Set() }).building?.owner).toBe('ally');
    expect(tileVM(textures, s, { x: 9, y: 9 }, { viewer: 0, vis: fog, hidden: new Set() }).building?.owner).toBe('unknown');
    expect(minimapVM({}, s, { viewer: 1, vis: all, hidden: new Set() }).units).toEqual([{ x: 4, y: 4, side: 'ally' }]);
  });

  it('pantalla final: lo de quien mira contra lo de todos sus enemigos juntos', () => {
    const s = withoutHeadquarters(blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]));
    s.teams.forEach((team, id) => {
      team.stats.built = id + 1;
      team.stats.army = [100 * (id + 1), 200 * (id + 1)];
    });
    expect(endStatsVM(s, 0).built).toEqual([1, 5]);
    expect(endStatsVM(s, 2).built).toEqual([3, 3]);
    // Los dias pasados, de sus muestras; hoy (el tercero), lo que hay ahora (nadie tiene unidades).
    s.day = 3;
    expect(armyChartVM(s, 0)).toEqual([
      [100, 500],
      [200, 1000],
      [0, 0],
    ]);
    s.buildings.push({ type: 'City', owner: 1, x: 1, y: 1, capture: null }, { type: 'City', owner: 2, x: 3, y: 1, capture: null });
    s.buildings.push({ type: 'City', owner: 2, x: 5, y: 1, capture: null });
    // Puntos: los de la mejor alianza enemiga (la que decide quien gana), no la suma.
    expect(endScoreVM(s, 0)).toEqual([0, score(s, 2)]);
  });

  it('pantalla final con aliados: lo propio es lo de toda su alianza', () => {
    const s = threeTeams();
    s.teams.forEach((team, id) => (team.stats.built = id + 1));
    expect(endStatsVM(s, 1).built).toEqual([5, 1]);
    expect(endStatsVM(s, 0).built).toEqual([1, 5]);
  });
});
