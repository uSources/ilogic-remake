/** General de un bando (ver core/generals.ts). */
export interface GeneralState {
  /** id de generals.json. */
  id: string;
  /** Carga de la barra, en estrellas (puede tener decimales; se enseña redondeada hacia abajo). */
  charge: number;
  /** Ya ha usado un poder este turno (uno por turno). */
  used: boolean;
  /** Ve todo el mapa hasta que acabe la ronda (poder reveal). */
  reveal: boolean;
}
