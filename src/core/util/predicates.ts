/**
 * Preguntas cortas que se repiten por todo el nucleo: de que bando es una unidad, si va dentro de un
 * transporte, si puede luchar o capturar. Con nombre en vez de `team === 0` o `UNIT.canfight[...]`
 * sueltos (docs/ESTILO.md, regla 4). Sin efectos.
 */
import { UNIT } from '../data';
import type { Team, Unit } from '../model';

/** El bando del jugador (el 1 es la IA, ver Team). */
export const PLAYER: Team = 0;
/** El bando de la IA. */
export const AI_TEAM: Team = 1;

/** El bando es el del jugador. */
export function isPlayer(team: Team | null): boolean {
  return team === PLAYER;
}

/** El otro bando. */
export function opponentOf(team: Team): Team {
  return team === PLAYER ? AI_TEAM : PLAYER;
}

/** Son de bandos distintos. */
export function isEnemyOf(a: { team: Team }, b: { team: Team }): boolean {
  return a.team !== b.team;
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
export function canFight(unit: Pick<Unit, 'type'>): boolean {
  return !!UNIT.canfight[unit.type];
}

/**
 * Su tipo puede capturar edificios (units.json, "captures"). No mira si hay un edificio debajo: eso
 * es `canCapture` de rules/capture.ts.
 */
export function isCapturer(unit: Pick<Unit, 'type'>): boolean {
  return !!UNIT.cancapt[unit.type];
}
