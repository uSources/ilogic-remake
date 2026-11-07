/**
 * Como se pelea una unidad en su turno (`EngagementPolicy`): a que enemigos mira, desde donde dispara
 * y que hace si no llega a ninguno. Cada forma de jugar es un preset con nombre (la IA caza, la
 * orden de defender guarda su zona...), no una mezcla de banderas que hay que adivinar.
 */
import type { Pos, Unit } from '../model';

/** Desde donde puede disparar: moviendose a cualquier casilla del alcance, solo desde donde esta o desde las que deje pasar el filtro. */
export type FiringPositions = 'anywhere' | 'here' | ((pos: Pos) => boolean);

export interface EngagementPolicy {
  /** A que enemigos (de los que llega a disparar este turno) mira; sin esto, a todos. */
  readonly engages?: (foe: Unit) => boolean;
  /** Desde donde dispara. */
  readonly firesFrom: FiringPositions;
  /** Si no puede disparar a ninguno: ir hacia el mas cercano ('chase') o no hacer nada ('hold'). */
  readonly whenNoShot: 'chase' | 'hold';
}

/** Cazar: dispara a lo que llegue moviendose y, si no hay nada a tiro, va a por el mas cercano (la IA). */
export const HUNT: EngagementPolicy = { firesFrom: 'anywhere', whenNoShot: 'chase' };

/** Disparar sin moverse a lo que tenga a tiro, y nada mas (una orden que ya ha andado su camino). */
export const SHOOT_FROM_HERE: EngagementPolicy = { firesFrom: 'here', whenNoShot: 'hold' };

/** Guardar una zona: solo a lo que entra en ella, persiguiendolo dentro (`firesFrom`: lo que deje la formacion). */
export const guardZone = (zone: (foe: Unit) => boolean, firesFrom: FiringPositions): EngagementPolicy => ({
  engages: zone,
  firesFrom,
  whenNoShot: 'chase',
});

/** Avanzar disparando: a lo que tenga a tiro por el camino, sin desviarse a perseguir a nadie. */
export const fireOnTheWay = (firesFrom: FiringPositions): EngagementPolicy => ({ firesFrom, whenNoShot: 'hold' });
