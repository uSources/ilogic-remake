import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { entryOf, loadContent, validateContent, type Content, type WeatherType } from '@core/content';

import { mutableCopy } from '@core/util/freeze';
import { deserialize, serialize } from '@core/save';
import { endRound, hitChance, maxSteps, moveRange, newUnit, visibility, visionOf } from '@core/rules';
import { advanceWeather, ensureWeather, forecast, rollWeather, weatherNow } from '@core/weather';
import { seededRng } from '@core/util/random';
import type { GameState, RulesConfig } from '@core/model';
import { blankState, savedByVersion1, unitTypeNamed, endRoundReport } from './helpers';

const WEATHER = defaultContent().weather;
const THEMES = defaultContent().themes;

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  BLOCKER = unitTypeNamed('Blocker'),
  LFIGHTER = unitTypeNamed('LFighter');
const kind = (id: string): WeatherType => entryOf(WEATHER, id, 'clima');
/** Lo que guarda la partida de un clima (WeatherState.kind y next). */
const keyOfWeather = (weather: WeatherType) => weather.id;
const CLEAR = defaultContent().clearWeather,
  RAIN = kind('Rain'),
  SNOW = kind('Snow'),
  STORM = kind('Storm'),
  SANDSTORM = kind('Sandstorm');

/** Partida de prueba con el clima `weather` puesto (dura varios dias). */
function withWeather(weather: WeatherType): GameState {
  const s = blankState();
  s.setup = { seed: 1234, size: 32, theme: 'Plains' };
  s.weather = { kind: keyOfWeather(weather), left: 3, next: keyOfWeather(CLEAR) };
  return s;
}

describe('clima: contenido', () => {
  it('weather.json es valido y el primero es el despejado', () => {
    expect(validateContent(mutableCopy<Content>(defaultContent().files))).toEqual([]);
    expect(WEATHER.list[0]).toBe(CLEAR);
    expect(CLEAR.id).toBe('Clear');
    for (const id of ['Rain', 'Snow', 'Storm', 'Sandstorm']) expect(kind(id)).not.toBe(CLEAR);
  });

  it('el clima neutro lo dice "clear" (no su puesto): exactamente uno y sin efectos', () => {
    const bad = mutableCopy<Content>(defaultContent().files);
    bad.weather.find((weather) => weather.clear)!.vision = -1;
    expect(validateContent(bad).join()).toMatch(/tiene que ser neutro/);
    const two = mutableCopy<Content>(defaultContent().files);
    two.weather[1]!.clear = true;
    expect(validateContent(two).join()).toMatch(/exactamente un clima con "clear"/);
    const moved = mutableCopy<Content>(defaultContent().files);
    moved.weather.push(moved.weather.shift()!);
    expect(validateContent(moved)).toEqual([]);
    expect(loadContent(moved).clearWeather.id).toBe(defaultContent().clearWeather.id);
  });

  it('el suelo llano lo dice "plain": exactamente uno', () => {
    const none = mutableCopy<Content>(defaultContent().files);
    for (const terrain of none.terrain) delete terrain.plain;
    expect(validateContent(none).join()).toMatch(/exactamente un terreno con "plain"/);
    expect(defaultContent().plainTerrain.id).toBe('Grass');
  });

  it('dice que esta mal un tipo de movimiento que no existe', () => {
    const bad = mutableCopy<Content>(defaultContent().files);
    (bad.weather[1]!.move as Record<string, number>).boat = -1;
    expect(validateContent(bad).join()).toMatch(/move nombra el movimiento "boat"/);
  });
});

describe('clima: efectos', () => {
  it('despejado no cambia nada', () => {
    const s = withWeather(CLEAR);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    expect(maxSteps(s, tank)).toBe(TANK.move);
    expect(visionOf(s, tank)).toBe(TANK.vision);
  });

  it('la lluvia frena a los vehiculos pero no a la infanteria', () => {
    const s = withWeather(RAIN);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const soldier = newUnit(s, SOLDIER, 0, { x: 15, y: 15 });
    expect(maxSteps(s, tank)).toBe(TANK.move - 1);
    expect(maxSteps(s, soldier)).toBe(SOLDIER.move);
    expect(moveRange(s, tank).maxSteps).toBe(TANK.move - 1);
  });

  it('la nevada frena a todo lo que va por tierra, no a los aviones', () => {
    const s = withWeather(SNOW);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const plane = newUnit(s, LFIGHTER, 0, { x: 15, y: 15 });
    expect(maxSteps(s, soldier)).toBe(SOLDIER.move - 1);
    expect(maxSteps(s, plane)).toBe(LFIGHTER.move);
  });

  it('la tormenta frena a los aviones y hace fallar mas', () => {
    const clear = withWeather(CLEAR);
    const storm = withWeather(STORM);
    for (const s of [clear, storm]) {
      newUnit(s, TANK, 0, { x: 5, y: 5 });
      newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
      newUnit(s, LFIGHTER, 0, { x: 15, y: 15 });
    }
    expect(maxSteps(storm, storm.units[2]!)).toBe(LFIGHTER.move - 2);
    const pc = hitChance(clear, clear.units[0]!, clear.units[1]!);
    const ps = hitChance(storm, storm.units[0]!, storm.units[1]!);
    expect(ps).toBeCloseTo(pc * STORM.hitChance);
    expect(ps).toBeLessThan(pc);
  });

  it('el mal tiempo quita vision, nunca por debajo de 1 (ni da vision a quien no ve)', () => {
    const s = withWeather(STORM);
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const blocker = newUnit(s, BLOCKER, 0, { x: 20, y: 20 });
    expect(visionOf(s, tank)).toBe(TANK.vision - 2);
    expect(visionOf(s, blocker)).toBe(BLOCKER.vision);
    const vis = visibility(s, 0);
    expect(vis.at({ x: 10 + TANK.vision - 2, y: 10 })).toBe(true);
    expect(vis.at({ x: 10 + TANK.vision - 1, y: 10 })).toBe(false);
  });

  it('el movimiento nunca baja de 1', () => {
    const s = withWeather(SNOW);
    defaultContent().units.list.forEach((unitType, x) => {
      const unit = newUnit(s, unitType, 0, { x, y: 0 });
      if (unitType.move > 0) expect(maxSteps(s, unit)).toBeGreaterThanOrEqual(1);
    });
  });

  it('con la regla quitada no hay clima aunque el estado lo tenga', () => {
    const s = withWeather(STORM);
    s.rules = rulesWith(defaultContent(), { weather: false });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    expect(weatherNow(s)).toBe(CLEAR);
    expect(maxSteps(s, tank)).toBe(TANK.move);
    expect(advanceWeather(s)).toBeNull();
  });
});

describe('clima: como cambia', () => {
  it('empieza despejado y con pronostico', () => {
    const s = blankState();
    s.setup = { seed: 7, size: 32, theme: 'Plains' };
    ensureWeather(s);
    expect(s.weather!.kind).toBe(keyOfWeather(CLEAR));
    expect(s.weather!.left).toBeGreaterThanOrEqual(CLEAR.days[0]);
  });

  it('cambia al acabar los dias, entra el del pronostico y endRound lo cuenta', () => {
    const s = withWeather(CLEAR);
    s.weather = { kind: keyOfWeather(CLEAR), left: 2, next: keyOfWeather(RAIN) };
    expect(forecast(s)).toBeNull();
    expect(endRoundReport(s).weather).toBeUndefined();
    expect(forecast(s)).toBe(RAIN);
    const round = endRoundReport(s);
    expect(round.weather).toEqual({ from: CLEAR, to: RAIN });
    expect(weatherNow(s)).toBe(RAIN);
    expect(s.weather!.left).toBeGreaterThanOrEqual(1);
  });

  it('es determinista: la misma semilla da el mismo tiempo', () => {
    const run = () => {
      const s = blankState();
      s.setup = { seed: 99, size: 32, theme: 'Swamp' };
      ensureWeather(s);
      const seen: WeatherType[] = [];
      for (let day = 0; day < 40; day++) {
        endRound(s);
        seen.push(weatherNow(s));
      }
      return seen;
    };
    const seen = run();
    expect(run()).toEqual(seen);
    expect(new Set(seen).size).toBeGreaterThan(1); // en 40 dias de pantano llueve alguna vez
  });

  it('cada tema solo saca sus climas (sin tormentas de arena fuera del desierto)', () => {
    const rng = seededRng(5);
    for (const theme of THEMES.list) {
      for (let i = 0; i < 300; i++) {
        const rolled = rollWeather(blankState(), theme, rng);
        expect(rolled.chance[theme.id]).toBeGreaterThan(0);
        if (theme.id !== 'Desert') expect(rolled).not.toBe(SANDSTORM);
      }
    }
  });

  it('el mismo mal tiempo no se repite seguido: despeja', () => {
    const always = () => 0.999; // el ultimo con peso del tema
    const theme = entryOf(THEMES, 'Desert', 'tema');
    expect(rollWeather(blankState(), theme, always, SANDSTORM)).toBe(CLEAR);
  });

  it('se guarda con la partida y un clima roto se descarta al cargar', () => {
    const s = withWeather(RAIN);
    s.rules = rulesWith(defaultContent());
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.weather).toEqual(s.weather);
    const broken = JSON.parse(serialize(s)) as GameState;
    broken.weather = { kind: 'Meteorites', left: 1, next: CLEAR.id };
    expect(deserialize(JSON.stringify(broken), saveContext(defaultContent()))!.weather).toBeUndefined();
  });

  it('las partidas guardadas sin la regla se siguen jugando sin clima', () => {
    const s = blankState();
    const { weather: _, ...old } = defaultContent().defaultRules;
    s.rules = old as RulesConfig;
    expect(deserialize(savedByVersion1(serialize(s)), saveContext(defaultContent()))!.rules.weather).toBe(false);
  });
});
