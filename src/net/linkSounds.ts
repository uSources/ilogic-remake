/**
 * Lo que suena de la conexion con la sala, en el vestibulo y en la partida: un corte que dura
 * (`net_reconnecting`), la vuelta de ese corte (`net_connected`) y el cierre sin arreglo (`net_lost`:
 * otra pestaña, otra version, la sala ya no existe). Mientras todo va bien no suena nada: ni al
 * conectar la primera vez ni con un corte que el enlace arregla solo enseguida (vuelve a probar al
 * segundo, `RECONNECT_MS`); sonar con cada uno daria la lata. La vuelta solo suena si ha sonado el
 * corte: si no, se oiria que vuelve algo que nadie sabia que se habia ido.
 */
import type { SoundPort } from '../audio/sounds';
import type { LinkStatus } from './serverLink';

/** Lo que tiene que durar un corte para que suene (ms): mas que los dos primeros reintentos del enlace. */
export const CUT_NOTICE_MS = 4000;

export class LinkSounds {
  private cutNotice: ReturnType<typeof setTimeout> | null = null;
  private isCutHeard = false;

  constructor(private readonly sounds: SoundPort) {}

  /** La conexion ha cambiado (lo que dice `ServerLink.onStatus`). */
  statusChanged(status: LinkStatus): void {
    if (status === 'reconnecting') return this.cutStarted();
    this.cancelCutNotice();
    if (status === 'online' && this.isCutHeard) this.sounds.play('net_connected');
    this.isCutHeard = false;
  }

  /** La sala no deja seguir (`ServerLink.onClosed`). */
  closed(): void {
    this.stop();
    this.sounds.play('net_lost');
  }

  /** Ya no se escucha esta conexion (se sale de la sala, o pasa a la partida): lo que faltaba por sonar ya no suena. */
  stop(): void {
    this.cancelCutNotice();
    this.isCutHeard = false;
  }

  private cutStarted(): void {
    if (this.cutNotice !== null || this.isCutHeard) return;
    this.cutNotice = setTimeout(() => this.cutLasts(), CUT_NOTICE_MS);
  }

  private cutLasts(): void {
    this.cutNotice = null;
    this.isCutHeard = true;
    this.sounds.play('net_reconnecting');
  }

  private cancelCutNotice(): void {
    if (this.cutNotice !== null) clearTimeout(this.cutNotice);
    this.cutNotice = null;
  }
}
