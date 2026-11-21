/** Tus unidades: el panel de lo elegido. */

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
