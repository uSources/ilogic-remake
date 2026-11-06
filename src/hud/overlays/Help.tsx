import type { MatchSettings } from '../../core/model';
import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import { helpText } from '../helpText';
import { ui } from '../store';

/** Columna de las teclas: va en letra de teclado. */
const KEYBOARD_COLUMN = 1;

/** Ayuda ("Cómo se juega"): objetivo, colores del mapa y controles (textos en src/i18n/<idioma>/help.ts). */
export function Help({ rules }: { rules: Readonly<MatchSettings> }) {
  const help = helpText(rules);
  return (
    <Veil kind="help-veil" onClose={() => ui.actions.closeHelp()}>
      <div class="px help" role="dialog" aria-label={help.title}>
        <div class="help-head">
          <span class="htitle">{help.title}</span>
          <Button class="px-btn plain" onClick={() => ui.actions.closeHelp()}>
            {help.close} <span class="key">Esc</span>
          </Button>
        </div>
        <div class="help-body">
          <section>
            <span class="label">{help.goalTitle}</span>
            {help.goal.map((sentence) => (
              <p>{sentence}</p>
            ))}
            <span class="label">{help.colorsTitle}</span>
            <ul class="legend">
              {help.colors.map(([color, meaning]) => (
                <li>
                  <i style={{ background: color }} />
                  {meaning}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <span class="label">{help.controlsTitle}</span>
            <table>
              <thead>
                <tr>
                  {help.head.map((heading) => (
                    <th>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {help.controls.map((row) => (
                  <tr>{row.map((cell, column) => (column === KEYBOARD_COLUMN ? <td class="kbd">{cell}</td> : <td>{cell}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </Veil>
  );
}
