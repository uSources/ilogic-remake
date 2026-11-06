/**
 * Captura de edificios: puntos, capturas a medias y el evento que las cuenta.
 */

import { isHq } from '../gameContent';
import { captureFactor } from '../abilities';
import { isCapturer } from '../util/predicates';
import type { Building, GameEvent, GameState, Pos, TeamId, Unit } from '../model';
import { buildingAt, unitAt } from './queries';
import { posOf } from '../geom';
import { isHostile } from '../teams';
import { canMoveNow, canStillAct, spendUnit } from './unitTurn';

/** Puntos de captura de un edificio con las reglas de la partida. */
export function capturePointsOf(s: GameState, building: Building): number {
  return isHq(s, building) ? s.rules.hqCapturePoints : s.rules.capturePoints;
}

/** Lo que resta una unidad al capturar: su vida / 10 (y mas con la habilidad quickCapture). */
export const captureStrength = (s: GameState, unit: Unit): number => Math.ceil((unit.life / 10) * captureFactor(s, unit));

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
 * (npm run fuzz). Es una de las INVARIANTS (rules/invariants.ts), que repasan `dispatch` despues de
 * cada accion y `endRound`; es el unico sitio que la borra (captureProgress solo consulta). Devuelve
 * un suceso 'captureDropped' por cada una.
 */
export function dropStaleCaptures(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const building of s.buildings) {
    const progress = building.capture;
    if (!progress || captureProgress(s, building)) continue;
    building.capture = null;
    events.push({ kind: 'captureDropped', actor: null, at: posOf(building), uid: progress.uid, team: progress.team });
  }
  return events;
}

/**
 * La unidad podria capturar el edificio de `at` si estuviera alli (neutral o enemigo: los de la propia
 * alianza, no). No mira si le queda turno: para lo que pasaria al llevarla alli (la escena).
 */
export function canCaptureAt(s: GameState, unit: Unit, at: Pos): boolean {
  if (!isCapturer(s, unit)) return false;
  const building = buildingAt(s, at);
  return !!building && (building.owner === null || isHostile(s, building.owner, unit.team));
}

/** Se puede capturar ya el edificio de debajo: le queda turno y podria (canCaptureAt). */
export function canCapture(s: GameState, unit: Unit): boolean {
  return canStillAct(unit) && canCaptureAt(s, unit, unit);
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
 * Capturar el edificio de debajo (`building`), ya comprobado (canCapture). [CAMBIO] En 2013 era al instante (uno
 * enemigo pasaba primero a neutral); ahora cada turno resta la vida/10 de la unidad a sus puntos
 * (capturePoints, la Base hqCapturePoints) y al llegar a 0 pasa a ser suyo directamente. Si la unidad
 * se va o muere, se pierde lo avanzado (dropStaleCaptures). Tomar la Base enemiga gana la partida.
 */
export function advanceCapture(s: GameState, unit: Unit, building: Building): CaptureResult {
  spendUnit(unit);
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
export function captureEvent(actor: TeamId, unit: Unit, building: Building, result: { left: number; total: number }): GameEvent {
  const at = posOf(building);
  return { kind: 'capture', actor, uid: unit.uid, at, owner: building.owner, left: result.left, total: result.total };
}

/**
 * [CAMBIO] Las unidades del equipo sin usar encima de un edificio que pueden capturar: capturan solas
 * al acabar el turno (TURN_END_PHASES).
 */
export const autoCapturers = (s: GameState, team: TeamId): Unit[] =>
  s.units.filter((unit) => unit.team === team && canMoveNow(unit) && canCapture(s, unit));
