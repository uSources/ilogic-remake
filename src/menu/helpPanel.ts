import { ui } from '../hud/store';
import type { MenuCommand, MenuContext } from '../controls/menu';

/** Las ordenes que la cierran: Esc, Retroceso, Enter, Espacio o H (MENU_BINDINGS.help). */
const CLOSING_COMMANDS: readonly MenuCommand['kind'][] = ['back', 'ok', 'help'];

/**
 * La ayuda («Cómo se juega»), la misma en el menu principal y en la partida. Se abre encima de lo que
 * haya; mientras esta abierta, la escena le pasa las teclas.
 */
export const helpPanel = {
  get isOpen(): boolean {
    return ui.get().help;
  },
  open(): void {
    ui.set({ help: true });
  },
  context: (): MenuContext => 'help',
  command(command: MenuCommand): void {
    if (CLOSING_COMMANDS.includes(command.kind)) ui.set({ help: false });
  },
};
