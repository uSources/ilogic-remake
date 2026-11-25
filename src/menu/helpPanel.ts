import { ui } from '../hud/store';
import type { MenuCommand, MenuContext } from '../controls/menu';
import { HELP_TOPICS } from '../i18n/help';

/** Las ordenes que la cierran: Esc, Retroceso, Enter, Espacio o H (MENU_BINDINGS.help). */
const CLOSING_COMMANDS: readonly MenuCommand['kind'][] = ['back', 'ok', 'help'];

/** El tema de Aprender `step` puestos mas abajo (o arriba), dando la vuelta. */
function topicAfter(step: number) {
  const index = HELP_TOPICS.indexOf(ui.get().helpTopic);
  return HELP_TOPICS[(index + step + HELP_TOPICS.length) % HELP_TOPICS.length] ?? 'goal';
}

/**
 * La ayuda (Aprender, «Cómo se juega»), la misma en el menu principal y en la partida. Se abre encima de
 * lo que haya; mientras esta abierta, la escena le pasa las teclas: arriba y abajo cambian de tema.
 */
export const helpPanel = {
  get isOpen(): boolean {
    return ui.get().help;
  },
  open(): void {
    ui.set({ help: true });
  },
  close(): void {
    ui.set({ help: false });
  },
  context: (): MenuContext => 'help',
  command(command: MenuCommand): void {
    if (CLOSING_COMMANDS.includes(command.kind)) return this.close();
    if (command.kind === 'move' && command.dy) ui.set({ helpTopic: topicAfter(command.dy) });
  },
};
