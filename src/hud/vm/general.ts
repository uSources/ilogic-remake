/** Generales: panel del jugador (con sus habilidades) y el de la IA (solo para verlo). */

/** Habilidad del general en el panel. */
export interface GeneralAbilityVM {
  id: string;
  /** Clave del icono en el atlas (ui/ab_<id>); puede no existir. */
  icon: string;
  name: string;
  description: string;
  /** Estrellas que gasta. */
  cost: number;
  /** Se puede usar ahora. */
  ready: boolean;
  /** Por que no (texto corto), si no se puede. */
  reason: string | null;
}

/** Panel del general del jugador (null = juega sin general). */
export interface GeneralVM {
  /** Clave del retrato en el atlas (ui/gen_<b|r>_<id>), con el color de su bando; puede no existir. */
  face: string;
  name: string;
  title: string;
  description: string;
  /** Estrellas llenas y maximo de la barra; `fraction`: lo que lleva de la siguiente (0..1). */
  stars: number;
  max: number;
  fraction: number;
  abilities: GeneralAbilityVM[];
  /** Habilidad que se esta apuntando (fase de elegir casilla). */
  targeting: string | null;
}
