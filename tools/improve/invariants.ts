/**
 * Reglas que una partida nunca puede romper, digan lo que digan las reglas del juego en cada momento.
 * Las comprueba el cazador de fallos (fuzz.ts) despues de cada accion. Si una falla, es un fallo del
 * juego (o un invariante mal escrito): nunca "arreglarlo" relajando el invariante sin explicarlo.
 */
import { saveContext } from '@core/defaultGames';
import { MAX_LIFE } from '@core/data';
import { tablesOf } from '@core/gameContent';
import { canMoveOn, movementOf, commandUsed } from '@core/rules';
import { posKey } from '@core/geom';
import { mapGrid, terrainAt } from '@core/mapGrid';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/model';

export function checkInvariants(s: GameState): string[] {
  const { UNIT, UNIT_NAMES, BUILDING_NAMES, MAX_FUNDS } = tablesOf(s);
  const errs: string[] = [];
  const map = mapGrid(s);
  const where = new Map<string, number>();
  const uids = new Set<number>();
  for (const unit of s.units) {
    const id = `unidad ${unit.uid}`;
    if (uids.has(unit.uid)) errs.push(`${id}: uid repetido`);
    uids.add(unit.uid);
    if (!(unit.type >= 0 && unit.type < UNIT_NAMES.length)) errs.push(`${id}: tipo ${unit.type} no existe`);
    if (!map.contains(unit)) errs.push(`${id}: fuera del mapa (${unit.x},${unit.y})`);
    if (!(unit.life > 0 && unit.life <= MAX_LIFE)) errs.push(`${id}: vida ${unit.life} fuera de 1..${MAX_LIFE}`);
    if (unit.cargo.length !== UNIT.maxcarry[unit.type]) errs.push(`${id}: carga de tamaño ${unit.cargo.length}`);
    if (unit.carrier === null) {
      const key = posKey(unit);
      if (where.has(key)) errs.push(`${id}: comparte casilla (${key}) con la unidad ${where.get(key)}`);
      where.set(key, unit.uid);
      if (!canMoveOn(s, movementOf(s, unit.type), terrainAt(s, unit)))
        errs.push(`${id}: en un terreno por el que no puede ir (${unit.x},${unit.y})`);
    }
  }
  for (const unit of s.units) {
    if (unit.carrier !== null) {
      const carrier = s.units.find((other) => other.uid === unit.carrier);
      if (!carrier) errs.push(`unidad ${unit.uid}: su transporte ${unit.carrier} no existe`);
      else if (!carrier.cargo.includes(unit.uid)) errs.push(`unidad ${unit.uid}: el transporte ${carrier.uid} no la lleva`);
      else if (carrier.team !== unit.team) errs.push(`unidad ${unit.uid}: va en un transporte enemigo`);
    }
    for (const passengerUid of unit.cargo)
      if (passengerUid !== null && s.units.find((other) => other.uid === passengerUid)?.carrier !== unit.uid)
        errs.push(`unidad ${unit.uid}: lleva a ${passengerUid} que no va dentro`);
  }
  for (const team of [0, 1] as const) {
    const funds = s.funds[team];
    if (!(Number.isInteger(funds) && funds >= 0 && funds <= MAX_FUNDS)) errs.push(`dinero del bando ${team}: ${funds}`);
    const count = s.units.filter((unit) => unit.team === team).length;
    if (count > s.rules.maxUnits) errs.push(`bando ${team}: ${count} unidades, el limite es ${s.rules.maxUnits}`);
    const cp = commandUsed(s, team);
    if (s.rules.commandPoints !== null && cp > s.rules.commandPoints)
      errs.push(`bando ${team}: ${cp} puntos de mando, el limite es ${s.rules.commandPoints}`);
  }
  const bpos = new Set<string>();
  for (const building of s.buildings) {
    const key = posKey(building);
    if (bpos.has(key)) errs.push(`dos edificios en (${key})`);
    bpos.add(key);
    if (!(building.type >= 0 && building.type < BUILDING_NAMES.length)) errs.push(`edificio en (${key}): tipo ${building.type}`);
    if (building.capture) {
      const cu = s.units.find((unit) => unit.uid === building.capture!.uid);
      if (building.capture.left <= 0) errs.push(`edificio en (${key}): captura con ${building.capture.left} puntos`);
      if (cu && (cu.x !== building.x || cu.y !== building.y) && cu.carrier === null)
        errs.push(`edificio en (${key}): lo captura la unidad ${cu.uid}, que no esta encima`);
    }
  }
  if (s.nextUid <= Math.max(0, ...uids)) errs.push(`nextUid ${s.nextUid} no es mayor que los uid usados`);
  // Guardar y cargar no pierde nada.
  const back = deserialize(serialize(s), saveContext(s.content));
  if (!back) errs.push('la partida no se puede volver a cargar (deserialize la rechaza)');
  else if (serialize(back) !== serialize(s)) errs.push('guardar y cargar cambia la partida');
  return errs;
}
