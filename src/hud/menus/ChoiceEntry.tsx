import { t } from '../../settings';
import { Button, scrollRef } from '../common/buttons';

interface ChoiceEntryProps {
  /** La señalada (con el teclado o el raton): mas grande y con la flecha, como en `TextEntry`. */
  sel: boolean;
  /** Clases de mas. */
  cls?: string;
  title: string;
  /** El valor de ahora, entre ◂ y ▸. */
  value: string;
  /** Una linea pequeña debajo (lo que da el valor elegido). */
  note?: string;
  onHover: () => void;
  /** Un paso atras (-1) o adelante (1). Pulsar el titulo es un paso adelante, como Enter. */
  onStep: (delta: number) => void;
}

/**
 * Una entrada del menu clasico de texto con un valor que se cambia: «Rival ◂ La IA ▸». Se ve como
 * `TextEntry`; ← → (o ◂ y ▸ con el raton) cambian el valor. No es un boton entero porque lleva dos
 * dentro (◂ y ▸).
 */
export function ChoiceEntry({ sel, cls, title, value, note, onHover, onStep }: ChoiceEntryProps) {
  return (
    <div class={`text-entry choice-entry ${sel ? 'sel' : ''} ${cls ?? ''}`} onMouseEnter={onHover} ref={scrollRef(sel)}>
      <span class="text-arrow" aria-hidden="true">
        ▸
      </span>
      <span class="text-entry-text">
        <span class="text-entry-title">
          <Button class="choice-name" aria-label={`${title}: ${value}`} onClick={() => onStep(1)}>
            {title}
          </Button>
          <span class="choice-value">
            <Button class="choice-step" aria-label={`${title}: ${t('choicePrevious')}`} onClick={() => onStep(-1)}>
              ◂
            </Button>
            {value}
            <Button class="choice-step" aria-label={`${title}: ${t('choiceNext')}`} onClick={() => onStep(1)}>
              ▸
            </Button>
          </span>
        </span>
        {note && <span class="text-entry-note">{note}</span>}
      </span>
    </div>
  );
}
