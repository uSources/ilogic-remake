/**
 * En la version de un solo fichero (scripts/build-single.mjs) los recursos van incrustados
 * en window.__ILOGIC_ASSETS__ como data URI; en la normal se cargan de la carpeta assets/.
 */
export function asset(path: string): string {
  const inline = (window as unknown as { __ILOGIC_ASSETS__?: Record<string, string> }).__ILOGIC_ASSETS__;
  return inline?.[path] ?? path;
}

/** URL de una imagen del juego por su clave (para la interfaz HTML). */
export function imgUrl(key: string | null | undefined): string | undefined {
  return key ? asset(`assets/img/${key}.png`) : undefined;
}
