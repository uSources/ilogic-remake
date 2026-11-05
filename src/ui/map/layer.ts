import type Phaser from 'phaser';
import type { ViewOptions } from './viewOptions';

/**
 * Piezas de la vista del mapa (src/ui/map/*). MapView (ui/mapView.ts) solo las crea, las apila en
 * orden y les reparte el trabajo; cada capa se encarga de lo suyo.
 *
 * Para añadir algo nuevo al mapa:
 * - Un dibujo que se rehace en cada `render` con Graphics (zonas, marcos, flechas): una funcion
 *   `OverlayPainter` en la lista `OVERLAYS` (map/overlayLayer.ts), en su sitio del orden.
 * - Objetos propios (imagenes que se reutilizan, animaciones por pasos): una clase con `object`
 *   (lo que se apila) y, si se anima, `tick`; MapView la añade a `root` y a `animated`.
 */
export interface MapLayer {
  /** Lo que se apila en la raiz del mapa (contenedor o Graphics). */
  readonly object: Phaser.GameObjects.GameObject;
}

/** Hora de las animaciones por pasos de la vista. */
export interface MapClock {
  /** Hora de la escena en ms. */
  time: number;
  /** Menos movimiento (Opciones) o capturas: todo quieto. */
  still: boolean;
}

/** Capa con animacion por pasos: la llama `MapView.tick` en cada fotograma. */
export interface AnimatedLayer {
  tick(clock: MapClock): void;
}

/** Paso de una animacion ciclica: `n` pasos de `ms` cada uno (0 si todo esta quieto). */
export const stepOf = (clock: MapClock, ms: number, n: number): number => (clock.still ? 0 : Math.floor(clock.time / ms) % n);

/** Lo que una funcion de la capa de resaltados necesita ademas de las opciones. */
export interface OverlayContext {
  textures: Phaser.Textures.TextureManager;
  /** Dibujo nuevo elegido y cargado. */
  newArt: boolean;
}

/** Dibuja una cosa de la capa de resaltados (map/overlayLayer.ts): se borra y se rehace entera en cada `render`. */
export type OverlayPainter = (graphics: Phaser.GameObjects.Graphics, options: ViewOptions, context: OverlayContext) => void;
