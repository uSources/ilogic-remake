/** Laboratorio de animaciones (src/lab.ts): que unidades y si va a camara lenta. */
export interface LabVM {
  /** Cada tipo de unidad: su id (units.json) y su nombre. */
  units: { id: string; name: string }[];
  /** Tipo de la unidad propia y de la enemiga (id). */
  attacker: string;
  defender: string;
  slow: boolean;
  /** La unidad propia puede atacar (si no, solo se puede mover). */
  canAttack: boolean;
}
