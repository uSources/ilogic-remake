import type Phaser from 'phaser';

/**
 * En la version de un solo fichero (scripts/build-single.mjs) los recursos van incrustados
 * en window.__ILOGIC_ASSETS__ como data URI; en la normal se cargan de la carpeta assets/.
 */
export function asset(path: string): string {
  const inline = (window as unknown as { __ILOGIC_ASSETS__?: Record<string, string> }).__ILOGIC_ASSETS__;
  return inline?.[path] ?? path;
}

let textures: Phaser.Textures.TextureManager | null = null;
const urls = new Map<string, string>();

/** Lo llama BootScene cuando el atlas ya esta cargado. */
export function setImageSource(t: Phaser.Textures.TextureManager): void {
  textures = t;
  urls.clear();
}

/**
 * URL de una imagen del juego por su clave (para la interfaz HTML). Se recorta del atlas ya
 * cargado la primera vez que se pide y se guarda.
 */
export function imgUrl(key: string | null | undefined): string | undefined {
  if (!key || !textures?.exists(key)) return undefined;
  let u = urls.get(key);
  if (!u) {
    u = textures.getBase64(key) as string;
    urls.set(key, u);
  }
  return u;
}
