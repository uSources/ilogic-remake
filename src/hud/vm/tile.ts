import type { StatChipVM } from './common';

/** Fichas de abajo: la casilla señalada (terreno, edificio, punto de control) y su unidad. */

/** Habilidad de una unidad: nombre y explicacion (con sus numeros). */
export interface AbilityVM {
  name: string;
  desc: string;
}

export interface UnitVM {
  /** Rango de veterania 0..3. */
  rank?: number;
  icon: string | null;
  name: string;
  team: 0 | 1;
  life: number;
  stats: string;
  /** Movimiento, alcance y vision con su icono (ficha de la unidad). */
  chips?: StatChipVM[];
  /** Habilidades (vacio si no tiene o la regla esta apagada). */
  abilities?: AbilityVM[];
  status?: string;
  cargo?: string;
  /** [CAMBIO] Ha recibido un ataque hoy: esta noche no se cura (regla noHealUnderFire). */
  noHeal?: boolean;
  /** [CAMBIO] Orden con destino, ya traducida ("Atacar aquí"), y escuadra a la que pertenece. */
  order?: string;
  squad?: string;
  /** [CAMBIO] Va por su cuenta con otra orden y al cumplirla vuelve con su escuadra. */
  detached?: boolean;
}

export interface TileVM {
  terrain: { key: string; name: string; defense: number; cost?: { foot: number | null; vehicle: number | null } };
  building?: {
    icon: string | null;
    name: string;
    owner: 'you' | 'enemy' | 'neutral' | 'unknown';
    income: number;
    /** Captura a medias: puntos que quedan, total y quien captura. */
    capture?: { left: number; total: number; team: 0 | 1 };
  };
  unit?: UnitVM;
  /** [CAMBIO] Punto de control en la casilla: de quien es y lo que da por ronda. */
  point?: { owner: 'you' | 'enemy' | 'neutral'; income: number; contested: boolean; icon: string };
}
