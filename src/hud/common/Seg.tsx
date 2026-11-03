import type { OptionRowVM } from '../vm/menus';
import { Button } from './buttons';

/** Botones de segmento: `20 | 32 | 40`. */
export function Seg({ row, sel, onHover, onSet }: { row: OptionRowVM; sel: boolean; onHover: () => void; onSet: (i: number) => void }) {
  return (
    <div class={`seg-row ${sel ? 'sel' : ''}`} onMouseEnter={onHover}>
      <span class="seg-label">{row.label}</span>
      <span class="seg" role="radiogroup" aria-label={row.label}>
        {row.choices.map((c, i) => (
          <Button role="radio" aria-checked={i === row.index} class={i === row.index ? 'on' : ''} onClick={() => onSet(i)}>
            {c}
          </Button>
        ))}
      </span>
    </div>
  );
}
