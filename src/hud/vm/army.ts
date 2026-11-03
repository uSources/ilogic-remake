import type { Anchor } from './common';

/** Tus unidades: bandeja (sin mover, escuadras), panel de lo elegido y bocadillo al mover. */

export interface IdleVM {
  uid: number;
  icon: string | null;
  name: string;
}

/** [CAMBIO] Escuadra del jugador en la bandeja: nombre, unidades y orden que llevan (si todas la misma). */
export interface SquadVM {
  id: number;
  name: string;
  /** [CAMBIO] Tecla del grupo (1-9). */
  key?: number;
  count: number;
  order: string | null;
  /** [CAMBIO] Todas llevan la misma orden: avanzan juntas (ver squadInFormation). */
  formation: boolean;
  /** [CAMBIO] Unidades que van por su cuenta con otra orden (ver isDetached). */
  detached: number;
}

/** [CAMBIO] Una unidad del panel de lo elegido (retrato, vida y si es la señalada con Tab). */
export interface PickedVM {
  uid: number;
  icon: string | null;
  name: string;
  life: number;
  current: boolean;
}

/** [CAMBIO] Panel de lo elegido: las unidades, ordenadas por tipo, y cuantas de cada tipo. */
export interface SelectionVM {
  units: PickedVM[];
  types: { name: string; count: number }[];
}

/** Bocadillo junto al cursor al mover una unidad. */
export interface MoveTipVM {
  anchor: Anchor;
  action: string;
  invalid?: boolean;
  used?: number;
  max?: number;
  stars?: number;
  danger?: boolean;
}
