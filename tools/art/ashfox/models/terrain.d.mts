// Los tipos de terrain.mjs que usan los tests (solo lo que leen).

/** Los tonos de una pintura de Ashfox: sombra, medio y luz, como `#rrggbb`. */
export interface Paint {
  ramp: readonly string[];
}

/** Las pinturas de las casillas y su decorado, por nombre (`earth`, `ice_rock`, `mud`...). */
export declare const PAINTS: Readonly<Record<string, Paint>>;
