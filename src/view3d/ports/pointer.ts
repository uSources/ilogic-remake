/**
 * Lo que la entrada del puntero (systems/input/pointerInput.ts) pide a la vista y que no es la
 * camara: dibujar el recuadro de seleccion mientras se arrastra. Lo implementa el motor
 * (engine/core/screenBox.ts).
 */

/** Un rectangulo de la pantalla, en pixeles CSS de la ventana. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SelectionBoxView {
  /** Enseña el recuadro (null: lo quita). */
  show(box: ScreenBox | null): void;
}
