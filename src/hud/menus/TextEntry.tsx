import type { SoundName } from '../../audio/sounds';
import { Btn } from '../common/buttons';

interface TextEntryProps {
  /** La señalada (con el teclado o el raton): mas grande, con la flecha y lo de debajo en oro. */
  sel: boolean;
  /** Clases de mas (`entry-continue`, `danger`...). */
  cls?: string;
  title: string;
  /** Una linea pequeña debajo (de que va, lo que pide). */
  note?: string;
  /** La tecla que hace lo mismo, pequeña junto al titulo. */
  keyHint?: string;
  sound?: SoundName;
  onHover: () => void;
  onPick: () => void;
}

/**
 * Una entrada del menu clasico de texto (Inicio, la pausa, el final): el titulo grande sobre el
 * tablero, sin marco, con una linea debajo si la hay. La señalada crece y lleva la flecha delante.
 */
export function TextEntry({ sel, cls, title, note, keyHint, sound, onHover, onPick }: TextEntryProps) {
  return (
    <Btn sel={sel} cls={`text-entry ${cls ?? ''}`} sound={sound} onHover={onHover} onPick={onPick}>
      <span class="text-arrow" aria-hidden="true">
        ▸
      </span>
      <span class="text-entry-text">
        <span class="text-entry-title">
          {title}
          {keyHint && <span class="text-entry-key">{keyHint}</span>}
        </span>
        {note && <span class="text-entry-note">{note}</span>}
      </span>
    </Btn>
  );
}
