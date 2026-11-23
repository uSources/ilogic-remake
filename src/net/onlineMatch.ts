/**
 * Una partida por la red desde el navegador: el enlace con la sala (`ServerLink`) y el cliente que
 * entiende sus mensajes (`RoomClient`), juntos. La pantalla de «Jugar en línea» lo crea al entrar
 * en una sala; cuando la sala juega, la partida empieza en su propia carga de la pagina, que vuelve
 * a entrar con el mismo codigo y ficha (`inPlay`) y se lo da a la partida 3D.
 */
import { defaultContent } from '../core/content/default';
import type { ServerMessage } from '../core/net';
import { RoomClient, type RoomPlay } from './roomClient';
import { browserLinkDeps, ServerLink, type FatalClose, type LinkDeps, type LinkStatus } from './serverLink';
import { roomSocketUrl } from './serverUrl';

/** Lo que se espera, como mucho, a que la sala mande la partida al entrar desde la partida (sin red, se vuelve al menu). */
const IN_PLAY_TIMEOUT_MS = 15000;

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

  /**
   * Entra y espera a que la sala juegue (su vista y a quien se espera, o su final): null cuando ya se
   * puede jugar, o por que no (un cierre sin arreglo; 'other' si no llega a tiempo). Lo que llega
   * queda en la cola del cliente para la partida.
   */
  inPlay(timeoutMs = IN_PLAY_TIMEOUT_MS): Promise<FatalClose | null> {
    return new Promise((resolve) => {
      const finish = (reason: FatalClose | null): void => {
        clearTimeout(timer);
        this.listener = {};
        resolve(reason);
      };
      const timer = setTimeout(() => finish('other'), timeoutMs);
      this.listener = { onPlay: () => this.client.isInPlay && finish(null), onClosed: finish };
      this.connect();
    });
  }

  close(): void {
    this.listener = {};
    this.link.close();
  }
}
