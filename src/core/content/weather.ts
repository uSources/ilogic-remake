/**
 * Clima (weather.json): validacion y su tipo resuelto (`WeatherType`).
 * Es la clase Climate del juego de 2013 (slow, blind, protection), que nunca se llego a usar.
 */
import { type Checker } from './check';
import { MOVEMENTS, type MoveType, type Texts } from './types';

export interface WeatherDef {
  /** Nombre interno (en ingles, sin espacios); lo guardan las partidas. */
  id: string;
  name: Texts;
  /** Cambio del radio de vision de las unidades (negativo = ven menos; nunca baja de 1). */
  vision: number;
  /** Cambio del movimiento por tipo de movimiento (negativo = mueven menos; nunca baja de 1). */
  move: Partial<Record<MoveType, number>>;
  /** Multiplica la probabilidad de acierto de todos los ataques (1 = igual). */
  hitChance: number;
  /** Dias que dura, de minimo a maximo. */
  days: [number, number];
  /** Peso de que salga en cada tema de mapa, por id de tema (themes.json; 0 = nunca). */
  chance: Record<string, number>;
  comment?: string;
}

export function validateWeather(list: readonly WeatherDef[], themeIds: ReadonlySet<string>, check: Checker): void {
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
    for (const t of themeIds) s.num(`chance.${t}`, w?.chance?.[t], { min: 0 });
    for (const t of Object.keys(w?.chance ?? {})) s.known('chance', t, themeIds, 'el tema ');
  });
  const first = list[0];
  top.expect(
    !!first && first.vision === 0 && first.hitChance === 1 && Object.values(first.move ?? {}).every((v) => v === 0),
    'el primer clima es el neutro (vision 0, move vacio, hitChance 1): con el empiezan las partidas',
  );
  for (const t of themeIds)
    top.expect(
      list.some((w) => (w?.chance?.[t] ?? 0) > 0),
      `algun clima tiene que poder salir en ${t}`,
    );
}

/** Un clima, resuelto al cargar el contenido (weather.json). */
export interface WeatherType {
  readonly id: string;
  readonly name: Texts;
  /** Cambio del radio de vision (nunca baja de 1). */
  readonly vision: number;
  /** Cambio del movimiento por tipo de movimiento (0 si no lo cambia; nunca baja de 1). */
  readonly move: Readonly<Record<MoveType, number>>;
  /** Multiplica la probabilidad de acierto de todos los ataques. */
  readonly hitChance: number;
  /** Dias que dura, de minimo a maximo. */
  readonly days: readonly [min: number, max: number];
  /** Peso de que salga en cada tema, por id de tema. */
  readonly chance: Readonly<Record<string, number>>;
}

const moveChanges = (definition: WeatherDef): Record<MoveType, number> =>
  Object.fromEntries(MOVEMENTS.map((movement) => [movement, definition.move[movement] ?? 0])) as Record<MoveType, number>;

export function buildWeatherTypes(list: readonly WeatherDef[]): WeatherType[] {
  return list.map((definition) => ({
    id: definition.id,
    name: definition.name,
    vision: definition.vision,
    move: moveChanges(definition),
    hitChance: definition.hitChance,
    days: [definition.days[0], definition.days[1]],
    chance: { ...definition.chance },
  }));
}
