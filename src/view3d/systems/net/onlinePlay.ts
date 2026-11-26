/**
 * La partida por la red en la vista 3D: quien la lleva es la sala del servidor (el `MatchRunner` de
 * `TurnControls`). La pantalla dibuja su copia, la vista que manda el servidor en una sesion espejo
 * (`mirrorSession`), y cada vista nueva se mete en esa misma partida (`fillWith`): la escena 3D y los
 * sistemas que la miran siguen con ella. Como juega:
 *
 * - **Cada accion propia la decide el servidor.** Se comprueba antes con lo que sabe el equipo (lo
 *   mismo que preguntaria la sala, sin esperarla), se manda y se espera su `result` y su eco (la vista
 *   al dia); esa vista pasa a ser la partida y sus sucesos, tal como los ve el equipo, se animan como
 *   siempre. Asi los dados y lo escondido (una emboscada en el camino) salen como en el servidor. Si
 *   la sala la rechaza, se avisa y se pide la vista (`resync`).
 * - **Los demas llegan por lotes** (`RoomPlay`). Mientras no es el turno propio, cada lote se anima
 *   contra `animationView(antes, despues)` (con las unidades que cayeron o se fueron a la niebla) y
 *   deja la de despues; un `turn` de otro pone «Esperando al equipo N…» en la linea de la conexion; el
 *   propio devuelve el mando; un `ended`, el final.
 * - **Lo que llega en el turno propio**: una vista (tras un corte) o un lote ponen la partida al dia
 *   (con la ultima que sabe el cliente: una vista de un `resync` puede llegar detras de algo mas
 *   nuevo); lo que dice que el turno ya ha pasado (se le acabo el tiempo: el `turn` de otro, o un
 *   lote que pasa de turno) o el final sacan del turno (`OnlineHooks.othersGoOn`) y lo atiende la
 *   espera, en orden.
 * - **El reloj del turno** (si la sala lo tiene): cada `turn` trae cuando acaba; al atenderlo, la
 *   pantalla lo cuenta (`OnlineHooks.showClock`, turnClock.ts). Se quita al acabar el turno propio,
 *   cuando la partida sigue sin el (se le acabo el tiempo) y al final.
 * - **La conexion** se enseña en la linea de arriba y suena si se corta un rato (`LinkSounds`); un
 *   cierre sin arreglo avisa y vuelve al menu.
 *
 * Todo lo que manda la sala pasa por un solo sitio, en orden (`pump`), y lo que llega mientras se
 * espera la respuesta a una accion propia se atiende despues de ella. El recorrido entero: docs/RED.md.
 */
import type { SoundPort } from '../../../audio/sounds';
import { actionProblem } from '../../../core/actions';
import { cloneState } from '../../../core/gameContent';
import type { GameAction, GameState, MatchResult, TeamId } from '../../../core/model';
import { fillWith } from '../../../core/net';
import type { GameSession } from '../../../core/session';
import { shownTeamNumber, teamState } from '../../../core/teams';
import { showToast, ui, type NetVM } from '../../../hud/store';
import { closeText } from '../../../menu/online/shared';
import { LinkSounds } from '../../../net/linkSounds';
import { mirrorSession } from '../../../net/mirrorSession';
import type { OnlineListener } from '../../../net/onlineMatch';
import { animationView, type RoomClient, type RoomPlay } from '../../../net/roomClient';
import type { FatalClose, LinkStatus } from '../../../net/serverLink';
import { t } from '../../../settings';
import type { MatchRunner, RunnerReply, RunnerStop, ShowEvents } from '../turn/matchRunner';
import type { TimedTurn } from './turnClock';

/** Lo que se deja leer el aviso de que la sala ha cerrado antes de volver al menu. */
const ROOM_CLOSED_QUIT_MS = 2500;

/** Como se enseña cada estado del enlace en la linea de la conexion (conectando por primera vez, como volviendo). */
const LINK_LINE: Record<LinkStatus, NetVM['status']> = {
  connecting: 'reconnecting',
  online: 'online',
  reconnecting: 'reconnecting',
  closed: 'offline',
};

/** Lo que se usa de la conexion con la sala (`OnlineMatch`, src/net/onlineMatch.ts). */
export interface OnlineRoom {
  readonly client: RoomClient;
  readonly link: { readonly status: LinkStatus };
  listener: OnlineListener;
  close(): void;
}

/** Lo que la partida por la red pide a la pantalla. */
export interface OnlineHooks {
  /** La partida que se ve ha cambiado (una vista nueva): volver a pintar; lo elegido ya no vale. */
  viewReplaced(): void;
  /** La partida ha seguido sin que quien mira acabara su turno (se le acabo el tiempo, o se acabo). */
  othersGoOn(): void;
  /** Vuelve a tocar a quien mira (si no mira la pestaña, avisarle). */
  ownTurn(): void;
  /** El turno que se ve ahora y cuando acaba (null: no corre ningun reloj). */
  showClock(turn: TimedTurn | null): void;
  /** La sala ya no deja seguir (otra pestaña, otra version, ya no existe): al menu. */
  quit(): void;
  /** Lo que suena de la conexion. */
  readonly sounds: SoundPort;
}

type EventsPlay = Extract<RoomPlay, { kind: 'events' }>;
type TurnPlay = Extract<RoomPlay, { kind: 'turn' }>;

export class OnlinePlay implements MatchRunner {
  session: GameSession;
  /** Es el turno propio: lo que llega lo atiende la pantalla; si no, la espera (`untilInput`). */
  private isOwnTurn = false;
  /** Lo que la espera aun no ha atendido, en orden, y la espera que aguarda la siguiente jugada. */
  private readonly forWatcher: RoomPlay[] = [];
  private watcher: ((play: RoomPlay) => void) | null = null;
  /** La respuesta a la ultima accion propia (hasta que llega, lo demas espera). */
  private acting: Promise<unknown> = Promise.resolve();
  private isOver = false;
  private isClosed = false;
  /** La partida que se ve: siempre el mismo objeto, con la ultima vista dentro. */
  private readonly state: GameState;
  private readonly linkSounds: LinkSounds;

  /** `session`: la espejo de la vista con la que empieza la partida (`mirrorSession`). */
  constructor(
    private readonly room: OnlineRoom,
    session: GameSession,
    private readonly viewer: TeamId,
    private readonly hooks: OnlineHooks,
  ) {
    this.session = session;
    this.state = session.state;
    this.linkSounds = new LinkSounds(hooks.sounds);
  }

  /** Empieza a atender a la sala: la conexion en la linea de arriba y cada jugada, en orden. */
  listen(): void {
    this.room.listener = {
      onStatus: (status) => this.linkChanged(status),
      onClosed: (reason) => this.roomClosed(reason),
    };
    this.linkChanged(this.room.link.status);
    void this.pump();
  }

  /** Ya no se sigue la sala (la partida se ha acabado para quien mira). */
  close(): void {
    this.isClosed = true;
    this.linkSounds.stop();
    this.room.close();
  }

  // --- El turno propio ---------------------------------------------------------------------------

  async act(action: GameAction): Promise<RunnerReply> {
    const foreseen = actionProblem(this.state, this.viewer, action);
    if (foreseen) return { ok: false, notice: foreseen };
    const answered = this.askRoom(action);
    this.acting = answered;
    return answered;
  }

  /** La accion por la sala: su eco (la vista al dia) pasa a ser la partida y sus sucesos son los que se animan. */
  private async askRoom(action: GameAction): Promise<RunnerReply> {
    const reply = await this.room.client.act(action);
    if (!reply.ok) {
      this.room.client.resync();
      return { ok: false, notice: t('onlineRejected') };
    }
    this.adopt(reply.state);
    return { ok: true, events: reply.events };
  }

  /** Se le dice a la sala que el turno acabo (si no se acaba de rendir: entonces ya lo sabe). */
  finishTurn(): void {
    this.isOwnTurn = false;
    this.hooks.showClock(null);
    if (!teamState(this.state, this.viewer).resigned) this.room.client.endTurn();
  }

  // --- Los demas ---------------------------------------------------------------------------------

  /** Atiende lo que manda la sala hasta que vuelve a tocar a la persona (o se acaba). */
  async untilInput(show: ShowEvents): Promise<RunnerStop> {
    this.isOwnTurn = false;
    for (;;) {
      const stop = await this.watch(await this.nextForWatcher(), show);
      if (stop) return stop;
    }
  }

  private async watch(play: RoomPlay, show: ShowEvents): Promise<RunnerStop | null> {
    switch (play.kind) {
      case 'view':
        this.adopt(play.state);
        return null;
      case 'events':
        await this.showBatch(play, show);
        return null;
      case 'turn':
        this.showClockOf(play);
        return play.team === this.viewer ? this.ownTurnStarts() : this.waitFor(play.team);
      case 'ended':
        return this.ended(play.result);
      default:
        return play satisfies never;
    }
  }

  /** Un lote de los demas, animado con lo que se fue por el camino; al acabar, la vista de despues es la partida. */
  private async showBatch(play: EventsPlay, show: ShowEvents): Promise<void> {
    this.fill(animationView(play.before, play.after));
    await show(play.events);
    this.adopt(play.after);
  }

  /** Se espera a otra persona (o la IA juega en el servidor): la linea de la conexion lo dice. */
  private waitFor(team: TeamId): null {
    this.setWaiting(t('onlineWaitingFor').replace('{n}', String(shownTeamNumber(team))));
    return null;
  }

  private ownTurnStarts(): RunnerStop {
    this.setWaiting(null);
    this.isOwnTurn = true;
    this.hooks.ownTurn();
    // Lo que llego detras del turno propio ya es del turno propio.
    for (const play of this.forWatcher.splice(0)) this.route(play);
    return { kind: 'input' };
  }

  /** La sala ha acabado: con la ultima vista, el final (lo decide la pantalla como siempre). */
  private ended(result: MatchResult): RunnerStop {
    this.isOver = true;
    const last = this.room.client.state;
    if (last) this.adopt(last);
    this.setWaiting(null);
    this.hooks.showClock(null);
    return { kind: 'over', result };
  }

  // --- Lo que manda la sala, en orden ------------------------------------------------------------

  /** Cada jugada de la sala, una tras otra; lo que llega mientras se espera una respuesta, despues de ella. */
  private async pump(): Promise<void> {
    while (!this.isClosed) {
      const play = await this.room.client.next();
      await this.acting;
      if (!this.isClosed) this.route(play);
    }
  }

  private route(play: RoomPlay): void {
    if (!this.isOwnTurn) return this.toWatcher(play);
    if (!this.endsOwnTurn(play)) return this.duringOwnTurn(play);
    this.isOwnTurn = false;
    this.hooks.showClock(null);
    this.toWatcher(play);
    this.hooks.othersGoOn();
  }

  /** Lo que saca a la persona de su turno sin que lo acabe ella: el turno de otro, un lote en el que el turno ya ha pasado, o el final. */
  private endsOwnTurn(play: RoomPlay): boolean {
    switch (play.kind) {
      case 'ended':
        return true;
      case 'turn':
        return play.team !== this.viewer;
      case 'events':
        // Con lo que trae el propio lote: la partida que se ve puede ir ya por delante (`duringOwnTurn`).
        return play.after.turn !== play.before.turn || play.after.day !== play.before.day;
      case 'view':
        return false;
      default:
        return play satisfies never;
    }
  }

  /**
   * En el turno propio, una vista o un lote (tras un corte, la rendicion de otro) ponen la partida al
   * dia con la ultima del cliente, no con la suya: la de un `resync` puede llegar detras del eco de
   * una accion posterior, y volver a ella desharia esa accion en la pantalla. El `turn` propio que
   * llega otra vez (al volver tras un corte) trae su reloj al dia.
   */
  private duringOwnTurn(play: RoomPlay): void {
    if (play.kind === 'turn') return this.showClockOf(play);
    const latest = this.room.client.state;
    if ((play.kind === 'view' || play.kind === 'events') && latest) this.adopt(latest);
  }

  private toWatcher(play: RoomPlay): void {
    const watcher = this.watcher;
    this.watcher = null;
    if (watcher) watcher(play);
    else this.forWatcher.push(play);
  }

  private nextForWatcher(): Promise<RoomPlay> {
    const play = this.forWatcher.shift();
    if (play) return Promise.resolve(play);
    return new Promise((resolve) => (this.watcher = resolve));
  }

  // --- La vista y la conexion --------------------------------------------------------------------

  /** La partida que se ve pasa a ser esa vista (una copia: la del cliente es el antes del siguiente lote). */
  private fill(view: GameState): void {
    fillWith(this.state, cloneState(view));
    this.hooks.viewReplaced();
  }

  /** La vista que manda el servidor pasa a ser la partida, con su sesion espejo (la de antes ya no vale). */
  private adopt(view: GameState): void {
    fillWith(this.state, cloneState(view));
    this.session = mirrorSession(this.state, this.viewer);
    this.hooks.viewReplaced();
  }

  /** El reloj de ese turno, si lo tiene (si no, ninguno). */
  private showClockOf(play: TurnPlay): void {
    this.hooks.showClock(play.deadline && { team: play.team, day: play.day, deadline: play.deadline });
  }

  /** «Esperando al equipo N…» en la linea de la conexion (null: el turno es propio). */
  private setWaiting(waiting: string | null): void {
    const net = ui.get().net;
    if (net) ui.set({ net: { ...net, waiting } });
  }

  /** La conexion ha cambiado: su linea y, si se corta un rato o vuelve de ese corte, su sonido. */
  private linkChanged(status: LinkStatus): void {
    this.publishLink(status);
    this.linkSounds.statusChanged(status);
  }

  /** La linea de la conexion (sin tocar «Esperando al equipo N…»). */
  private publishLink(status: LinkStatus): void {
    const waiting = ui.get().net?.waiting ?? null;
    ui.set({ net: { status: LINK_LINE[status], waiting } });
  }

  /** La sala no deja seguir: se avisa y, si la partida no ha acabado ya, se vuelve al menu. */
  private roomClosed(reason: FatalClose): void {
    this.linkSounds.closed();
    showToast(closeText(reason));
    this.publishLink('closed');
    if (!this.isOver) setTimeout(() => this.quitUnlessClosed(), ROOM_CLOSED_QUIT_MS);
  }

  /** Al menu, salvo que mientras se leia el aviso ya se haya dejado la partida (`close`: el final la deja). */
  private quitUnlessClosed(): void {
    if (!this.isClosed) this.hooks.quit();
  }
}
