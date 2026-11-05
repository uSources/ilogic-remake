import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { validateContent, THEME_NAMES, type Content } from '@core/content';
import { mutableCopy } from '@core/util/freeze';
import { deserialize, serialize } from '@core/save';
import { endRound, hitChance, maxSteps, moveRange, newUnit, visibility, visionOf } from '@core/rules';
import { CLEAR, advanceWeather, ensureWeather, forecast, rollWeather, weatherNow } from '@core/weather';
import { seededRng } from '@core/geom';
import type { GameState, RulesConfig } from '@core/model';
import { blankState, savedByVersion1 } from './helpers';

const { UNIT, WEATHER } = defaultContent().tables;

const SOLDIER = 0,
  TANK = 1,
  BLOCKER = 5,
  LFIGHTER = 10;
const kind = (id: string): number => WEATHER.ids.indexOf(id);
const RAIN = kind('Rain'),
  SNOW = kind('Snow'),
  STORM = kind('Storm'),
  SANDSTORM = kind('Sandstorm');

/** Partida de prueba con el clima `k` puesto (dura varios dias). */
function withWeather(weatherKind: number): GameState {
  const s = blankState();
  s.setup = { seed: 1234, size: 32, theme: 0 };
  s.weather = { kind: weatherKind, left: 3, next: CLEAR };
  return s;
}

describe('clima: contenido', () => {
  it('weather.json es valido y el primero es el despejado', () => {
    expect(validateContent(mutableCopy<Content>(defaultContent().files))).toEqual([]);
    expect(WEATHER.ids[CLEAR]).toBe('Clear');
    for (const id of ['Rain', 'Snow', 'Storm', 'Sandstorm']) expect(kind(id)).toBeGreaterThan(0);
  });

  it('dice que esta mal si el primer clima no es neutro', () => {
    const bad = mutableCopy<Content>(defaultContent().files);
    bad.weather[0]!.vision = -1;
    expect(validateContent(bad).join()).toMatch(/primer clima es el neutro/);
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
    expect(maxSteps(s, tank)).toBe(UNIT.mover[TANK]);
    expect(visionOf(s, tank)).toBe(UNIT.vision[TANK]);
  });

  it('la lluvia frena a los vehiculos pero no a la infanteria', () => {
    const s = withWeather(RAIN);
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const soldier = newUnit(s, SOLDIER, 0, { x: 15, y: 15 });
    expect(maxSteps(s, tank)).toBe(UNIT.mover[TANK]! - 1);
    expect(maxSteps(s, soldier)).toBe(UNIT.mover[SOLDIER]);
    expect(moveRange(s, tank).maxSteps).toBe(UNIT.mover[TANK]! - 1);
  });

  it('la nevada frena a todo lo que va por tierra, no a los aviones', () => {
    const s = withWeather(SNOW);
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const plane = newUnit(s, LFIGHTER, 0, { x: 15, y: 15 });
    expect(maxSteps(s, soldier)).toBe(UNIT.mover[SOLDIER]! - 1);
    expect(maxSteps(s, plane)).toBe(UNIT.mover[LFIGHTER]);
  });

  it('la tormenta frena a los aviones y hace fallar mas', () => {
    const clear = withWeather(CLEAR);
    const storm = withWeather(STORM);
    for (const s of [clear, storm]) {
      newUnit(s, TANK, 0, { x: 5, y: 5 });
      newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
      newUnit(s, LFIGHTER, 0, { x: 15, y: 15 });
    }
    expect(maxSteps(storm, storm.units[2]!)).toBe(UNIT.mover[LFIGHTER]! - 2);
    const pc = hitChance(clear, clear.units[0]!, clear.units[1]!);
    const ps = hitChance(storm, storm.units[0]!, storm.units[1]!);
    expect(ps).toBeCloseTo(pc * WEATHER.hitChance[STORM]!);
    expect(ps).toBeLessThan(pc);
  });

  it('el mal tiempo quita vision, nunca por debajo de 1 (ni da vision a quien no ve)', () => {
    const s = withWeather(STORM);
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const blocker = newUnit(s, BLOCKER, 0, { x: 20, y: 20 });
    expect(visionOf(s, tank)).toBe(UNIT.vision[TANK]! - 2);
    expect(visionOf(s, blocker)).toBe(UNIT.vision[BLOCKER]);
    const vis = visibility(s, 0);
    expect(vis.at({ x: 10 + UNIT.vision[TANK]! - 2, y: 10 })).toBe(true);
    expect(vis.at({ x: 10 + UNIT.vision[TANK]! - 1, y: 10 })).toBe(false);
  });

  it('el movimiento nunca baja de 1', () => {
    const s = withWeather(SNOW);
    for (let type = 0; type < UNIT.mover.length; type++) {
      const unit = newUnit(s, type, 0, { x: type, y: 0 });
      if (UNIT.mover[type]! > 0) expect(maxSteps(s, unit)).toBeGreaterThanOrEqual(1);
    }
  });

  it('con la regla quitada no hay clima aunque el estado lo tenga', () => {
    const s = withWeather(STORM);
    s.rules = rulesWith(defaultContent(), { weather: false });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    expect(weatherNow(s)).toBe(CLEAR);
    expect(maxSteps(s, tank)).toBe(UNIT.mover[TANK]);
    expect(advanceWeather(s)).toBeNull();
  });
});

describe('clima: como cambia', () => {
  it('empieza despejado y con pronostico', () => {
    const s = blankState();
    s.setup = { seed: 7, size: 32, theme: 0 };
    ensureWeather(s);
    expect(s.weather!.kind).toBe(CLEAR);
    expect(s.weather!.left).toBeGreaterThanOrEqual(WEATHER.days[CLEAR]![0]);
  });

  it('cambia al acabar los dias, entra el del pronostico y endRound lo cuenta', () => {
    const s = withWeather(CLEAR);
    s.weather = { kind: CLEAR, left: 2, next: RAIN };
    expect(forecast(s)).toBeNull();
    expect(endRound(s).weather).toBeNull();
    expect(forecast(s)).toBe(RAIN);
    const round = endRound(s);
    expect(round.weather).toEqual({ from: CLEAR, to: RAIN });
    expect(weatherNow(s)).toBe(RAIN);
    expect(s.weather!.left).toBeGreaterThanOrEqual(1);
  });

  it('es determinista: la misma semilla da el mismo tiempo', () => {
    const run = () => {
      const s = blankState();
      s.setup = { seed: 99, size: 32, theme: 3 };
      ensureWeather(s);
      const seen: number[] = [];
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
    for (let theme = 0; theme < THEME_NAMES.length; theme++) {
      for (let i = 0; i < 300; i++) {
        const rolled = rollWeather(blankState(), theme, rng);
        expect(WEATHER.chance[theme]![rolled]).toBeGreaterThan(0);
        if (THEME_NAMES[theme] !== 'Desert') expect(rolled).not.toBe(SANDSTORM);
      }
    }
  });

  it('el mismo mal tiempo no se repite seguido: despeja', () => {
    const always = () => 0.999; // el ultimo con peso del tema
    const theme = THEME_NAMES.indexOf('Desert');
    expect(rollWeather(blankState(), theme, always, SANDSTORM)).toBe(CLEAR);
  });

  it('se guarda con la partida y un clima roto se descarta al cargar', () => {
    const s = withWeather(RAIN);
    s.rules = rulesWith(defaultContent());
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.weather).toEqual(s.weather);
    const broken = JSON.parse(serialize(s)) as GameState;
    broken.weather = { kind: WEATHER.ids.length + 5, left: 1, next: 0 };
    expect(deserialize(JSON.stringify(broken), saveContext(defaultContent()))!.weather).toBeUndefined();
  });

  it('las partidas guardadas sin la regla se siguen jugando sin clima', () => {
    const s = blankState();
    const { weather: _, ...old } = defaultContent().tables.DEFAULT_RULES;
    s.rules = old as RulesConfig;
    expect(deserialize(savedByVersion1(serialize(s)), saveContext(defaultContent()))!.rules.weather).toBe(false);
  });
});
