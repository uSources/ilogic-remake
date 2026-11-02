import { useState } from 'preact/compat';

/** Pantallas donde se pueden plegar paneles (las mismas que en styles/game/fold.css). */
const FOLD_SCREEN = '(max-width: 720px), (max-height: 500px)';
const folded = new Set<string>();

/** Panel plegable en el movil (bandeja, fichas): se recuerda mientras dura la sesion. */
export function useFold(key: string): [boolean, () => void] {
  const [on, setOn] = useState(folded.has(key));
  const toggle = () => {
    if (!matchMedia(FOLD_SCREEN).matches) return;
    if (on) folded.delete(key);
    else folded.add(key);
    setOn(!on);
  };
  return [on && matchMedia(FOLD_SCREEN).matches, toggle];
}

/** Flecha de plegar (solo se ve en el movil). */
export const FoldMark = ({ folded }: { folded: boolean }) => (
  <span class="fold-mark" aria-hidden="true">
    {folded ? '▸' : '▾'}
  </span>
);
