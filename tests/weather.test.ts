import { beforeEach, describe, expect, it } from 'vitest';
import { CONTENT, DEFAULT_RULES, THEME_NAMES, UNIT, WEATHER, WEATHER_TYPES, useRules } from '@core/data';
import { validateContent } from '@core/content';
import { deserialize, serialize } from '@core/save';
import { endRound, hitChance, maxSteps, moveRange, newUnit, visibility, visionOf } from '@core/rules';
import { CLEAR, advanceWeather, ensureWeather, forecast, rollWeather, weatherNow } from '@core/weather';
import { seededRng } from '@core/geom';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

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
function withWeather(k: number): GameState {
  const s = blankState();
  s.setup = { seed: 1234, size: 32, theme: 0 };
  s.weather = { kind: k, left: 3, next: CLEAR };
  return s;
}

beforeEach(() => useRules(DEFAULT_RULES));

describe('clima: contenido', () => {
  it('weather.json es valido y el primero es el despejado', () => {
    expect(validateContent(CONTENT)).toEqual([]);
    expect(WEATHER.ids[CLEAR]).toBe('Clear');
    for (const id of ['Rain', 'Snow', 'Storm', 'Sandstorm']) expect(kind(id)).toBeGreaterThan(0);
  });

  it('dice que esta mal si el primer clima no es neutro', () => {
    const bad = structuredClone(CONTENT);
    bad.weather[0]!.vision = -1;
    expect(validateContent(bad).join()).toMatch(/primer clima es el neutro/);
  });

  it('dice que esta mal un tipo de movimiento que no existe', () => {
    const bad = structuredClone(CONTENT);
    (bad.weather[1]!.move as Record<string, number>).boat = -1;
    expect(validateContent(bad).join()).toMatch(/move nombra el movimiento "boat"/);
  });
});

describe('clima: efectos', () => {
  it('despejado no cambia nada', () => {
    const s = withWeather(CLEAR);
    const tank = newUnit(s, TANK, 0, 5, 5);
    expect(maxSteps(s, tank)).toBe(UNIT.mover[TANK]);
    expect(visionOf(s, tank)).toBe(UNIT.vision[TANK]);
  });

  it('la lluvia frena a los vehiculos pero no a la infanteria', () => {
    const s = withWeather(RAIN);
    const tank = newUnit(s, TANK, 0, 5, 5);
    const soldier = newUnit(s, SOLDIER, 0, 15, 15);
    expect(maxSteps(s, tank)).toBe(UNIT.mover[TANK]! - 1);
    expect(maxSteps(s, soldier)).toBe(UNIT.mover[SOLDIER]);
    expect(moveRange(s, tank).maxSteps).toBe(UNIT.mover[TANK]! - 1);
  });

  it('la nevada frena a todo lo que va por tierra, no a los aviones', () => {
    const s = withWeather(SNOW);
    const soldier = newUnit(s, SOLDIER, 0, 5, 5);
    const plane = newUnit(s, LFIGHTER, 0, 15, 15);
    expect(maxSteps(s, soldier)).toBe(UNIT.mover[SOLDIER]! - 1);
    expect(maxSteps(s, plane)).toBe(UNIT.mover[LFIGHTER]);
  });

  it('la tormenta frena a los aviones y hace fallar mas', () => {
    const clear = withWeather(CLEAR);
    const storm = withWeather(STORM);
    for (const s of [clear, storm]) {
      newUnit(s, TANK, 0, 5, 5);
      newUnit(s, SOLDIER, 1, 6, 5);
      newUnit(s, LFIGHTER, 0, 15, 15);
    }
    expect(maxSteps(storm, storm.units[2]!)).toBe(UNIT.mover[LFIGHTER]! - 2);
    const pc = hitChance(clear, clear.units[0]!, clear.units[1]!);
    const ps = hitChance(storm, storm.units[0]!, storm.units[1]!);
    expect(ps).toBeCloseTo(pc * WEATHER.hitChance[STORM]!);
    expect(ps).toBeLessThan(pc);
  });

  it('el mal tiempo quita vision, nunca por debajo de 1 (ni da vision a quien no ve)', () => {
    const s = withWeather(STORM);
    const tank = newUnit(s, TANK, 0, 10, 10);
    const blocker = newUnit(s, BLOCKER, 0, 20, 20);
    expect(visionOf(s, tank)).toBe(UNIT.vision[TANK]! - 2);
    expect(visionOf(s, blocker)).toBe(UNIT.vision[BLOCKER]);
    const vis = visibility(s, 0);
    expect(vis[10 + UNIT.vision[TANK]! - 2]![10]).toBe(true);
    expect(vis[10 + UNIT.vision[TANK]! - 1]![10]).toBe(false);
  });

  it('el movimiento nunca baja de 1', () => {
    const s = withWeather(SNOW);
    for (let t = 0; t < UNIT.mover.length; t++) {
      const u = newUnit(s, t, 0, t, 0);
      if (UNIT.mover[t]! > 0) expect(maxSteps(s, u)).toBeGreaterThanOrEqual(1);
    }
  });

  it('con la regla quitada no hay clima aunque el estado lo tenga', () => {
    useRules({ ...DEFAULT_RULES, weather: false });
    const s = withWeather(STORM);
    const tank = newUnit(s, TANK, 0, 5, 5);
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
    const r = endRound(s);
    expect(r.weather).toEqual({ from: CLEAR, to: RAIN });
    expect(weatherNow(s)).toBe(RAIN);
    expect(s.weather!.left).toBeGreaterThanOrEqual(1);
  });

  it('es determinista: la misma semilla da el mismo tiempo', () => {
    const run = () => {
      const s = blankState();
      s.setup = { seed: 99, size: 32, theme: 3 };
      ensureWeather(s);
      const seen: number[] = [];
      for (let d = 0; d < 40; d++) {
        endRound(s);
        seen.push(weatherNow(s));
      }
      return seen;
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(1); // en 40 dias de pantano llueve alguna vez
  });

  it('cada tema solo saca sus climas (sin tormentas de arena fuera del desierto)', () => {
    const rng = seededRng(5);
    for (let theme = 0; theme < THEME_NAMES.length; theme++) {
      for (let i = 0; i < 300; i++) {
        const k = rollWeather(theme, rng);
        expect(WEATHER.chance[theme]![k]).toBeGreaterThan(0);
        if (THEME_NAMES[theme] !== 'Desert') expect(k).not.toBe(SANDSTORM);
      }
    }
  });

  it('el mismo mal tiempo no se repite seguido: despeja', () => {
    const always = () => 0.999; // el ultimo con peso del tema
    const theme = THEME_NAMES.indexOf('Desert');
    expect(rollWeather(theme, always, SANDSTORM)).toBe(CLEAR);
  });

  it('se guarda con la partida y un clima roto se descarta al cargar', () => {
    const s = withWeather(RAIN);
    s.rules = { ...DEFAULT_RULES };
    expect(deserialize(serialize(s))!.weather).toEqual(s.weather);
    const broken = JSON.parse(serialize(s)) as GameState;
    broken.weather = { kind: WEATHER_TYPES + 5, left: 1, next: 0 };
    expect(deserialize(JSON.stringify(broken))!.weather).toBeUndefined();
  });

  it('las partidas guardadas sin la regla se siguen jugando sin clima', () => {
    const s = blankState();
    const { weather: _, ...old } = DEFAULT_RULES;
    s.rules = old as typeof DEFAULT_RULES;
    expect(deserialize(serialize(s))!.rules!.weather).toBe(false);
  });
});
