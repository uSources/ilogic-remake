/**
 * El reloj de la vista: lo que se hace en cada fotograma. Lo da el bucle del motor
 * (engine/core/world.ts) y lo piden los sistemas que se mueven con el tiempo (el teclado, la camara).
 */

/** Lo que se hace en cada fotograma, con los segundos desde el anterior. */
export type FrameListener = (seconds: number) => void;
