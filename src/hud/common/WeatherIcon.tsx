import { imgUrl } from '../../assets';

/**
 * Iconos pixel del clima (10×10) en SVG: solo se usan si falta el dibujo ui/wx_<id> del atlas.
 * Cada dibujo es una lista de filas; cada letra es un color (ver INK) y "." es transparente.
 */
const INK: Record<string, string> = {
  y: '#ffd447', // sol
  o: '#ff9f2e',
  w: '#f2f5ff', // nube, nieve
  g: '#9fb2d8', // nube oscura
  b: '#5eb3ff', // lluvia
  s: '#e0b86a', // arena
  d: '#a8783a',
};

const ART: Record<string, string[]> = {
  Clear: [
    '....y.....',
    '.y..y..y..',
    '..yyyyy...',
    '..yoooy...',
    'yyyoooyyy.',
    '..yoooy...',
    '..yyyyy...',
    '.y..y..y..',
    '....y.....',
    '..........',
  ],
  Rain: [
    '...ww.....',
    '..wwwww...',
    '.wwwwwww..',
    'wwwwwwwww.',
    '.ggggggg..',
    '..........',
    '.b..b..b..',
    'b..b..b...',
    '..........',
    '.b..b..b..',
  ],
  Snow: [
    '....w.....',
    '.w..w..w..',
    '..w.w.w...',
    '...www....',
    'wwwwwwwww.',
    '...www....',
    '..w.w.w...',
    '.w..w..w..',
    '....w.....',
    '..........',
  ],
  Storm: [
    '...gg.....',
    '..ggggg...',
    '.ggggggg..',
    'ggggggggg.',
    '.ggggggg..',
    '....yy....',
    '...yy.....',
    '..yyyyy...',
    '....yy....',
    '...y......',
  ],
  Sandstorm: [
    '..........',
    'ssssss....',
    '......s...',
    '.ddddd.s..',
    '......d...',
    'ssssssss..',
    '.........s',
    '..dddddd.s',
    '........s.',
    '.sssssss..',
  ],
};

export function WeatherIcon({ id, cls = 'wx-icon' }: { id: string; cls?: string }) {
  // Dibujo de Retro Diffusion (ui/wx_<id>, 16x16) si esta en el atlas; si no, el de pixeles de aqui.
  const src = imgUrl(`ui/wx_${id}`);
  if (src) return <img class={`${cls} wx-img`} src={src} alt="" aria-hidden="true" draggable={false} />;
  const rows = ART[id] ?? ART.Clear!;
  const pixels = rows.flatMap((row, y) => [...row].map((letter, x) => ({ x, y, color: INK[letter] })));
  return (
    <svg class={cls} viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">
      {pixels.map(({ x, y, color }) => color && <rect x={x} y={y} width={1} height={1} fill={color} />)}
    </svg>
  );
}
