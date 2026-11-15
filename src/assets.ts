import { gameImages } from './atlas';

/**
 * En la version de un solo fichero (scripts/build-single.mjs) los recursos van incrustados
 * en window.__ILOGIC_ASSETS__ como data URI; en la normal se cargan de la carpeta assets/.
 */
export function asset(path: string): string {
  const inline = (window as unknown as { __ILOGIC_ASSETS__?: Record<string, string> }).__ILOGIC_ASSETS__;
  return inline?.[path] ?? path;
}

/** Rutas de las que hay copia (en la version de un fichero solo va lo que se incrusto). */
export function assetsAvailable(paths: string[]): string[] {
  const inline = (window as unknown as { __ILOGIC_ASSETS__?: Record<string, string> }).__ILOGIC_ASSETS__;
  return inline ? paths.filter((p) => p in inline) : paths;
}

/** URL de una imagen del juego por su clave (para la interfaz HTML), si el atlas ya esta cargado. */
export function imgUrl(key: string | null | undefined): string | undefined {
  return key ? gameImages()?.url(key) : undefined;
}
