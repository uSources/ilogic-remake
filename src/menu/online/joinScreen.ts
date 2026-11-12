/**
 * «Entrar con enlace»: el cuadro donde se pega el enlace de invitacion (o `CODIGO/FICHA`) y el
 * boton de entrar. Lo que se escribe lo lee `parseInvite` (`net/onlineRooms`); entrar en la sala lo
 * hace el conjunto (`OnlineScreens.joinRoom`).
 */
import { parseInvite } from '../../net/onlineRooms';
import { serverUrl } from '../../net/serverUrl';
import type { OnlineVM } from '../../hud/store';
import { t } from '../../settings';
import type { OnlineScreens } from './shared';

/** El elemento con el foco es el cuadro del enlace: se esta escribiendo. */
export const isTypingInvite = () => (document.activeElement as HTMLElement | null)?.classList.contains('on-invite') === true;

export class JoinScreen {
  private text = '';
  private error: string | null = null;

  constructor(private readonly screens: OnlineScreens) {}

  /** Pasa a esta pantalla, con el cuadro vacio. */
  open(): void {
    if (!serverUrl()) return;
    this.screens.show('join', 'joinText');
    this.text = '';
    this.error = null;
    this.screens.publish();
  }

  vm(): OnlineVM['join'] {
    return { text: this.text, error: this.error };
  }

  /** Las filas del foco: el cuadro, y volver o entrar. */
  rows(): string[][] {
    return [['joinText'], ['back', 'joinGo']];
  }

  /** Lo que se ha escrito en el cuadro. */
  setText(text: string): void {
    this.text = text;
    this.error = null;
    this.screens.publish();
  }

  /** Lo que se ha pulsado, si es de esta pantalla (el cuadro, entrar): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus === 'joinGo') {
      this.joinFromText();
      return true;
    }
    if (focus !== 'joinText') return false;
    document.querySelector<HTMLInputElement>('.on-invite')?.focus();
    return true;
  }

  /** Entra con lo que hay en el cuadro (si es un enlace de invitacion). */
  joinFromText(): void {
    const invite = parseInvite(this.text);
    if (!invite) {
      this.error = t('onlineBadInvite');
      return this.screens.publish();
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.screens.joinRoom(invite.code, invite.token);
  }
}
