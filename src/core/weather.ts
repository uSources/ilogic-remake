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
import { themeOf, weatherTypeOf, keyOf } from './gameContent';
import type { MoveType, Theme, WeatherType } from './content';
import { seededRng } from './geom';
import type { GameState, Rng, WeatherState } from './model';

/** Clima de la partida ahora mismo (despejado, `content.clearWeather`, si la regla esta quitada). */
export function weatherNow(s: GameState): WeatherType {
  return s.rules.weather && s.weather ? weatherTypeOf(s, s.weather.kind) : s.content.clearWeather;
}

/** Cambio de movimiento por el clima para un tipo de movimiento. */
export const weatherMove = (s: GameState, movement: MoveType): number => weatherNow(s).move[movement];

/** Cambio del radio de vision de las unidades por el clima. */
export const weatherVision = (s: GameState): number => weatherNow(s).vision;

/** Multiplicador de la probabilidad de acierto por el clima. */
export const weatherHit = (s: GameState): number => weatherNow(s).hitChance;

/** Numero aleatorio del dia: depende solo de la semilla del mapa y del dia. */
function dayRng(s: GameState): Rng {
  const seed = (s.setup?.seed ?? 0) >>> 0;
  const rng = seededRng((seed ^ Math.imul(s.day + 1, 0x9e3779b1) ^ 0x5eed) >>> 0);
  rng();
  return rng;
}

/**
 * Elige un clima segun los pesos del tema (weather.json, "chance"); si sale el mismo mal tiempo que
 * hay, despeja.
 */
export function rollWeather(s: GameState, theme: Theme, rng: Rng, current: WeatherType = s.content.clearWeather): WeatherType {
  const clear = s.content.clearWeather;
  const rolled = pickWeighted(s.content.weather.list, (weather) => weather.chance[theme.id] ?? 0, rng) ?? clear;
  // El mismo mal tiempo dos veces seguidas se haria eterno: despeja.
  return rolled === current && rolled !== clear ? clear : rolled;
}

/** Uno elegido al azar segun los pesos (null si la tirada se pasa de todos). */
function pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number, rng: Rng): T | null {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  return null;
}

/** Dias que dura un clima. */
export function rollDays(weather: WeatherType, rng: Rng): number {
  const [min, max] = weather.days;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Como guarda la partida un clima (WeatherState). */
const weatherKey = (s: GameState, weather: WeatherType) => keyOf(s.content.weather, weather);

/** Pone el clima del principio (despejado) si la partida aun no lo tiene. */
export function ensureWeather(s: GameState): void {
  if (!s.rules.weather || s.weather) return;
  const rng = dayRng(s);
  const clear = s.content.clearWeather;
  s.weather = { kind: weatherKey(s, clear), left: rollDays(clear, rng), next: weatherKey(s, rollWeather(s, themeOf(s), rng)) };
}

/** Lo que ha cambiado el clima al empezar la ronda (para el resumen y la interfaz). */
export interface WeatherChange {
  from: WeatherType;
  to: WeatherType;
}

/**
 * Pasa un dia (lo llama endRound despues de subir s.day): cuando se acaba el clima entra el del
 * pronostico y se decide el siguiente. Devuelve el cambio, o null si sigue igual.
 */
export function advanceWeather(s: GameState): WeatherChange | null {
  if (!s.rules.weather) return null;
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
  weather.next = weatherKey(s, rollWeather(s, themeOf(s), rng, to));
  return from === to ? null : { from, to };
}

/** Pronostico: el clima que entra al empezar la ronda siguiente, o null si mañana sigue igual. */
export function forecast(s: GameState): WeatherType | null {
  if (!s.rules.weather || !s.weather || s.weather.left > 1 || s.weather.next === s.weather.kind) return null;
  return weatherTypeOf(s, s.weather.next);
}
