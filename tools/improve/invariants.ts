/**
 * Reglas que una partida nunca puede romper, digan lo que digan las reglas del juego en cada momento.
 * Las comprueba el cazador de fallos (fuzz.ts) despues de cada accion. Si una falla, es un fallo del
 * juego (o un invariante mal escrito): nunca "arreglarlo" relajando el invariante sin explicarlo.
 */
import { saveContext } from '@core/defaultGames';
import { MAX_LIFE } from '@core/data';
import { findBuildingType, findUnitType, terrainAt } from '@core/gameContent';
import { canMoveOn, movementOf, commandUsed } from '@core/rules';
import { posKey } from '@core/geom';
import { mapGrid } from '@core/mapGrid';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/model';

export function checkInvariants(s: GameState): string[] {
  const errors: string[] = [];
  const map = mapGrid(s);
  const where = new Map<string, number>();
  const uids = new Set<number>();
  for (const unit of s.units) {
    const id = `unidad ${unit.uid}`;
    if (uids.has(unit.uid)) errors.push(`${id}: uid repetido`);
    uids.add(unit.uid);
    const unitType = findUnitType(s, unit);
    if (!unitType) errors.push(`${id}: tipo ${unit.type} no existe`);
    if (!map.contains(unit)) errors.push(`${id}: fuera del mapa (${unit.x},${unit.y})`);
    if (!(unit.life > 0 && unit.life <= MAX_LIFE)) errors.push(`${id}: vida ${unit.life} fuera de 1..${MAX_LIFE}`);
    if (unit.cargo.length !== unitType?.cargoSlots) errors.push(`${id}: carga de tamaño ${unit.cargo.length}`);
    if (unit.carrier === null) {
      const key = posKey(unit);
      if (where.has(key)) errors.push(`${id}: comparte casilla (${key}) con la unidad ${where.get(key)}`);
      where.set(key, unit.uid);
      if (!canMoveOn(movementOf(s, unit), terrainAt(s, unit)))
        errors.push(`${id}: en un terreno por el que no puede ir (${unit.x},${unit.y})`);
    }
  }
  for (const unit of s.units) {
    if (unit.carrier !== null) {
      const carrier = s.units.find((other) => other.uid === unit.carrier);
      if (!carrier) errors.push(`unidad ${unit.uid}: su transporte ${unit.carrier} no existe`);
      else if (!carrier.cargo.includes(unit.uid)) errors.push(`unidad ${unit.uid}: el transporte ${carrier.uid} no la lleva`);
      else if (carrier.team !== unit.team) errors.push(`unidad ${unit.uid}: va en un transporte enemigo`);
    }
    for (const passengerUid of unit.cargo)
      if (passengerUid !== null && s.units.find((other) => other.uid === passengerUid)?.carrier !== unit.uid)
        errors.push(`unidad ${unit.uid}: lleva a ${passengerUid} que no va dentro`);
  }
  for (const { id: team, funds } of s.teams) {
    if (!(Number.isInteger(funds) && funds >= 0 && funds <= s.content.maxFunds)) errors.push(`dinero del equipo ${team}: ${funds}`);
    const count = s.units.filter((unit) => unit.team === team).length;
    if (count > s.rules.maxUnits) errors.push(`equipo ${team}: ${count} unidades, el limite es ${s.rules.maxUnits}`);
    const commandPoints = commandUsed(s, team);
    if (s.rules.commandPoints !== null && commandPoints > s.rules.commandPoints)
      errors.push(`equipo ${team}: ${commandPoints} puntos de mando, el limite es ${s.rules.commandPoints}`);
  }
  const bpos = new Set<string>();
  for (const building of s.buildings) {
    const key = posKey(building);
    if (bpos.has(key)) errors.push(`dos edificios en (${key})`);
    bpos.add(key);
    if (!findBuildingType(s, building)) errors.push(`edificio en (${key}): tipo ${building.type}`);
    if (building.capture) {
      const capturer = s.units.find((unit) => unit.uid === building.capture!.uid);
      if (building.capture.left <= 0) errors.push(`edificio en (${key}): captura con ${building.capture.left} puntos`);
      if (capturer && (capturer.x !== building.x || capturer.y !== building.y) && capturer.carrier === null)
        errors.push(`edificio en (${key}): lo captura la unidad ${capturer.uid}, que no esta encima`);
    }
  }
  if (s.nextUid <= Math.max(0, ...uids)) errors.push(`nextUid ${s.nextUid} no es mayor que los uid usados`);
  const squadIds = (s.squads ?? []).map((squad) => squad.id);
  if (s.nextSquadId <= Math.max(0, ...squadIds)) errors.push(`nextSquadId ${s.nextSquadId} no es mayor que las escuadras que hay`);
  // Guardar y cargar no pierde nada.
  const back = deserialize(serialize(s), saveContext(s.content));
  if (!back) errors.push('la partida no se puede volver a cargar (deserialize la rechaza)');
  else if (serialize(back) !== serialize(s)) errors.push('guardar y cargar cambia la partida');
  return errors;
}
