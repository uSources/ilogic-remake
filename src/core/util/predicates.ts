/**
 * Preguntas cortas que se repiten por todo el nucleo: si dos unidades son enemigas, si va dentro de un
 * transporte, si puede luchar o capturar. Con nombre en vez de `a.team !== b.team` o
 * `unitTypeOf(s, unit).attack !== null` sueltos (docs/ESTILO.md, regla 4). Sin efectos.
 */

import { unitTypeOf } from '../gameContent';
import type { GameState, Unit } from '../model';
import { isHostile } from '../teams';

/** Las dos son de equipos enemigos (alianzas distintas: ver teams.ts). */
export function areEnemies(s: GameState, first: Pick<Unit, 'team'>, second: Pick<Unit, 'team'>): boolean {
  return isHostile(s, first.team, second.team);
}

/** Esta en el mapa, no dentro de un transporte (los pasajeros no ocupan casilla ni luchan). */
export function isOnMap(unit: Pick<Unit, 'carrier'>): boolean {
  return unit.carrier === null;
}

/** Le queda vida (las muertas se quitan con removeDead, pero a mitad de un ataque aun estan). */
export function isAlive(unit: Pick<Unit, 'life'>): boolean {
  return unit.life > 0;
}

/** Su tipo puede atacar (units.json, "attack"). No mira si ya ha disparado este turno. */
export function canFight(s: GameState, unit: Pick<Unit, 'type'>): boolean {
  return unitTypeOf(s, unit).attack !== null;
}

/** Ataca a distancia: no puede disparar a la casilla de al lado (alcance minimo > 1). */
export function isRanged(s: GameState, unit: Pick<Unit, 'type'>): boolean {
  return (unitTypeOf(s, unit).attack?.minRange ?? 1) > 1;
}

/** Puede moverse y disparar en el mismo turno (units.json, "attack.firesAfterMove"; la artilleria no). */
export function firesAfterMove(s: GameState, unit: Pick<Unit, 'type'>): boolean {
  return unitTypeOf(s, unit).attack?.firesAfterMove ?? false;
}

/**
 * Su tipo puede capturar edificios (units.json, "captures"). No mira si hay un edificio debajo: eso
 * es `canCapture` de rules/capture.ts.
 */
export function isCapturer(s: GameState, unit: Pick<Unit, 'type'>): boolean {
  return unitTypeOf(s, unit).canCapture;
}
