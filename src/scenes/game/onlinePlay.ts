/**
 * La partida por la red en la escena: todo lo que la pantalla hace distinto cuando la partida vive
 * en el servidor (`OnlineMatch`, src/net). La escena solo la crea (`GameScene.init`) y le pasa cada
 * accion; lo demas lo ve por su `OnlinePlayHost` y por los turnos (`TurnHooks`: lo que TurnFlow le
 * deja tocar de los turnos de la pantalla). Como juega:
 *
 * - **El turno propio**, como en la hotseat: cada accion pasa por la sesion espejo (`mirrorSession`:
 *   la vista del servidor con la persona en su equipo y los demas remotos) y, si vale, se manda a la
 *   sala (`send`). Si la sala la rechaza (algo escondido lo impedia), se avisa y se pide la vista
 *   (`resync`), que vuelve a ser la partida. Lo que se anima (atacar, capturar, comprar, unirse,
 *   subir, poderes: `perform`) lo decide el servidor —los dados y lo escondido estan alli—: se espera
 *   su `result` y su eco (la vista al dia), la vista pasa a ser la partida (`adoptView`) y sus
 *   sucesos, tal como los ve el equipo, se animan como siempre.
 * - **Los demas**, por lotes (`watchUntilMyTurn`): cada jugada de la cola del cliente (`RoomPlay`)
 *   se atiende en orden hasta que vuelve a tocar a la persona; un lote se anima por turnos contra
 *   `animationView(antes, despues)` y deja la vista de despues como partida. Un `turn` de otro pone
 *   «Esperando al equipo N…» en la linea de la conexion (`UIState.net`); el propio devuelve el mando
 *   (y si no se mira la pestaña, el titulo y un toque lo avisan: turnNotice.ts). Un `ended` deja la
 *   ultima vista y el final lo decide la pantalla como siempre (`checkEnd`).
 * - **Lo que llega en el turno propio** sin ser eco (una vista tras un corte, el servidor que acaba
 *   el turno por tiempo) lo atiende `playDuringOwnTurn`.
 * - **La conexion** se enseña en la linea de arriba (`publishLink`); un cierre sin arreglo (otra
 *   pestaña, otra version, la sala ya no existe) avisa y saca al menu (`roomClosed`).
 *
 * El recorrido entero, de la pantalla al servidor y vuelta: docs/RED.md.
 */
import type Phaser from 'phaser';
import type { GameAction, GameEvent, GameState, TeamId } from '../../core/model';
import type { GameSession } from '../../core/session';
import { shownTeamNumber, teamState } from '../../core/teams';
import { showToast, ui } from '../../hud/store';
import type { OnlineMatch } from '../../net/onlineMatch';
import { animationView, splitByTurn, type RoomPlay } from '../../net/roomClient';
import type { FatalClose, LinkStatus } from '../../net/serverLink';
import { t, type TextKey } from '../../settings';
import { mirrorSession } from './matchSetup';
import { addToSummary, newTurnSummary, type TurnSummary } from './turnSummary';

/** Lo que se deja leer el aviso de que la sala ha cerrado antes de volver al menu. */
const ROOM_CLOSED_QUIT_MS = 2500;

const CLOSE_TEXT: Record<FatalClose, TextKey> = {
  badToken: 'onlineBadToken',
  replaced: 'onlineReplaced',
  gone: 'onlineGone',
  badVersion: 'onlineBadVersion',
  other: 'onlineFailed',
};

/** Lo que la partida por la red toca de los turnos de la pantalla (lo cumple TurnFlow). */
export interface TurnHooks {
  /** Empieza el turno de un equipo: el propio (ya no juegan otros) o el de otro, con su aviso. */
  turnStarts(team: TeamId): Promise<void>;
  /** Quien mira ha visto las caidas hasta la ultima apuntada. */
  markFallsSeen(viewer: TeamId): void;
  /** Se espera a otro equipo (o la IA juega en el servidor), o ya no (null: vuelve a tocar a la persona). */
  othersPlay(team: TeamId | null): void;
  /** El turno propio acaba (como «Fin de turno»). */
  endOwnTurn(): Promise<void>;
}

/** Lo que la partida por la red necesita de la escena. */
export interface OnlinePlayHost {
  readonly scene: Phaser.Scene;
  /** La partida que se ve (mientras se anima un lote, la vista con la que se puede dibujar). */
  state: GameState;
  readonly viewer: TeamId;
  /** Partida en curso: cambia en cada init() y al cerrar la escena; las esperas la comprueban. */
  readonly match: number;
  readonly ended: boolean;
  fastForward: boolean;
  readonly turns: TurnHooks;
  /** La partida que se ve pasa a ser esta, con su sesion (lo que estuviera a medio decidir se abandona). */
  replaceMatch(state: GameState, session: GameSession): void;
  play(events: GameEvent[], ghostKey?: string | null): Promise<void>;
  refresh(): void;
  /** La partida ha terminado (y empieza el final): true. */
  checkEnd(): boolean;
  /** Ha vuelto a tocar a la persona mientras no miraba la pestaña (titulo, aviso). */
  notifyTurn(): void;
  quitToMenu(): void;
}

export class OnlinePlay {
  /** Se esta sacando de la cola lo que manda la sala (`watchUntilMyTurn`). */
  private isWatching = false;

  constructor(
    /** La sala desde el navegador: el enlace con el servidor y el cliente que entiende sus mensajes. */
    readonly room: OnlineMatch,
    private readonly host: OnlinePlayHost,
  ) {}

  /** Lo que llega de la sala: las jugadas se atienden aqui; la conexion se enseña; un cierre sin arreglo saca al menu. */
  listen(): void {
    this.room.listener = {
      onStatus: (status) => this.publishLink(status),
      onClosed: (reason) => this.roomClosed(reason),
      onPlay: () => void this.takeOne(),
    };
    this.publishLink(this.room.link.status);
  }

  /** Al cerrar la escena, o al empezar otra partida. */
  close(): void {
    this.room.close();
  }

  // --- El turno propio ---------------------------------------------------------------------------

  /** Manda a la sala lo que la persona acaba de hacer aqui (ya valia en la sesion espejo); si la sala no lo acepta, su vista es la que vale. */
  send(action: GameAction): void {
    void this.sendToRoom(action);
  }

  private async sendToRoom(action: GameAction): Promise<void> {
    const match = this.host.match;
    const reply = await this.room.client.act(action);
    if (reply.ok || match !== this.host.match) return;
    showToast(t('onlineRejected'));
    this.room.client.resync();
  }

  /**
   * Una accion que se anima: la decide el servidor (los dados y lo escondido estan alli), su eco pone
   * la partida al dia y sus sucesos, tal como los ve este equipo, se animan como siempre.
   */
  async perform(action: GameAction, ghostKey?: string | null): Promise<boolean> {
    const host = this.host;
    const match = host.match;
    const echo = this.room.client.nextEcho();
    const reply = await this.room.client.act(action);
    if (match !== host.match) return false;
    if (!reply.ok) {
      showToast(t('onlineRejected'));
      this.room.client.resync();
      return false;
    }
    const after = await echo;
    if (match !== host.match) return false;
    this.adoptView(after);
    await host.play(reply.events, ghostKey);
    return true;
  }

  /** Se le dice a la sala que el turno acabo (si no se acaba de rendir: entonces ya lo sabe) y se mira lo que llega. */
  endTurn(match: number): Promise<TurnSummary | null> {
    const host = this.host;
    if (!teamState(host.state, host.viewer).resigned) this.room.client.endTurn();
    return this.watchUntilMyTurn(match);
  }

  // --- Los demas ---------------------------------------------------------------------------------

  /**
   * Mientras no es el turno propio: la sala manda lo que pasa por lotes (`RoomPlay`) y aqui se anima
   * cada uno, hasta que vuelve a tocar a la persona (`turn` suyo). Devuelve lo que contar al volver,
   * o null si la partida ha cambiado o ha terminado.
   */
  async watchUntilMyTurn(match: number): Promise<TurnSummary | null> {
    const host = this.host;
    const summary = newTurnSummary();
    this.isWatching = true;
    try {
      for (;;) {
        const play = await this.room.client.next();
        if (match !== host.match) return null;
        const isMyTurn = await this.show(play, summary);
        if (match !== host.match || host.ended) return null;
        if (isMyTurn) break;
      }
    } finally {
      this.isWatching = false;
    }
    host.turns.othersPlay(null);
    this.setWaiting(null);
    host.notifyTurn();
    return summary;
  }

  /** Atiende una jugada de la sala mientras se espera: true si ya vuelve a tocar a la persona. */
  private async show(play: RoomPlay, summary: TurnSummary): Promise<boolean> {
    switch (play.kind) {
      case 'view':
        this.adoptView(play.state);
        return false;
      case 'events':
        await this.showBatch(play, summary);
        return false;
      case 'turn':
        if (play.team === this.host.viewer) return true;
        this.waitFor(play.team);
        return false;
      case 'ended':
        this.endedByRoom();
        return true;
    }
  }

  /**
   * Un lote de pasos de los demas, animado por turnos (el aviso de cada uno) contra la vista con la
   * que se puede dibujar (`animationView`); al acabar, la vista de despues es la partida.
   */
  private async showBatch(play: Extract<RoomPlay, { kind: 'events' }>, summary: TurnSummary): Promise<void> {
    const host = this.host;
    const match = host.match;
    addToSummary(summary, play.after, host.viewer, play.events);
    host.state = animationView(play.before, play.after);
    host.refresh();
    for (const chunk of splitByTurn(play.events)) {
      if (chunk.team !== null) await host.turns.turnStarts(chunk.team);
      if (match !== host.match) return;
      await host.play(chunk.events);
      if (match !== host.match) return;
      if (chunk.events.some((event) => event.kind === 'teamDefeated')) host.turns.markFallsSeen(host.viewer);
    }
    this.adoptView(play.after);
  }

  /** Se espera a otra persona (o la IA juega en el servidor): el cartel y la linea de la conexion lo dicen. */
  private waitFor(team: TeamId): void {
    const host = this.host;
    host.turns.othersPlay(team);
    host.fastForward = false;
    this.setWaiting(t('onlineWaitingFor').replace('{n}', String(shownTeamNumber(team))));
    host.refresh();
  }

  /** «Esperando al equipo N…» en la linea de la conexion (null: el turno es propio). */
  private setWaiting(waiting: string | null): void {
    const net = ui.get().net;
    if (net) ui.set({ net: { ...net, waiting } });
  }

  /** Una jugada que llega fuera de la espera (en el turno propio): se saca de la cola y se atiende. */
  private async takeOne(): Promise<void> {
    if (this.isWatching) return;
    const match = this.host.match;
    const play = await this.room.client.next();
    if (match !== this.host.match) return;
    await this.playDuringOwnTurn(play);
  }

  /** Una jugada que llega en el turno propio (no se esta mirando la cola). */
  private async playDuringOwnTurn(play: RoomPlay): Promise<void> {
    const host = this.host;
    if (this.isWatching || host.ended) return;
    if (play.kind === 'view') return this.adoptView(play.state);
    if (play.kind === 'events') return this.adoptView(play.after);
    if (play.kind === 'ended') return this.endedByRoom();
    // La sala ha pasado el turno sin que lo acabara la persona (se le acabo el tiempo): se mira a los demas.
    if (play.team !== host.viewer) {
      this.waitFor(play.team);
      await host.turns.endOwnTurn();
    }
  }

  /** La sala ha acabado: con la ultima vista, el final de la partida (lo decide la pantalla como siempre). */
  private endedByRoom(): void {
    const last = this.room.client.state;
    if (last) this.adoptView(last);
    this.host.checkEnd();
  }

  // --- La vista y la conexion --------------------------------------------------------------------

  /** La vista que manda el servidor pasa a ser la partida que se ve, con su sesion espejo (la de antes ya no vale). */
  private adoptView(state: GameState): void {
    this.host.replaceMatch(state, mirrorSession(state, this.host.viewer));
  }

  /** La linea de la conexion (sin tocar «Esperando al equipo N…»). */
  private publishLink(status: LinkStatus): void {
    const waiting = ui.get().net?.waiting ?? null;
    ui.set({ net: { status: status === 'online' ? 'online' : status === 'closed' ? 'offline' : 'reconnecting', waiting } });
  }

  /** La sala no deja seguir (otra pestaña, otra version, la sala ya no existe): se avisa y se sale al menu. */
  private roomClosed(reason: FatalClose): void {
    showToast(t(CLOSE_TEXT[reason]));
    this.publishLink('closed');
    if (!this.host.ended) this.host.scene.time.delayedCall(ROOM_CLOSED_QUIT_MS, () => this.host.quitToMenu());
  }
}
