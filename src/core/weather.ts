/**
 * [CAMBIO] Clima (regla `weather`, numeros en content/weather.json).
 *
 * El juego de 2013 tenia una clase Climate con `slow`, `blind` y `protection` que nunca se uso
 * (docs/SPEC-REGLAS.md, 2.9). Aqui se le da la semantica que se deduce de ella:
 *   movimiento = mover + move[tipo de movimiento]   (minimo 1)
 *   vision     = vision + vision                     (minimo 1)
 *   acierto    = acierto * hitChance
 *
 * El clima dura unos dias y cambia al empezar una ronda; el siguiente ya esta decidido (pronostico).
 * Todo sale de la semilla del mapa y del dia: la misma partida tiene siempre el mismo tiempo, y la IA
 * y el jugador lo sufren igual.
 */
import { themeOf, weatherTypeOf } from './gameContent';
import type { MoveType, Theme, WeatherType } from './content';
import { randomInt, seededRng, weightedPick } from './util/random';
import type { GameState, Rng, WeatherState } from './model';

/** Clima de la partida ahora mismo (despejado, `content.clearWeather`, si no tiene: sin el modulo del clima). */
export function weatherNow(s: GameState): WeatherType {
  return s.weather ? weatherTypeOf(s, s.weather.kind) : s.content.clearWeather;
}

/** Cambio de movimiento por el clima para un tipo de movimiento. */
export const weatherMove = (s: GameState, movement: MoveType): number => weatherNow(s).move[movement] ?? 0;

/** Cambio del radio de vision de las unidades por el clima. */
export const weatherVision = (s: GameState): number => weatherNow(s).vision;

/** Multiplicador de la probabilidad de acierto por el clima. */
export const weatherHit = (s: GameState): number => weatherNow(s).hitChance;

/** Multiplicador con el que el dia entra en la semilla del clima (la razon aurea en 32 bits: separa bien dias seguidos). */
const WEATHER_DAY_MIX = 0x9e3779b1;
/** Lo que distingue la semilla del clima de las demas que salen de la del mapa. */
const WEATHER_SALT = 0x5eed;

/** La semilla del clima del dia `day` en un mapa con semilla `mapSeed`: la misma siempre para ese dia. */
const weatherSeed = (mapSeed: number, day: number): number => (mapSeed ^ Math.imul(day + 1, WEATHER_DAY_MIX) ^ WEATHER_SALT) >>> 0;

/**
 * El azar del clima del dia: depende solo de la semilla del mapa y del dia (la primera tirada se
 * salta, como desde el principio: cambiarlo cambiaria el tiempo de todas las partidas).
 */
function dayRng(s: GameState): Rng {
  const rng = seededRng(weatherSeed((s.setup?.seed ?? 0) >>> 0, s.day));
  rng();
  return rng;
}

/**
 * Elige un clima segun los pesos del tema (weather.json, "chance"; si ninguno pesa, despejado); si
 * sale el mismo mal tiempo que hay, despeja.
 */
export function rollWeather(s: GameState, theme: Theme, rng: Rng, current: WeatherType = s.content.clearWeather): WeatherType {
  const clear = s.content.clearWeather;
  const rolled = weightedPick(s.content.weather.list, (weather) => weather.chance[theme.id] ?? 0, rng, clear);
  // El mismo mal tiempo dos veces seguidas se haria eterno: despeja.
  return rolled === current && rolled !== clear ? clear : rolled;
}

/** Dias que dura un clima. */
export function rollDays(weather: WeatherType, rng: Rng): number {
  const [min, max] = weather.days;
  return randomInt(rng, min, max);
}

/** Pone el clima del principio (despejado) si la partida aun no lo tiene (al prepararla: el modulo del clima). */
export function ensureWeather(s: GameState): void {
  if (s.weather) return;
  const rng = dayRng(s);
  const clear = s.content.clearWeather;
  s.weather = { kind: clear.id, left: rollDays(clear, rng), next: rollWeather(s, themeOf(s), rng).id };
}

/** Lo que ha cambiado el clima al empezar una ronda. */
export interface WeatherChange {
  from: WeatherType;
  to: WeatherType;
}

/**
 * Pasa un dia (al acabar la ronda, despues de subir s.day: el modulo del clima): cuando se acaba el
 * clima entra el del pronostico y se decide el siguiente. Devuelve el cambio, o null si sigue igual.
 */
export function advanceWeather(s: GameState): WeatherChange | null {
  if (!s.weather) {
    ensureWeather(s);
    return null;
  }
  const weather: WeatherState = s.weather;
  weather.left--;
  if (weather.left > 0) return null;
  const rng = dayRng(s);
  const from = weatherTypeOf(s, weather.kind);
  const to = weatherTypeOf(s, weather.next);
  weather.kind = weather.next;
  weather.left = rollDays(to, rng);
  weather.next = rollWeather(s, themeOf(s), rng, to).id;
  return from === to ? null : { from, to };
}

/** El pronostico: el clima que entra al empezar la ronda siguiente, o null si mañana sigue igual. */
export function upcomingWeather(s: GameState): WeatherType | null {
  if (!s.weather || s.weather.left > 1 || s.weather.next === s.weather.kind) return null;
  return weatherTypeOf(s, s.weather.next);
}
