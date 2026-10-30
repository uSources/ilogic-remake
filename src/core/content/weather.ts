/**
 * Clima (weather.json): validacion y tablas (WEATHER).
 * Es la clase Climate del juego de 2013 (slow, blind, protection), que nunca se llego a usar.
 */
import { type Checker } from './check';
import { MOVEMENTS, THEME_NAMES, type Texts } from './types';

export interface WeatherDef {
  /** Nombre interno (en ingles, sin espacios). Las partidas guardan el numero (orden de la lista). */
  id: string;
  name: Texts;
  /** Cambio del radio de vision de las unidades (negativo = ven menos; nunca baja de 1). */
  vision: number;
  /** Cambio del movimiento por tipo de movimiento (negativo = mueven menos; nunca baja de 1). */
  move: Partial<Record<(typeof MOVEMENTS)[number], number>>;
  /** Multiplica la probabilidad de acierto de todos los ataques (1 = igual). */
  hitChance: number;
  /** Dias que dura, de minimo a maximo. */
  days: [number, number];
  /** Peso de que salga en cada tema de mapa (0 = nunca). */
  chance: Record<(typeof THEME_NAMES)[number], number>;
  comment?: string;
}

export function validateWeather(list: readonly WeatherDef[], check: Checker): void {
  const top = check.scope('weather.json');
  if (!top.expect(Array.isArray(list) && list.length > 0, 'tiene que tener una lista "weather" con al menos un clima')) return;
  const ids = new Set<string>();
  list.forEach((w, i) => {
    const s = check.scope(`clima ${typeof w?.id === 'string' ? w.id : `#${i}`}`);
    s.id(w?.id);
    s.expect(!ids.has(w?.id), 'id repetido');
    ids.add(w?.id);
    s.texts('name', w?.name);
    s.num('vision', w?.vision, { min: -5, max: 5, int: true });
    s.num('hitChance', w?.hitChance, { min: 0.1, max: 2 });
    const d = w?.days;
    s.expect(
      Array.isArray(d) && d.length === 2 && d.every((n) => Number.isInteger(n) && n >= 1 && n <= 30) && d[0] <= d[1],
      'days tiene que ser [minimo, maximo], de 1 a 30 dias',
    );
    for (const [m, v] of Object.entries(w?.move ?? {})) {
      s.known('move', m, MOVEMENTS, 'el movimiento ');
      s.num(`move.${m}`, v, { min: -5, max: 5, int: true });
    }
    for (const t of THEME_NAMES) s.num(`chance.${t}`, w?.chance?.[t], { min: 0 });
    s.expect(
      Object.keys(w?.chance ?? {}).every((k) => THEME_NAMES.includes(k as never)),
      `chance solo admite ${THEME_NAMES.join(', ')}`,
    );
  });
  const first = list[0];
  top.expect(
    !!first && first.vision === 0 && first.hitChance === 1 && Object.values(first.move ?? {}).every((v) => v === 0),
    'el primer clima es el neutro (vision 0, move vacio, hitChance 1): con el empiezan las partidas',
  );
  for (const t of THEME_NAMES)
    top.expect(
      list.some((w) => (w?.chance?.[t] ?? 0) > 0),
      `algun clima tiene que poder salir en ${t}`,
    );
}

export function buildWeatherTables(list: readonly WeatherDef[]) {
  return {
    WEATHER: {
      ids: list.map((w) => w.id),
      vision: list.map((w) => w.vision),
      /** [clima][MoveType]: cambio de movimiento. */
      move: list.map((w) => MOVEMENTS.map((m) => w.move[m] ?? 0)),
      hitChance: list.map((w) => w.hitChance),
      days: list.map((w) => w.days),
      /** [tema][clima]: peso de que salga. */
      chance: THEME_NAMES.map((t) => list.map((w) => w.chance[t])),
    },
  };
}
