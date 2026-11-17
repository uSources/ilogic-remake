/**
 * Hasta donde ataca la unidad elegida este turno (el borde rojo): las casillas a las que podria
 * disparar desde cualquier sitio al que llega, o solo desde donde esta si ya no puede moverse o si
 * dispara sin moverse (la artilleria). Lo calcula el nucleo (`attackZone`, la misma regla que la
 * amenaza enemiga); aqui solo se decide que casillas se marcan. Puro.
 */
import { samePos } from '../../../core/geom';
import { mapGrid } from '../../../core/mapGrid';
import type { GameState, Pos, Unit } from '../../../core/model';
import { attackZone, canFight, canReach, canStillFire, inAttackRange, type MoveRange } from '../../../core/rules';
import type { Grid } from '../../../core/util/grid';
import { firesAfterMove } from '../../../core/util/predicates';

/** Las casillas en verdadero de una capa, como lista. */
function tilesOf(layer: Grid<boolean>): Pos[] {
  const tiles: Pos[] = [];
  layer.forEach((isMarked, pos) => {
    if (isMarked) tiles.push({ x: pos.x, y: pos.y });
  });
  return tiles;
}

/** Desde donde esta, sin moverse (ya se ha movido, o no le queda movimiento): su anillo de disparo. */
function fromWhereItStands(s: GameState, unit: Unit): Pos[] {
  if (!canFight(s, unit) || !canStillFire(s, unit)) return [];
  const tiles: Pos[] = [];
  mapGrid(s).forEach((_terrain, pos) => {
    if (inAttackRange(s, unit, unit, pos)) tiles.push({ x: pos.x, y: pos.y });
  });
  return tiles;
}

/**
 * Las casillas que se marcan con el borde rojo. Si se mueve y dispara, las de su alcance azul no: ya
 * se ve que llega, y a casi todas podria disparar desde la de al lado (se llenaria todo de rojo). La
 * artilleria, que dispara sin moverse, si las marca: desde donde esta, esas casillas estan a tiro.
 */
export function attackReachTiles(s: GameState, unit: Unit, range: MoveRange | null): Pos[] {
  const zone = range ? attackZone(s, unit, range) : null;
  const tiles = range ? (zone ? tilesOf(zone) : []) : fromWhereItStands(s, unit);
  const hidesReach = !!range && firesAfterMove(s, unit);
  return tiles.filter((pos) => !samePos(pos, unit) && !(hidesReach && range && canReach(range, pos)));
}
