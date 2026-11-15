/**
 * Las imagenes del juego (iconos, retratos, terreno) van en un atlas de varias paginas
 * (public/assets/atlas, tools/art/pack_atlas.py): cada imagen es un marco con su nombre de siempre
 * ('u/b_Tank', 'blob/fog'...), este en la pagina que este. Las usa la interfaz HTML: `url` da una
 * imagen recortada (para un <img>) y `draw` la pinta en un lienzo (miniaturas, colores del terreno).
 */
import { ATLAS_PAGES } from './atlasPages';

/** Un marco: su pagina y su sitio en ella (pixeles). */
interface AtlasFrame {
  page: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lo que trae el JSON de cada pagina (formato «JSON hash» de los atlas). */
interface AtlasPageData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}

export class GameImages {
  private readonly urls = new Map<string, string>();

  constructor(private readonly frames: ReadonlyMap<string, AtlasFrame>) {}

  has(key: string): boolean {
    return this.frames.has(key);
  }

  /** La imagen de esa clave como URL (se recorta la primera vez que se pide y se guarda); undefined si no hay. */
  url(key: string): string | undefined {
    const frame = this.frames.get(key);
    if (!frame) return undefined;
    let url = this.urls.get(key);
    if (!url) {
      const canvas = document.createElement('canvas');
      canvas.width = frame.w;
      canvas.height = frame.h;
      this.draw(canvas.getContext('2d')!, key, 0, 0);
      url = canvas.toDataURL();
      this.urls.set(key, url);
    }
    return url;
  }

  /** Pinta la imagen entera de esa clave en un lienzo (a su tamaño o al que se pida). */
  draw(context: CanvasRenderingContext2D, key: string, x: number, y: number, width?: number, height?: number): void {
    const frame = this.frames.get(key);
    if (!frame) return;
    context.drawImage(frame.page, frame.x, frame.y, frame.w, frame.h, x, y, width ?? frame.w, height ?? frame.h);
  }
}

let loaded: GameImages | null = null;

/** Las imagenes ya cargadas (null hasta que acaba `loadGameImages`). */
export const gameImages = (): GameImages | null => loaded;

/** Carga todas las paginas del atlas (imagen y marcos) una vez. `url` traduce rutas (version de un fichero: `asset`). */
export async function loadGameImages(url: (path: string) => string): Promise<GameImages> {
  if (loaded) return loaded;
  const pages = await Promise.all(Array.from({ length: ATLAS_PAGES }, (_, index) => loadPage(index, url)));
  const frames = new Map<string, AtlasFrame>();
  for (const { image, data } of pages)
    for (const [key, { frame }] of Object.entries(data.frames)) frames.set(key, { page: image, ...frame });
  loaded = new GameImages(frames);
  return loaded;
}

async function loadPage(index: number, url: (path: string) => string): Promise<{ image: HTMLImageElement; data: AtlasPageData }> {
  const [image, data] = await Promise.all([
    loadImage(url(`assets/atlas/atlas-${index}.png`)),
    fetch(url(`assets/atlas/atlas-${index}.json`)).then((response) => response.json() as Promise<AtlasPageData>),
  ]);
  return { image, data };
}

/** Una imagen ya cargada. Con su evento `load`: `decode()` puede no acabar nunca con la pagina en segundo plano. */
function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se ha podido cargar ${source}`));
    image.src = source;
  });
}

/** ¿Hay una imagen del juego con esta clave? */
export const hasImage = (images: GameImages, key: string): boolean => images.has(key);
