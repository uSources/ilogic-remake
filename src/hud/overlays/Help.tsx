import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import { helpText } from '../helpText';
import { ui } from '../store';

/** Ayuda ("Cómo se juega"): objetivo, colores del mapa y controles (textos en src/i18n/<idioma>/help.ts). */
export function Help() {
  const h = helpText();
  return (
    <Veil kind="help-veil" onClose={() => ui.actions.closeHelp()}>
      <div class="px help" role="dialog" aria-label={h.title}>
        <div class="help-head">
          <span class="htitle">{h.title}</span>
          <Button class="px-btn plain" onClick={() => ui.actions.closeHelp()}>
            {h.close} <span class="key">Esc</span>
          </Button>
        </div>
        <div class="help-body">
          <section>
            <span class="label">{h.goalTitle}</span>
            {h.goal.map((p) => (
              <p>{p}</p>
            ))}
            <span class="label">{h.colorsTitle}</span>
            <ul class="legend">
              {h.colors.map(([c, txt]) => (
                <li>
                  <i style={{ background: c }} />
                  {txt}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <span class="label">{h.controlsTitle}</span>
            <table>
              <thead>
                <tr>
                  {h.head.map((x) => (
                    <th>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.controls.map((row) => (
                  <tr>{row.map((x, i) => (i === 1 ? <td class="kbd">{x}</td> : <td>{x}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </Veil>
  );
}
