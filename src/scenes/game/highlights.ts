/**
 * Casillas marcadas en el mapa segun la fase (alcance, objetivos, grupo...). Funcion pura: la escena
 * le pasa lo que hay elegido y dibuja el resultado con MapView.
 */
import { MAP_H, MAP_W, UNIT } from '../../core/data';
import { moveRange, reachableTiles, unitAt, unitById, unitThreat, type MoveRange } from '../../core/rules';
import { squadUnits } from '../../core/squads';
import type { GameState, Pos } from '../../core/types';
import type { HighlightKind } from '../../ui/mapView';
import { key, type Phase } from './types';

export interface HighlightInput {
  s: GameState;
  phase: Phase;
  cursor: Pos;
  /** Alcance de la unidad que se mueve, y adonde se puede unir o subir. */
  range: MoveRange | null;
  merge: ReadonlyMap<string, number>;
  load: ReadonlyMap<string, number>;
  attack: ReadonlyMap<string, number>;
  unload: ReadonlySet<string>;
  /** Unidades del menu de ordenes de una casilla (fase 'orderMenu'). */
  orderMenuUids: readonly number[] | null;
  /** Unidades a las que se esta dando una orden con destino (fase 'target'). */
  orderingUids: readonly number[] | null;
  /** Area de la habilidad del general que se apunta en `c`. */
  targetArea: (c: Pos) => Pos[];
  group: ReadonlySet<number>;
  inspectUid: number | null;
  enemyPlaying: boolean;
  visible: (p: Pos) => boolean;
}

export interface Highlights {
  tiles: Map<string, HighlightKind>;
  /** La unidad cuyo alcance se enseñaba ya no esta (o no se ve): hay que dejar de señalarla. */
  inspectGone: boolean;
}

export function computeHighlights(i: HighlightInput): Highlights {
  const h = new Map<string, HighlightKind>();
  let inspectGone = false;
  const markUnits = (uids: Iterable<number>) => {
    for (const uid of uids) {
      const u = unitById(i.s, uid);
      if (u) h.set(`${u.x},${u.y}`, 'group');
    }
  };
  if (i.phase === 'move' && i.range) {
    for (const p of reachableTiles(i.range)) h.set(key(p), 'move');
    for (const k of i.merge.keys()) h.set(k, 'merge');
    for (const k of i.load.keys()) h.set(k, 'load');
  } else if (i.phase === 'attack') {
    for (const k of i.attack.keys()) h.set(k, 'attack');
  } else if (i.phase === 'unloadTile') {
    for (const k of i.unload) h.set(k, 'unload');
  } else if (i.phase === 'orderMenu' && i.orderMenuUids) {
    markUnits(i.orderMenuUids);
  } else if (i.phase === 'target' && i.orderingUids) {
    markUnits(i.orderingUids);
  } else if (i.phase === 'target') {
    for (const p of i.targetArea(i.cursor)) h.set(key(p), 'attack');
  } else if (i.phase === 'map' && i.group.size) {
    markUnits(i.group);
  } else if (i.phase === 'map' && i.inspectUid === null) {
    // Solo pasando por encima de una unidad propia: su alcance, en tenue.
    const c = i.cursor;
    const u = unitAt(i.s, c.x, c.y);
    if (u && u.team === 0 && u.active && u.canMove && u.carrier === null && !i.enemyPlaying) {
      const r = moveRange(i.s, u);
      for (const p of reachableTiles(r)) h.set(key(p), 'hover');
    }
    // [CAMBIO] Señalando una unidad de escuadra: se marcan sus compañeras.
    if (u && u.team === 0 && u.squad !== undefined && !i.enemyPlaying)
      for (const o of squadUnits(i.s, u.squad)) if (o.uid !== u.uid && o.carrier === null) h.set(key(o), 'squad');
  } else if (i.phase === 'map' && i.inspectUid !== null) {
    // Alcance de una unidad señalada: adonde llega y que puede atacar en su proximo turno.
    const u = unitById(i.s, i.inspectUid);
    if (u && u.carrier === null && (u.team === 0 || i.visible(u))) {
      const r = moveRange(i.s, { ...u, active: true, canMove: true });
      const reach = 'reach';
      const threat = unitThreat(i.s, u);
      for (let x = 0; x < MAP_W; x++)
        for (let y = 0; y < MAP_H; y++) {
          if (r.steps[x]![y]! > 0 && UNIT.mover[u.type]! > 0) h.set(`${x},${y}`, reach);
          else if (threat[x]![y]) h.set(`${x},${y}`, 'attack');
        }
    } else inspectGone = true;
  }
  return { tiles: h, inspectGone };
}
