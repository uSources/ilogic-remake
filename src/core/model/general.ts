/** General de un bando (ver core/generals.ts). */
export interface GeneralState {
  /** id de generals.json. */
  id: string;
  /** Carga de la barra, en estrellas (puede tener decimales; se enseña redondeada hacia abajo). */
  charge: number;
  /** Ya ha usado una habilidad este turno (una por turno). */
  used: boolean;
  /** Ve todo el mapa hasta que acabe la ronda (habilidad reveal). */
  reveal: boolean;
}
