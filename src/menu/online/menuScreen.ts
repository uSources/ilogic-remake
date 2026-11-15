/**
 * El menu de «Jugar en línea»: «Crear sala», «Entrar con enlace» y «Mis partidas en línea» (las
 * salas en las que este navegador tiene asiento, `net/onlineRooms`: volver a entrar u olvidarla).
 * Abrir las pantallas de crear y entrar lo hace el conjunto (onlineScreen.ts); aqui, las salas.
 */
import { forgetRoom, readOnlineRooms } from '../../net/onlineRooms';
import type { OnlineRoomVM } from '../../hud/store';
import { t } from '../../settings';
import { statusText, type OnlineScreens } from './shared';

const ROOM_PREFIX = 'room-';
const FORGET_PREFIX = 'forget-';

export class MenuScreen {
  constructor(private readonly screens: OnlineScreens) {}

  /** Las salas apuntadas, para la lista. */
  rooms(): OnlineRoomVM[] {
    return readOnlineRooms().map((room) => ({
      code: room.code,
      summary: `${room.teams} ${t('onlineTeams').toLowerCase()} · ${statusText(room.status)}`,
    }));
  }

  /** Las filas del foco: crear y entrar, cada sala con su «Olvidar», y volver. */
  rows(): string[][] {
    const rooms = readOnlineRooms().flatMap((room) => [[`${ROOM_PREFIX}${room.code}`, `${FORGET_PREFIX}${room.code}`]]);
    return [['create', 'join'], ...rooms, ['back']];
  }

  /** Lo que se ha pulsado, si es de esta pantalla (una sala, u olvidarla): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus.startsWith(ROOM_PREFIX)) {
      this.rejoin(focus.slice(ROOM_PREFIX.length));
      return true;
    }
    if (!focus.startsWith(FORGET_PREFIX)) return false;
    forgetRoom(focus.slice(FORGET_PREFIX.length));
    this.screens.focus = 'create';
    this.screens.publish();
    return true;
  }

  private rejoin(code: string): void {
    const room = readOnlineRooms().find((candidate) => candidate.code === code);
    if (room) this.screens.joinRoom(room.code, room.token);
  }
}
