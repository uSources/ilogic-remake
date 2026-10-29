/**
 * Reglas que una partida nunca puede romper, digan lo que digan las reglas del juego en cada momento.
 * Las comprueba el cazador de fallos (fuzz.ts) despues de cada accion. Si una falla, es un fallo del
 * juego (o un invariante mal escrito): nunca "arreglarlo" relajando el invariante sin explicarlo.
 */
import { BUILDING_TYPES, MAX_FUNDS, MAX_LIFE, RULES, TERRAIN, UNIT, UNIT_TYPES } from '../../src/core/data';
import { deserialize, serialize } from '../../src/core/save';
import type { GameState } from '../../src/core/types';

export function checkInvariants(s: GameState): string[] {
  const errs: string[] = [];
  const W = s.map.length,
    H = s.map[0]!.length;
  const where = new Map<string, number>();
  const uids = new Set<number>();
  for (const u of s.units) {
    const id = `unidad ${u.uid}`;
    if (uids.has(u.uid)) errs.push(`${id}: uid repetido`);
    uids.add(u.uid);
    if (!(u.type >= 0 && u.type < UNIT_TYPES)) errs.push(`${id}: tipo ${u.type} no existe`);
    if (u.x < 0 || u.y < 0 || u.x >= W || u.y >= H) errs.push(`${id}: fuera del mapa (${u.x},${u.y})`);
    if (!(u.life > 0 && u.life <= MAX_LIFE)) errs.push(`${id}: vida ${u.life} fuera de 1..${MAX_LIFE}`);
    if (u.fuel < 0 || u.fuel > UNIT.maxfuel[u.type]!) errs.push(`${id}: combustible ${u.fuel} fuera de 0..${UNIT.maxfuel[u.type]}`);
    if (u.ammo < 0 || u.ammo > UNIT.maxammo[u.type]!) errs.push(`${id}: municion ${u.ammo} fuera de 0..${UNIT.maxammo[u.type]}`);
    if (u.cargo.length !== UNIT.maxcarry[u.type]) errs.push(`${id}: carga de tamaño ${u.cargo.length}`);
    if (u.carrier === null) {
      const k = `${u.x},${u.y}`;
      if (where.has(k)) errs.push(`${id}: comparte casilla (${k}) con la unidad ${where.get(k)}`);
      where.set(k, u.uid);
      const mt = UNIT.movtype[u.type]!;
      if (!TERRAIN.canwalk[mt]![s.map[u.x]![u.y]!]) errs.push(`${id}: en un terreno por el que no puede ir (${u.x},${u.y})`);
    }
  }
  for (const u of s.units) {
    if (u.carrier !== null) {
      const c = s.units.find((v) => v.uid === u.carrier);
      if (!c) errs.push(`unidad ${u.uid}: su transporte ${u.carrier} no existe`);
      else if (!c.cargo.includes(u.uid)) errs.push(`unidad ${u.uid}: el transporte ${c.uid} no la lleva`);
      else if (c.team !== u.team) errs.push(`unidad ${u.uid}: va en un transporte enemigo`);
    }
    for (const c of u.cargo)
      if (c !== null && s.units.find((v) => v.uid === c)?.carrier !== u.uid) errs.push(`unidad ${u.uid}: lleva a ${c} que no va dentro`);
  }
  for (const t of [0, 1] as const) {
    const f = s.funds[t];
    if (!(Number.isInteger(f) && f >= 0 && f <= MAX_FUNDS)) errs.push(`dinero del bando ${t}: ${f}`);
    const n = s.units.filter((u) => u.team === t).length;
    if (n > RULES.maxUnits) errs.push(`bando ${t}: ${n} unidades, el limite es ${RULES.maxUnits}`);
  }
  const bpos = new Set<string>();
  for (const b of s.buildings) {
    const k = `${b.x},${b.y}`;
    if (bpos.has(k)) errs.push(`dos edificios en (${k})`);
    bpos.add(k);
    if (!(b.type >= 0 && b.type < BUILDING_TYPES)) errs.push(`edificio en (${k}): tipo ${b.type}`);
    if (b.capture) {
      const cu = s.units.find((u) => u.uid === b.capture!.uid);
      if (b.capture.left <= 0) errs.push(`edificio en (${k}): captura con ${b.capture.left} puntos`);
      if (cu && (cu.x !== b.x || cu.y !== b.y) && cu.carrier === null)
        errs.push(`edificio en (${k}): lo captura la unidad ${cu.uid}, que no esta encima`);
    }
  }
  if (s.nextUid <= Math.max(0, ...uids)) errs.push(`nextUid ${s.nextUid} no es mayor que los uid usados`);
  // Guardar y cargar no pierde nada.
  const back = deserialize(serialize(s));
  if (!back) errs.push('la partida no se puede volver a cargar (deserialize la rechaza)');
  else if (serialize(back) !== serialize(s)) errs.push('guardar y cargar cambia la partida');
  return errs;
}
