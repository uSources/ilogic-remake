/**
 * Texto pintado en lienzos para las texturas del motor (chapas, textos flotantes, banderas). La letra
 * pixelada solo se importa por CSS y el navegador no la tiene hasta que la descarga: lo que se pinta
 * antes sale con la de reserva. Una textura guardada por valor se quedaria asi toda la partida, por eso
 * lo pintado sin ella se vuelve a pintar cuando carga.
 */

/** Un lienzo de ese tamaño y su pincel. */
export function newCanvas(width: number, height: number): { canvas: HTMLCanvasElement; draw: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('Sin lienzo 2D para pintar una textura (¿demasiados lienzos abiertos?)');
  return { canvas, draw };
}

/**
 * La carga de cada letra, que se pide una sola vez: si no llega (sin red, sin el fichero), lo que se
 * pinte despues no la vuelve a pedir ni llena la consola de avisos. Da si ha cargado.
 */
const fontLoads = new Map<string, Promise<boolean>>();

function loadOnce(font: string): Promise<boolean> {
  let loading = fontLoads.get(font);
  if (!loading) {
    loading = document.fonts.load(font).then(
      () => true,
      (error: unknown) => {
        console.warn('No ha cargado la letra', font, error);
        return false;
      },
    );
    fontLoads.set(font, loading);
  }
  return loading;
}

/** Llama a `repaint` cuando cargue esa letra, si aun no ha cargado (mientras, un lienzo pinta con la de reserva). */
export function whenFontLoads(font: string, repaint: () => void): void {
  if (document.fonts.check(font)) return;
  void loadOnce(font).then((hasLoaded) => {
    if (hasLoaded) repaint();
  });
}
