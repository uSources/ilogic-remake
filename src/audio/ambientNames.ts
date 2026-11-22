/**
 * Los ambientes (bucles flojos debajo de todo) como los ve el juego: un nombre y un puerto para
 * empezarlos y pararlos, sin Web Audio. Los de zona suenan desde un sitio del mapa (la costa, un bosque);
 * los de fondo (el tema del mapa) y los del clima, sin sitio. Se generan con `npm run sonidos` y van en
 * public/assets/ambient/<nombre>.ogg|mp3; si aun no esta el fichero, no suena nada.
 */
import type { Point3 } from './spatial';

export const ZONE_AMBIENTS = [
  'amb_sea',
  'amb_woods',
  'amb_meadow',
  'amb_dunes',
  'amb_peaks',
  'amb_snowfield',
  'amb_marsh',
  'amb_factory',
  'amb_oil_pump',
] as const;
export const BED_AMBIENTS = ['amb_plains', 'amb_desert', 'amb_forest', 'amb_swamp', 'amb_snowy'] as const;
export const WEATHER_AMBIENTS = ['amb_rain', 'amb_storm', 'amb_snowfall', 'amb_sandstorm'] as const;

export type ZoneAmbient = (typeof ZONE_AMBIENTS)[number];
export type BedAmbient = (typeof BED_AMBIENTS)[number];
export type WeatherAmbient = (typeof WEATHER_AMBIENTS)[number];
export type AmbientName = ZoneAmbient | BedAmbient | WeatherAmbient;

/** Un bucle que suena: cambia de volumen poco a poco (`setLevel`, 0-1) y se para con un fundido. */
export interface LoopHandle {
  setLevel(level: number): void;
  stop(): void;
}

/** Empezar un bucle en `at` (null: sin sitio) a `level` de su volumen (0-1). */
export interface LoopPort {
  start(name: AmbientName, at: Point3 | null, level: number): LoopHandle;
}
