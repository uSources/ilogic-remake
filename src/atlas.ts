import type Phaser from 'phaser';

/**
 * Todas las imagenes del juego van en una sola textura de Phaser, `'atlas'`, con varias paginas
 * (tools/art/pack_atlas.py). Es el atlas de varias paginas de Phaser (multiatlas): cada imagen es un
 * marco con su nombre de siempre ('u/b_Tank', 'blob/fog'...), este en la pagina que este.
 *
 *   scene.add.image(x, y, ATLAS, 'u/b_Tank');   img.setTexture(ATLAS, clave);
 *
 * Para dibujar a mano en un lienzo, usar el marco (imageFrame / drawFrame): la imagen de la pagina
 * entera no sirve.
 */
export const ATLAS = 'atlas';

const pageKey = (i: number) => `atlas-page-${i}`;
const dataKey = (i: number) => `atlas-data-${i}`;

/** Pide al cargador las paginas del atlas (imagen + marcos). `url` traduce rutas (version de un fichero). */
export function loadAtlas(load: Phaser.Loader.LoaderPlugin, pages: number, url: (path: string) => string): void {
  for (let i = 0; i < pages; i++) {
    load.image(pageKey(i), url(`assets/atlas/atlas-${i}.png`));
    load.json(dataKey(i), url(`assets/atlas/atlas-${i}.json`));
  }
}

/** Junta las paginas cargadas en la textura `'atlas'` (una textura en la GPU por pagina, sin copias). */
export function createAtlas(scene: Phaser.Scene, pages: number): void {
  const { textures, cache } = scene;
  if (textures.exists(ATLAS)) return;
  const images: HTMLImageElement[] = [];
  const data: unknown[] = [];
  for (let i = 0; i < pages; i++) {
    images.push(textures.get(pageKey(i)).getSourceImage() as HTMLImageElement);
    data.push(cache.json.get(dataKey(i)));
  }
  textures.addAtlasJSONHash(ATLAS, images, data);
  // Las texturas sueltas de cada pagina ya no hacen falta (la imagen la conserva el atlas).
  for (let i = 0; i < pages; i++) {
    textures.remove(pageKey(i));
    cache.json.remove(dataKey(i));
  }
}

/** ¿Hay una imagen del juego con esta clave? */
export function hasImage(textures: Phaser.Textures.TextureManager, key: string): boolean {
  return textures.exists(ATLAS) && textures.get(ATLAS).has(key);
}

/** Marco de una imagen del juego (su sitio en la pagina: cutX, cutY, cutWidth, cutHeight). */
export function imageFrame(textures: Phaser.Textures.TextureManager, key: string): Phaser.Textures.Frame {
  return textures.getFrame(ATLAS, key);
}

/** Dibuja la imagen entera de una clave en un lienzo. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  textures: Phaser.Textures.TextureManager,
  key: string,
  dx: number,
  dy: number,
  dw?: number,
  dh?: number,
): void {
  const f = imageFrame(textures, key);
  ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, dx, dy, dw ?? f.cutWidth, dh ?? f.cutHeight);
}

/**
 * Nombre del marco `fila_fotograma` de una lamina animada (anim/water...). Los marcos se crean la
 * primera vez con addSheetFrames.
 */
export const sheetFrame = (key: string, row: number, frame: number): string => `${key}#${row}_${frame}`;

/** Da nombre a las piezas de una lamina (filas de `size` px), dentro del mismo atlas. */
export function addSheetFrames(textures: Phaser.Textures.TextureManager, key: string, cols: number, size: number): void {
  const t = textures.get(ATLAS);
  if (t.has(sheetFrame(key, 0, 0))) return;
  const base = t.get(key);
  const rows = Math.floor(base.cutHeight / size);
  for (let r = 0; r < rows; r++)
    for (let f = 0; f < cols; f++) t.add(sheetFrame(key, r, f), base.sourceIndex, base.cutX + f * size, base.cutY + r * size, size, size);
}
