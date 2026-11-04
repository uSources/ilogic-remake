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
import { tablesOf } from './gameContent';
import { type MoveType } from './data';
import { seededRng } from './geom';
import type { GameState, Rng, WeatherState } from './model';

/** Despejado: el clima neutro (el primero de weather.json). */
export const CLEAR = 0;

/** Clima de la partida ahora mismo (despejado si la regla esta quitada). */
export function weatherNow(s: GameState): number {
  return s.rules.weather && s.weather ? s.weather.kind : CLEAR;
}

/** Cambio de movimiento por el clima para un tipo de movimiento. */
export const weatherMove = (s: GameState, movement: MoveType): number => tablesOf(s).WEATHER.move[weatherNow(s)]![movement] ?? 0;

/** Cambio del radio de vision de las unidades por el clima. */
export const weatherVision = (s: GameState): number => tablesOf(s).WEATHER.vision[weatherNow(s)]!;

/** Multiplicador de la probabilidad de acierto por el clima. */
export const weatherHit = (s: GameState): number => tablesOf(s).WEATHER.hitChance[weatherNow(s)]!;

/** Numero aleatorio del dia: depende solo de la semilla del mapa y del dia. */
function dayRng(s: GameState): Rng {
  const seed = (s.setup?.seed ?? 0) >>> 0;
  const rng = seededRng((seed ^ Math.imul(s.day + 1, 0x9e3779b1) ^ 0x5eed) >>> 0);
  rng();
  return rng;
}

/** Elige un clima segun los pesos del tema; si sale el mismo mal tiempo que hay, despeja. */
export function rollWeather(s: GameState, theme: number, rng: Rng, current = CLEAR): number {
  const kind = pickWeighted(tablesOf(s).WEATHER.chance[theme] ?? tablesOf(s).WEATHER.chance[0]!, rng);
  // El mismo mal tiempo dos veces seguidas se haria eterno: despeja.
  return kind === current && kind !== CLEAR ? CLEAR : kind;
}

/** Indice elegido al azar segun los pesos (despejado si la tirada se pasa de todos). */
function pickWeighted(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let kind = 0; kind < weights.length; kind++) {
    roll -= weights[kind]!;
    if (roll < 0) return kind;
  }
  return CLEAR;
}

/** Dias que dura un clima. */
export function rollDays(s: GameState, kind: number, rng: Rng): number {
  const [min, max] = tablesOf(s).WEATHER.days[kind]!;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pone el clima del principio (despejado) si la partida aun no lo tiene. */
export function ensureWeather(s: GameState): void {
  if (!s.rules.weather || s.weather) return;
  const rng = dayRng(s);
  s.weather = { kind: CLEAR, left: rollDays(s, CLEAR, rng), next: rollWeather(s, s.theme, rng) };
}

/** Lo que ha cambiado el clima al empezar la ronda (para el resumen y la interfaz). */
export interface WeatherChange {
  from: number;
  to: number;
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
  const from = weather.kind;
  weather.kind = weather.next;
  weather.left = rollDays(s, weather.kind, rng);
  weather.next = rollWeather(s, s.theme, rng, weather.kind);
  return from === weather.kind ? null : { from, to: weather.kind };
}

/** Pronostico: el clima que entra al empezar la ronda siguiente, o null si mañana sigue igual. */
export function forecast(s: GameState): number | null {
  if (!s.rules.weather || !s.weather || s.weather.left > 1 || s.weather.next === s.weather.kind) return null;
  return s.weather.next;
}
