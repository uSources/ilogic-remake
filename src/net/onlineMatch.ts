/**
 * Una partida por la red desde el navegador: el enlace con la sala (`ServerLink`) y el cliente que
 * entiende sus mensajes (`RoomClient`), juntos. La pantalla de «Jugar en línea» lo crea al entrar
 * en una sala y se lo pasa a la escena de la partida cuando empieza; la escena lo cierra al salir.
 */
import { defaultContent } from '../core/content/default';
import type { ServerMessage } from '../core/net';
import { RoomClient, type RoomPlay } from './roomClient';
import { browserLinkDeps, ServerLink, type FatalClose, type LinkDeps, type LinkStatus } from './serverLink';
import { roomSocketUrl } from './serverUrl';

export interface OnlineListener {
  onStatus?(status: LinkStatus): void;
  onClosed?(reason: FatalClose): void;
  onPlay?(play: RoomPlay): void;
  onMessage?(message: ServerMessage): void;
}

export class OnlineMatch {
  readonly link: ServerLink;
  readonly client: RoomClient;
  /** Quien escucha ahora (la pantalla del menu primero, la escena despues). */
  listener: OnlineListener = {};

  constructor(
    readonly base: string,
    readonly code: string,
    readonly token: string,
    deps: LinkDeps = browserLinkDeps(),
  ) {
    this.link = new ServerLink(
      roomSocketUrl(base, code),
      code,
      token,
      {
        onMessage: (message) => {
          this.client.receive(message);
          this.listener.onMessage?.(message);
        },
        onStatus: (status) => this.listener.onStatus?.(status),
        onClosed: (reason) => this.listener.onClosed?.(reason),
      },
      deps,
    );
    this.client = new RoomClient(this.link, defaultContent(), { onPlay: (play) => this.listener.onPlay?.(play) });
  }

  connect(): void {
    this.link.connect();
  }

  close(): void {
    this.listener = {};
    this.link.close();
  }
}
