/**
 * Desplazar el mapa con el puntero en el borde de la pantalla: con el raton parado cerca del borde,
 * o llevando una unidad (con el raton o con el dedo).
 */
import type { Pt } from './basics';

/** Franja del borde (pixeles CSS) y velocidad (pixeles CSS por ms) de un tipo de desplazamiento. */
export interface EdgeZone {
  margin: number;
  speed: number;
}

/** Raton parado cerca del borde de la pantalla, sin arrastrar. */
export const EDGE_HOVER: EdgeZone = { margin: 14, speed: 0.9 };
/** Llevando una unidad con el raton cerca del borde. */
export const EDGE_CARRY_MOUSE: EdgeZone = { margin: 24, speed: 0.6 };
/** Llevando una unidad con el dedo (franja mas ancha: el dedo tapa). */
export const EDGE_CARRY_TOUCH: EdgeZone = { margin: 40, speed: 0.6 };

/** -1 antes de la franja de un lado, 1 pasada la del otro, 0 en medio. */
function edgeSide(position: number, size: number, edge: number): -1 | 0 | 1 {
  if (position < edge) return -1;
  if (position > size - edge) return 1;
  return 0;
}

/**
 * Cuanto desplazar el mapa (pixeles del lienzo) en `dt` ms con el puntero en `p`, en una vista de
 * `w` x `h` pixeles del lienzo. `dpr`: densidad de pantalla (franja y velocidad son en pixeles CSS).
 * {0, 0} si el puntero no esta en la franja del borde.
 */
export function edgeScroll(p: Pt, w: number, h: number, dt: number, zone: EdgeZone, dpr: number): Pt {
  const edge = zone.margin * dpr;
  const step = dt * zone.speed * dpr;
  return { x: edgeSide(p.x, w, edge) * step, y: edgeSide(p.y, h, edge) * step };
}

/** Lo que importa para saber si el mapa se desplaza por el borde. */
export interface EdgeSituation {
  /** Llevando una unidad con el puntero pulsado. */
  isCarrying: boolean;
  carryIsTouch: boolean;
  /** Raton dentro del juego, sin pulsar, con la partida en marcha y el mapa a la vista. */
  isHoveringMap: boolean;
}

/** Que franja usar, o null si el mapa no se desplaza por el borde. */
export function edgeZoneFor(situation: EdgeSituation): EdgeZone | null {
  if (situation.isCarrying) return situation.carryIsTouch ? EDGE_CARRY_TOUCH : EDGE_CARRY_MOUSE;
  return situation.isHoveringMap ? EDGE_HOVER : null;
}
