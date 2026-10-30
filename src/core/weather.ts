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
import { RULES, WEATHER, WEATHER_TYPES, type MoveType } from './data';
import { seededRng } from './geom';
import type { GameState, Rng, WeatherState } from './types';

/** Despejado: el clima neutro (el primero de weather.json). */
export const CLEAR = 0;

/** Clima de la partida ahora mismo (despejado si la regla esta quitada). */
export function weatherNow(s: GameState): number {
  return RULES.weather && s.weather ? s.weather.kind : CLEAR;
}

/** Cambio de movimiento por el clima para un tipo de movimiento. */
export const weatherMove = (s: GameState, mt: MoveType): number => WEATHER.move[weatherNow(s)]![mt] ?? 0;

/** Cambio del radio de vision de las unidades por el clima. */
export const weatherVision = (s: GameState): number => WEATHER.vision[weatherNow(s)]!;

/** Multiplicador de la probabilidad de acierto por el clima. */
export const weatherHit = (s: GameState): number => WEATHER.hitChance[weatherNow(s)]!;

/** Numero aleatorio del dia: depende solo de la semilla del mapa y del dia. */
function dayRng(s: GameState): Rng {
  const seed = (s.setup?.seed ?? 0) >>> 0;
  const rng = seededRng((seed ^ Math.imul(s.day + 1, 0x9e3779b1) ^ 0x5eed) >>> 0);
  rng();
  return rng;
}

/** Elige un clima segun los pesos del tema; si sale el mismo mal tiempo que hay, despeja. */
export function rollWeather(theme: number, rng: Rng, current = CLEAR): number {
  const w = WEATHER.chance[theme] ?? WEATHER.chance[0]!;
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let kind = CLEAR;
  for (let i = 0; i < WEATHER_TYPES; i++) {
    r -= w[i]!;
    if (r < 0) {
      kind = i;
      break;
    }
  }
  return kind === current && kind !== CLEAR ? CLEAR : kind;
}

/** Dias que dura un clima. */
export function rollDays(kind: number, rng: Rng): number {
  const [min, max] = WEATHER.days[kind]!;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pone el clima del principio (despejado) si la partida aun no lo tiene. */
export function ensureWeather(s: GameState): void {
  if (!RULES.weather || s.weather) return;
  const rng = dayRng(s);
  s.weather = { kind: CLEAR, left: rollDays(CLEAR, rng), next: rollWeather(s.theme, rng) };
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
  if (!RULES.weather) return null;
  if (!s.weather) {
    ensureWeather(s);
    return null;
  }
  const w: WeatherState = s.weather;
  w.left--;
  if (w.left > 0) return null;
  const rng = dayRng(s);
  const from = w.kind;
  w.kind = w.next;
  w.left = rollDays(w.kind, rng);
  w.next = rollWeather(s.theme, rng, w.kind);
  return from === w.kind ? null : { from, to: w.kind };
}

/** Pronostico: el clima que entra al empezar la ronda siguiente, o null si mañana sigue igual. */
export function forecast(s: GameState): number | null {
  if (!RULES.weather || !s.weather || s.weather.left > 1 || s.weather.next === s.weather.kind) return null;
  return s.weather.next;
}
