/**
 * Clima (weather.json): validacion y su tipo resuelto (`WeatherType`).
 * Es la clase Climate del juego de 2013 (slow, blind, protection), que nunca se llego a usar.
 */
import type { Checker, Scope } from './check';
import { MOVEMENTS, type MoveType, type Texts } from './types';

export interface WeatherDef {
  /** Nombre interno (en ingles, sin espacios); lo guardan las partidas. */
  id: string;
  name: Texts;
  /** El tiempo neutro (sin efectos), con el que empiezan las partidas. Exactamente uno. */
  clear?: boolean;
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
  list.forEach((weather, index) => {
    const scope = check.scope(`clima ${typeof weather?.id === 'string' ? weather.id : `#${index}`}`);
    scope.id(weather?.id);
    scope.expect(!ids.has(weather?.id), 'id repetido');
    ids.add(weather?.id);
    validateOneWeather(weather, themeIds, scope);
  });
  const clear = list.filter((weather) => weather?.clear);
  if (top.expect(clear.length === 1, 'tiene que haber exactamente un clima con "clear": true (con el empiezan las partidas)'))
    top.expect(isNeutral(clear[0]!), `el clima "clear" (${clear[0]!.id}) tiene que ser neutro: vision 0, move vacio y hitChance 1`);
  for (const themeId of themeIds)
    top.expect(
      list.some((weather) => (weather?.chance?.[themeId] ?? 0) > 0),
      `algun clima tiene que poder salir en ${themeId}`,
    );
}

/** Los numeros de un clima. */
function validateOneWeather(weather: WeatherDef, themeIds: ReadonlySet<string>, scope: Scope): void {
  scope.texts('name', weather?.name);
  if (weather?.clear !== undefined) scope.bool('clear', weather.clear);
  scope.num('vision', weather?.vision, { min: -5, max: 5, int: true });
  scope.num('hitChance', weather?.hitChance, { min: 0.1, max: 2 });
  const days = weather?.days;
  scope.expect(
    Array.isArray(days) && days.length === 2 && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 30) && days[0] <= days[1],
    'days tiene que ser [minimo, maximo], de 1 a 30 dias',
  );
  for (const [movement, change] of Object.entries(weather?.move ?? {})) {
    scope.known('move', movement, MOVEMENTS, 'el movimiento ');
    scope.num(`move.${movement}`, change, { min: -5, max: 5, int: true });
  }
  for (const themeId of themeIds) scope.num(`chance.${themeId}`, weather?.chance?.[themeId], { min: 0 });
  for (const themeId of Object.keys(weather?.chance ?? {})) scope.known('chance', themeId, themeIds, 'el tema ');
}

/** Sin efectos: con el empiezan las partidas. */
const isNeutral = (weather: WeatherDef): boolean =>
  weather.vision === 0 && weather.hitChance === 1 && Object.values(weather.move ?? {}).every((change) => change === 0);

/** Un clima, resuelto al cargar el contenido (weather.json). */
export interface WeatherType {
  readonly id: string;
  readonly name: Texts;
  /** Es el tiempo neutro, con el que empiezan las partidas (GameContent.clearWeather). */
  readonly isClear: boolean;
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
    isClear: !!definition.clear,
    vision: definition.vision,
    move: moveChanges(definition),
    hitChance: definition.hitChance,
    days: [definition.days[0], definition.days[1]],
    chance: { ...definition.chance },
  }));
}
