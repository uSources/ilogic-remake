/** Laboratorio de animaciones (src/lab.ts): que unidades y si va a camara lenta. */
export interface LabVM {
  /** Nombre de cada tipo de unidad (indice = tipo). */
  units: string[];
  attacker: number;
  defender: number;
  slow: boolean;
  /** La unidad propia puede atacar (si no, solo se puede mover). */
  canAttack: boolean;
}
