/**
 * El menu de «Jugar en línea»: «Buscar rival» (en vivo o, con su enlace, por turnos), «Con amigos»
 * (crear sala, o entrar con el codigo o el enlace de una sala) y «Mis partidas» (las
 * salas en las que este navegador tiene asiento, `net/onlineRooms`), cada una con como esta segun el
 * servidor (te toca, le toca a otro, buscando rival...: roomLines.ts), que se pregunta al abrir y cada
 * poco mientras se mira la lista (`OnlineScreens.rooms`, roomWatch.ts). Buscar, abrir «Crear
 * partida» y entrar en una sala lo hace el conjunto (onlineScreen.ts: `searchRival`, `enterRoom`, `joinRoom`).
 */
import { isSearchPace, PACE_RULES, SEARCH_PACES, type SearchPace } from '../../core/net';
import type { OnlineSearchVM, OnlineVM } from '../../hud/store';
import { forgetRoom, parseRoomLink, readOnlineRooms, type OnlineRoomEntry } from '../../net/onlineRooms';
import { t, type TextKey } from '../../settings';
import { FORGET_PREFIX, isSearching, ROOM_PREFIX, roomLines } from './roomLines';
import { paceTurnText, type OnlineScreens } from './shared';
import { Visits } from './visits';

const PACE_PREFIX = 'pace-';

/** Lo que tiene el foco al abrir el menu: buscar rival, lo primero que se viene a hacer. */
const FIRST_FOCUS = 'search';

/** El ritmo con el que se abre «Buscar rival»: en vivo, los dos delante; por turnos queda en su enlace. */
const FIRST_PACE: SearchPace = 'live';

/** Lo que dice «Buscar rival» de cada ritmo: el titulo, de que va y el enlace que lleva a el desde el otro. */
const PACE_TEXT: Record<SearchPace, { title: TextKey; note: TextKey; link: TextKey }> = {
  live: { title: 'onlineSearchTitleLive', note: 'onlineSearchNoteLive', link: 'onlineOtherPaceLive' },
  daily: { title: 'onlineSearchTitleDaily', note: 'onlineSearchNoteDaily', link: 'onlineOtherPaceDaily' },
};

/** El ritmo que no es este (el del enlace de debajo de «Buscar rival»). */
const otherPace = (pace: SearchPace): SearchPace => SEARCH_PACES.find((candidate) => candidate !== pace) ?? pace;

/** «Buscar rival» con ese ritmo: «1 contra 1, en vivo», sus reglas, su mapa y su reloj, y el enlace al otro ritmo. */
function searchOf(pace: SearchPace): OnlineSearchVM {
  const text = PACE_TEXT[pace];
  const size = PACE_RULES[pace].mapSize;
  const other = otherPace(pace);
  const note = t(text.note).replace('{size}', `${size}×${size}`).replace('{time}', paceTurnText(pace));
  const label = t(PACE_TEXT[other].link).replace('{time}', paceTurnText(other));
  return { pace, title: t(text.title), note, other: { pace: other, id: `${PACE_PREFIX}${other}`, label } };
}

/** La clase del cuadro del codigo: mientras tiene el foco, las teclas son suyas (se esta escribiendo). */
const CODE_INPUT_CLASS = 'on-code-input';

/** El elemento con el foco es el cuadro del codigo de la sala: se esta escribiendo. */
export const isTypingRoomCode = () => (document.activeElement as HTMLElement | null)?.classList.contains(CODE_INPUT_CLASS) === true;

export class MenuScreen {
  /** El ritmo de «Buscar rival» (se queda el elegido mientras la pantalla siga abierta). */
  private pace: SearchPace = FIRST_PACE;
  private codeText = '';
  private codeError: string | null = null;
  /** Cada vez que se abre o cierra la lista: lo que acaba despues de salir (cancelar una busqueda) ya no la toca. */
  private readonly visits = new Visits();

  constructor(private readonly screens: OnlineScreens) {}

  /** Pasa a esta pantalla, con el cuadro vacio, y pregunta como estan las salas. */
  open(): void {
    this.close();
    this.codeText = '';
    this.codeError = null;
    this.screens.show('menu', FIRST_FOCUS);
    this.screens.rooms.start(() => this.screens.publish());
  }

  /** Se deja de mirar la lista (a crear, a una sala o fuera): nada queda preguntando. */
  close(): void {
    this.visits.next();
    this.screens.rooms.stop();
  }

  /** Buscar rival (con el ritmo elegido), las salas (con lo que pide hacer algo arriba), el cuadro del codigo y si el servidor contesta. */
  vm(): Pick<OnlineVM, 'search' | 'rooms' | 'code' | 'server'> {
    const rooms = roomLines(readOnlineRooms(), (code) => this.screens.rooms.lookOf(code), Date.now());
    const code = { text: this.codeText, error: this.codeError };
    return { search: searchOf(this.pace), rooms, code, server: this.screens.rooms.serverReach() };
  }

  /**
   * Las filas del foco: volver (arriba a la izquierda), las dos tarjetas lado a lado («Buscar rival»
   * y «Crear sala»; debajo, el enlace del otro ritmo, el codigo y «Entrar») y cada sala de la
   * columna de «Mis partidas» (entrar, si aun existe, y quitarla).
   */
  rows(): string[][] {
    const { search, rooms } = this.vm();
    const roomRows = rooms.map((room) => [room.enterId, room.forgetId].filter((id): id is string => id !== null));
    return [['back'], ['search', 'create'], [search.other.id, 'codeText', 'codeGo'], ...roomRows];
  }

  /** Lo que se ha escrito en el cuadro del codigo. */
  setText(text: string): void {
    this.codeText = text;
    this.codeError = null;
    this.screens.publish();
  }

  /** Lo que se ha pulsado, si es de esta pantalla (un ritmo, buscar, el codigo, una sala, quitarla): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus === 'search') this.screens.searchRival(this.pace);
    else if (focus.startsWith(PACE_PREFIX)) this.choosePace(focus.slice(PACE_PREFIX.length));
    else if (focus === 'codeGo') this.enterFromText();
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

  private choosePace(pace: string): void {
    if (isSearchPace(pace)) this.pace = pace;
    this.screens.publish();
  }

  /** Quita la sala de la lista; si es la propia busqueda de rival, antes la cancela (si llego un rival justo, se queda). */
  private forget(code: string): void {
    const entry = readOnlineRooms().find((candidate) => candidate.code === code);
    if (entry && isSearching(entry, this.screens.rooms.lookOf(code))) return void this.cancelSearch(entry);
    forgetRoom(code);
    this.forgotten(code);
  }

  private async cancelSearch(entry: OnlineRoomEntry): Promise<void> {
    const visit = this.visits.current();
    const cancelled = await this.screens.cancelSearch(entry);
    if (!this.visits.isCurrent(visit)) return;
    if (cancelled) return this.forgotten(entry.code);
    // Ha llegado un rival: lo que diga ahora el servidor.
    this.screens.rooms.forget(entry.code);
    this.screens.rooms.restart();
  }

  private forgotten(code: string): void {
    this.screens.rooms.forget(code);
    this.screens.focus = FIRST_FOCUS;
    this.screens.publish();
  }
}
