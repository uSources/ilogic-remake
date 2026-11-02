/**
 * Captura de edificios: puntos, capturas a medias y el evento que las cuenta.
 */
import { HQ, RULES, UNIT } from '../data';
import { captureFactor } from '../abilities';
import type { Building, GameEvent, GameState, Unit } from '../types';
import { buildingAt, unitAt } from './queries';

/** Puntos de captura de un edificio con las reglas actuales. */
export function capturePointsOf(b: Building): number {
  return b.type === HQ ? RULES.hqCapturePoints : RULES.capturePoints;
}

/** Lo que resta una unidad al capturar: su vida / 10 (y mas con la habilidad quickCapture). */
export const captureStrength = (u: Unit): number => Math.ceil((u.life / 10) * captureFactor(u.type));

/** Captura a medias de un edificio (ver Building.capture). */
export type CaptureProgress = NonNullable<Building['capture']>;

/**
 * Captura a medias de un edificio, si sigue siendo valida (la unidad que la hacia sigue encima).
 * Si no, se borra.
 */
export function captureProgress(s: GameState, b: Building): CaptureProgress | null {
  const c = b.capture;
  if (!c) return null;
  const u = unitAt(s, b.x, b.y);
  if (!u || u.uid !== c.uid || u.team !== c.team || b.owner === c.team) {
    b.capture = null;
    return null;
  }
  return c;
}

/**
 * [CAMBIO] Una captura a medias se pierde en cuanto la unidad que capturaba se va o muere. Antes solo
 * se borraba al consultarla (captureProgress), asi que en las partidas sin pantalla (IA contra IA,
 * equilibrio) una unidad podia irse y volver sin perderla. Lo encontro el cazador de fallos
 * (npm run fuzz). Se llama al mover, unir, subir a un transporte y al quitar muertos.
 */
export function dropStaleCaptures(s: GameState): void {
  for (const b of s.buildings) if (b.capture) captureProgress(s, b);
}

/** Se puede capturar el edificio de debajo (neutral o enemigo). */
export function canCapture(s: GameState, u: Unit): boolean {
  if (!u.active || !UNIT.cancapt[u.type]) return false;
  const b = buildingAt(s, u.x, u.y);
  return !!b && b.owner !== u.team;
}

/**
 * Captura instantanea (Unit.Capture): neutral -> propio; enemigo -> neutral.
 * Quitar un edificio enemigo cuesta dos capturas. Neutralizar la Base enemiga gana la partida.
 * [CAMBIO] el original tambien dejaba "capturar" (neutralizar) un edificio propio.
 */
export interface CaptureResult {
  /** El edificio ha cambiado de dueño (o ha quedado neutral, en las reglas de 2013). */
  done: boolean;
  /** Puntos que le quedan (0 si ha terminado). */
  left: number;
  total: number;
}

/**
 * Capturar el edificio de debajo.
 * Reglas de 2013: al instante; uno enemigo pasa primero a neutral y luego a tuyo.
 * [CAMBIO] Reglas nuevas: cada turno resta la vida/10 de la unidad a sus puntos (20, la Base 30);
 * al llegar a 0 pasa a ser tuyo directamente. Si la unidad se va o muere, se pierde lo avanzado.
 */
export function capture(s: GameState, u: Unit): CaptureResult | null {
  if (!canCapture(s, u)) return null;
  const b = buildingAt(s, u.x, u.y)!;
  u.active = false;
  u.canMove = false;
  const total = capturePointsOf(b);
  const prev = captureProgress(s, b);
  const left = Math.max(0, (prev && prev.uid === u.uid ? prev.left : total) - captureStrength(u));
  if (left === 0) {
    b.owner = u.team;
    b.capture = null;
    return { done: true, left: 0, total };
  }
  b.capture = { team: u.team, uid: u.uid, left };
  return { done: false, left, total };
}

/** Evento de captura (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma. */
export function captureEvent(u: Unit, b: Building, r: { left: number; total: number }): GameEvent {
  return { kind: 'capture', uid: u.uid, at: { x: b.x, y: b.y }, owner: b.owner, left: r.left, total: r.total };
}
