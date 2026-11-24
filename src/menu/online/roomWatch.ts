/**
 * Lo que dice el servidor de las salas apuntadas en este navegador («Mis partidas», net/onlineRooms):
 * te toca, le toca a otro, esperando, acabada, ya no existe. Pregunta por todas a la vez al empezar a
 * mirar y cada poco mientras se miran, y avisa con cada respuesta. Una sola para todo el menu: la
 * tarjeta «En línea» de Inicio (si te toca) y la lista de «Jugar en línea» ven lo mismo, y al pasar
 * de una a otra no se vuelve a empezar de cero.
 */
import { readOnlineRooms, type OnlineRoomEntry } from '../../net/onlineRooms';
import { lobbyOf, type ApiResult, type LobbyInfo } from '../../net/roomApi';
import { serverUrl } from '../../net/serverUrl';
import { isSettled, type RoomLook } from './roomLines';

/** Cada cuanto se vuelve a preguntar mientras se miran las salas (te toca, quedan 3 h...). */
const ROOMS_POLL_MS = 20_000;

const UNKNOWN: RoomLook = { kind: 'unknown' };

/** Si el servidor contesta: la pastilla de arriba de «Jugar en línea» (null sin salas apuntadas: no hay por que preguntarle). */
export type ServerReach = 'online' | 'offline' | null;

/** Contesta si alguna respuesta ha llegado de el (aunque sea «esa sala no existe»). */
const reachOf = (results: readonly ApiResult<LobbyInfo>[]): ServerReach =>
  results.some((result) => result.ok || result.error !== 'unreachable') ? 'online' : 'offline';

/**
 * Lo que se sabe de la sala tras preguntar: lo que diga el servidor, o que ya no existe. Si no se le
 * alcanza (sin red), lo de antes: una sala no deja de ser tuya por un corte.
 */
function lookAfter(result: ApiResult<LobbyInfo>, before: RoomLook): RoomLook {
  if (result.ok) return { kind: 'info', info: result.value };
  if (result.error === 'noSuchRoom') return { kind: 'gone' };
  return before;
}

export class RoomWatch {
  private readonly looks = new Map<string, RoomLook>();
  private reach: ServerReach = null;
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private onChange: (() => void) | null = null;
  /**
   * Cuantas veces se ha empezado o dejado de mirar: lo que se pregunta lleva la de entonces y, si ya
   * es otra (se dejo de mirar, o se volvio a empezar con otra ronda de preguntas en marcha), no sigue.
   */
  private watch = 0;

  /** Lo ultimo que dijo el servidor de esa sala (o nada, si aun no ha contestado). */
  lookOf(code: string): RoomLook {
    return this.looks.get(code) ?? UNKNOWN;
  }

  /** Si el servidor contesto la ultima vez que se le pregunto (sin salas apuntadas, no se sabe: null). */
  serverReach(): ServerReach {
    return this.reach;
  }

  /** Olvida lo que se sabia de la sala (se ha quitado de la lista, o ha cambiado y hay que volver a preguntar). */
  forget(code: string): void {
    this.looks.delete(code);
  }

  /** Empieza a mirar: pregunta ya y luego cada poco; con cada respuesta, `onChange`. Quien miraba antes deja de recibir avisos. */
  start(onChange: () => void): void {
    this.stop();
    this.onChange = onChange;
    void this.refresh(this.watch);
  }

  /** Vuelve a preguntar ya, para quien esta mirando (si hay alguien). */
  restart(): void {
    if (this.onChange) this.start(this.onChange);
  }

  stop(): void {
    this.watch++;
    this.onChange = null;
    if (this.pollHandle !== null) clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  /**
   * Pregunta al servidor por cada sala apuntada que sigue en marcha (a la vez; las acabadas o que ya
   * no existen no cambian: `isSettled`) y, mientras se mire, vuelve a preguntar. Si todas han
   * acabado, pregunta solo por la mas reciente, para seguir sabiendo si el servidor contesta; sin
   * ninguna apuntada no hay a quien preguntar ni nada que esperar (al volver a mirar, `start`).
   */
  private async refresh(watch: number): Promise<void> {
    const base = serverUrl();
    if (!base || watch !== this.watch) return;
    const asked = this.roomsToAsk();
    const answers = await Promise.all(asked.map(async ({ code }) => ({ code, result: await lobbyOf(base, code) })));
    for (const { code, result } of answers) this.looks.set(code, lookAfter(result, this.lookOf(code)));
    this.reach = answers.length > 0 ? reachOf(answers.map(({ result }) => result)) : null;
    if (watch !== this.watch) return;
    this.onChange?.();
    if (asked.length > 0) this.pollHandle = setTimeout(() => void this.refresh(watch), ROOMS_POLL_MS);
  }

  /** Las salas en marcha o, si todas han acabado, la mas reciente (la lista esta de la mas reciente a la mas vieja). */
  private roomsToAsk(): OnlineRoomEntry[] {
    const rooms = readOnlineRooms();
    const live = rooms.filter((entry) => !isSettled(this.lookOf(entry.code)));
    return live.length > 0 ? live : rooms.slice(0, 1);
  }
}
