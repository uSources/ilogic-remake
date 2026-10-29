import Phaser from 'phaser';

/**
 * Las imagenes del juego van empaquetadas en paginas de atlas (tools/art/pack_atlas.py), pero el
 * codigo las pide por su nombre de siempre ('u/b_Tank', 'blob/fog'...). Aqui se crea, para cada
 * marco del atlas, una textura con ese nombre que comparte la pagina ya subida a la GPU (no se
 * copia nada): su marco por defecto es el trozo de la pagina. Quien dibuje a mano en un lienzo
 * debe usar textures.getFrame(clave) y sus cutX/cutY (ver frameImage).
 */
export function aliasAtlasFrames(textures: Phaser.Textures.TextureManager, atlasKey: string): number {
  const atlas = textures.get(atlasKey);
  let n = 0;
  for (const name of atlas.getFrameNames()) {
    if (textures.exists(name)) continue;
    const f = atlas.get(name);
    const t = new Phaser.Textures.Texture(textures, name, []);
    t.source = atlas.source;
    t.add('__BASE', f.sourceIndex, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    (textures.list as Record<string, Phaser.Textures.Texture>)[name] = t;
    textures.emit(Phaser.Textures.Events.ADD, name, t);
    n++;
  }
  return n;
}

/** Dibuja la imagen entera de una clave en un lienzo (respeta su sitio dentro del atlas). */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  textures: Phaser.Textures.TextureManager,
  key: string,
  dx: number,
  dy: number,
  dw?: number,
  dh?: number,
): void {
  const f = textures.getFrame(key);
  ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, dx, dy, dw ?? f.cutWidth, dh ?? f.cutHeight);
}
