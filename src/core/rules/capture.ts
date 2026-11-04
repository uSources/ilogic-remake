/**
 * Captura de edificios: puntos, capturas a medias y el evento que las cuenta.
 */

import { tablesOf } from '../gameContent';
import { captureFactor } from '../abilities';
import { isCapturer } from '../util/predicates';
import type { Building, GameEvent, GameState, Unit } from '../model';
import { buildingAt, unitAt } from './queries';

/** Puntos de captura de un edificio con las reglas de la partida. */
export function capturePointsOf(s: GameState, building: Building): number {
  return building.type === tablesOf(s).HQ ? s.rules.hqCapturePoints : s.rules.capturePoints;
}

/** Lo que resta una unidad al capturar: su vida / 10 (y mas con la habilidad quickCapture). */
export const captureStrength = (s: GameState, unit: Unit): number => Math.ceil((unit.life / 10) * captureFactor(s, unit.type));

/** Captura a medias de un edificio (ver Building.capture). */
export type CaptureProgress = NonNullable<Building['capture']>;

/** La captura a medias sigue valiendo: la misma unidad sigue encima y el edificio aun no es suyo. */
function isStillCapturing(s: GameState, building: Building, progress: CaptureProgress): boolean {
  const unitHere = unitAt(s, building);
  return !!unitHere && unitHere.uid === progress.uid && unitHere.team === progress.team && building.owner !== progress.team;
}

/**
 * Captura a medias de un edificio, si sigue siendo valida (la unidad que la hacia sigue encima).
 * Solo consulta: la que ya no vale la borra `dropStaleCaptures`.
 */
export function captureProgress(s: GameState, building: Building): CaptureProgress | null {
  const progress = building.capture;
  return progress && isStillCapturing(s, building, progress) ? progress : null;
}

/**
 * [CAMBIO] Una captura a medias se pierde en cuanto la unidad que capturaba se va o muere. Antes solo
 * se borraba al consultarla (captureProgress), asi que en las partidas sin pantalla (IA contra IA,
 * equilibrio) una unidad podia irse y volver sin perderla. Lo encontro el cazador de fallos
 * (npm run fuzz). Se llama al mover, unir, subir a un transporte, al quitar muertos y al acabar la
 * ronda, y es el unico sitio que la borra (captureProgress solo consulta).
 */
export function dropStaleCaptures(s: GameState): void {
  for (const building of s.buildings) if (building.capture && !captureProgress(s, building)) building.capture = null;
}

/** Se puede capturar el edificio de debajo (neutral o enemigo). */
export function canCapture(s: GameState, unit: Unit): boolean {
  if (!unit.active || !isCapturer(s, unit)) return false;
  const building = buildingAt(s, unit);
  return !!building && building.owner !== unit.team;
}

/**
 * Lo que ha hecho una captura (ver capture). [CAMBIO] el original tambien dejaba "capturar"
 * (neutralizar) un edificio propio.
 */
export interface CaptureResult {
  /** El edificio ha pasado a ser de quien capturaba. */
  done: boolean;
  /** Puntos que le quedan (0 si ha terminado). */
  left: number;
  total: number;
}

/** Puntos que le quedan al edificio antes de este turno: lo que dejo esta unidad o todos. */
function pointsLeftBefore(s: GameState, building: Building, unit: Unit, total: number): number {
  const progress = captureProgress(s, building);
  return progress && progress.uid === unit.uid ? progress.left : total;
}

/**
 * Capturar el edificio de debajo. [CAMBIO] En 2013 era al instante (uno enemigo pasaba primero a
 * neutral); ahora cada turno resta la vida/10 de la unidad a sus puntos (capturePoints, la Base
 * hqCapturePoints) y al llegar a 0 pasa a ser suyo directamente. Si la unidad se va o muere, se
 * pierde lo avanzado (dropStaleCaptures). Tomar la Base enemiga gana la partida.
 */
export function capture(s: GameState, unit: Unit): CaptureResult | null {
  if (!canCapture(s, unit)) return null;
  const building = buildingAt(s, unit)!;
  unit.active = false;
  unit.canMove = false;
  const total = capturePointsOf(s, building);
  const left = Math.max(0, pointsLeftBefore(s, building, unit, total) - captureStrength(s, unit));
  if (left === 0) {
    building.owner = unit.team;
    building.capture = null;
    return { done: true, left: 0, total };
  }
  building.capture = { team: unit.team, uid: unit.uid, left };
  return { done: false, left, total };
}

/** Evento de captura (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma. */
export function captureEvent(unit: Unit, building: Building, result: { left: number; total: number }): GameEvent {
  const at = { x: building.x, y: building.y };
  return { kind: 'capture', uid: unit.uid, at, owner: building.owner, left: result.left, total: result.total };
}
