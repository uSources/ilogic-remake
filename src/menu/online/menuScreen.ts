/**
 * El menu de «Jugar en línea»: «Crear partida», entrar con el codigo (o el enlace) de una sala y
 * «Mis partidas en línea» (las salas en las que este navegador tiene asiento, `net/onlineRooms`), cada
 * una con como esta segun el servidor (te toca, le toca a otro...: roomLines.ts), que se pregunta al
 * abrir y cada poco mientras se mira la lista. Abrir «Crear partida» y entrar en una sala lo hace el
 * conjunto (onlineScreen.ts: `enterRoom`, `joinRoom`).
 */
import type { OnlineVM } from '../../hud/store';
import { forgetRoom, parseRoomLink, readOnlineRooms } from '../../net/onlineRooms';
import { lobbyOf, type ApiResult, type LobbyInfo } from '../../net/roomApi';
import { serverUrl } from '../../net/serverUrl';
import { t } from '../../settings';
import { isSettled, roomLines, type RoomLook } from './roomLines';
import type { OnlineScreens } from './shared';

const ROOM_PREFIX = 'room-';
const FORGET_PREFIX = 'forget-';

/** Cada cuanto se vuelve a preguntar como estan las salas mientras se mira la lista (te toca, quedan 3 h...). */
const ROOMS_POLL_MS = 20_000;

const UNKNOWN: RoomLook = { kind: 'unknown' };

/** La clase del cuadro del codigo: mientras tiene el foco, las teclas son suyas (se esta escribiendo). */
const CODE_INPUT_CLASS = 'on-code-input';

/** El elemento con el foco es el cuadro del codigo de la sala: se esta escribiendo. */
export const isTypingRoomCode = () => (document.activeElement as HTMLElement | null)?.classList.contains(CODE_INPUT_CLASS) === true;

/**
 * Lo que se sabe de la sala tras preguntar: lo que diga el servidor, o que ya no existe. Si no se le
 * alcanza (sin red), lo de antes: una sala no deja de ser tuya por un corte.
 */
function lookAfter(result: ApiResult<LobbyInfo>, before: RoomLook): RoomLook {
  if (result.ok) return { kind: 'info', info: result.value };
  if (result.error === 'noSuchRoom') return { kind: 'gone' };
  return before;
}

export class MenuScreen {
  private codeText = '';
  private codeError: string | null = null;
  private readonly looks = new Map<string, RoomLook>();
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  /**
   * Cuantas veces se ha abierto o cerrado la lista: lo que se pregunta lleva la de entonces y, si ya
   * es otra (se salio, o se volvio a abrir con otra ronda de preguntas en marcha), no sigue.
   */
  private watch = 0;

  constructor(private readonly screens: OnlineScreens) {}

  /** Pasa a esta pantalla, con el cuadro vacio, y pregunta como estan las salas. */
  open(): void {
    this.close();
    this.codeText = '';
    this.codeError = null;
    this.screens.show('menu', 'create');
    void this.refresh(this.watch);
  }

  /** Se deja de mirar la lista (a crear, a una sala o fuera): nada queda preguntando. */
  close(): void {
    this.watch++;
    if (this.pollHandle !== null) clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  /** Las salas, con lo que pide hacer algo arriba, y el cuadro del codigo. */
  vm(): Pick<OnlineVM, 'rooms' | 'code'> {
    const rooms = roomLines(readOnlineRooms(), (code) => this.lookOf(code), Date.now());
    return { rooms, code: { text: this.codeText, error: this.codeError } };
  }

  /** Las filas del foco: crear, el codigo, cada sala (entrar, si aun existe, y quitarla) y volver. */
  rows(): string[][] {
    const rooms = this.vm().rooms.map((room) => {
      const forget = `${FORGET_PREFIX}${room.code}`;
      return room.enter === null ? [forget] : [`${ROOM_PREFIX}${room.code}`, forget];
    });
    return [['create'], ['codeText', 'codeGo'], ...rooms, ['back']];
  }

  /** Lo que se ha escrito en el cuadro del codigo. */
  setText(text: string): void {
    this.codeText = text;
    this.codeError = null;
    this.screens.publish();
  }

  /** Lo que se ha pulsado, si es de esta pantalla (el codigo, una sala, quitarla): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus === 'codeGo') this.enterFromText();
    else if (focus === 'codeText') document.querySelector<HTMLInputElement>(`.${CODE_INPUT_CLASS}`)?.focus();
    else if (focus.startsWith(ROOM_PREFIX)) this.rejoin(focus.slice(ROOM_PREFIX.length));
    else if (focus.startsWith(FORGET_PREFIX)) this.forget(focus.slice(FORGET_PREFIX.length));
    else return false;
    return true;
  }

  /** Entra en la sala de lo escrito: un enlace de asiento entra con su ficha; un codigo o el enlace de la sala, pidiendo asiento. */
  enterFromText(): void {
    const link = parseRoomLink(this.codeText);
    if (!link) {
      this.codeError = t('onlineBadCode');
      return this.screens.publish();
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (link.token) this.screens.joinRoom(link.code, link.token);
    else this.screens.enterRoom(link.code);
  }

  private rejoin(code: string): void {
    const room = readOnlineRooms().find((candidate) => candidate.code === code);
    if (room) this.screens.joinRoom(room.code, room.token);
  }

  private forget(code: string): void {
    forgetRoom(code);
    this.looks.delete(code);
    this.screens.focus = 'create';
    this.screens.publish();
  }

  private lookOf(code: string): RoomLook {
    return this.looks.get(code) ?? UNKNOWN;
  }

  /**
   * Pregunta al servidor por cada sala apuntada que sigue en marcha (a la vez; las acabadas o que ya
   * no existen no cambian: `isSettled`) y, mientras se mire la lista, vuelve a preguntar.
   */
  private async refresh(watch: number): Promise<void> {
    const base = serverUrl();
    if (!base || watch !== this.watch) return;
    const ask = async (code: string) => ({ code, result: await lobbyOf(base, code) });
    const live = readOnlineRooms().filter((entry) => !isSettled(this.lookOf(entry.code)));
    const answers = await Promise.all(live.map((entry) => ask(entry.code)));
    for (const { code, result } of answers) this.looks.set(code, lookAfter(result, this.lookOf(code)));
    if (watch !== this.watch) return;
    this.screens.publish();
    this.pollHandle = setTimeout(() => void this.refresh(watch), ROOMS_POLL_MS);
  }
}
