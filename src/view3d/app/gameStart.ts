/**
 * Como empieza cada partida 3D: nueva (con su configuracion, del menu), la guardada, una por la red
 * (la sala que ya juega, con su codigo y la ficha del asiento) o una escaramuza directa con `?seed=`
 * en la direccion (para probar: mismo mapa siempre; `?elevation=0` quita lo que hace la altura).
 * Cada partida va en su propia carga de la pagina: el menu apunta lo que se ha elegido y recarga, y
 * salir al menu recarga sin nada. Asi no hay que deshacer a mano la escena 3D de la partida anterior.
 * La de la red sigue apuntada mientras dura: recargar vuelve a entrar en la sala.
 */
import { screenControllers } from '../../core/controllers';
import { createMatch, loadGame } from '../../core/defaultGames';
import { cloneState } from '../../core/gameContent';
import { skirmishConfig, type MatchConfig } from '../../core/match';
import type { TeamId } from '../../core/model';
import { GameSession } from '../../core/session';
import { duel, playerTeam } from '../../core/teams';
import { closeText } from '../../menu/online/shared';
import { mirrorSession } from '../../net/mirrorSession';
import { OnlineMatch } from '../../net/onlineMatch';
import { serverUrl } from '../../net/serverUrl';
import { t } from '../../settings';
import { readSave } from '../../storage';

export type GameStart = { start: 'new'; match: MatchConfig } | { start: 'load' } | { start: 'online'; code: string; token: string };

/** Donde se apunta la partida que empieza tras recargar (solo dura esa carga). */
const QUEUE_KEY = 'ilogic3d.start';

/** Empieza esa partida (recargando la pagina). */
export function startGame(start: GameStart): void {
  sessionStorage.setItem(QUEUE_KEY, JSON.stringify(start));
  location.assign(location.pathname);
}

/** Vuelve al menu principal (recargando la pagina sin partida). */
export function backToMenu(): void {
  sessionStorage.removeItem(QUEUE_KEY);
  location.assign(location.pathname);
}

/** La partida que toca en esta carga, si hay: la de `?seed=` o la que dejo apuntada el menu (se gasta, salvo la de la red). */
export function pendingStart(): GameStart | null {
  const address = new URLSearchParams(location.search);
  const seed = Number(address.get('seed'));
  if (Number.isInteger(seed) && seed > 0) {
    const settingChanges = { elevation: address.get('elevation') !== '0' };
    return { start: 'new', match: skirmishConfig({ seed, teams: duel('human', 'ai'), settingChanges }) };
  }
  const queued = sessionStorage.getItem(QUEUE_KEY);
  const parsed: unknown = queued ? JSON.parse(queued) : null;
  const start = isGameStart(parsed) ? parsed : null;
  if (start?.start !== 'online') sessionStorage.removeItem(QUEUE_KEY);
  return start;
}

/** Lo apuntado tiene forma de partida (lo escribe `startGame` en esta misma pagina). */
function isGameStart(value: unknown): value is GameStart {
  if (typeof value !== 'object' || value === null || !('start' in value)) return false;
  if (value.start === 'online')
    return 'code' in value && typeof value.code === 'string' && 'token' in value && typeof value.token === 'string';
  return value.start === 'load' || (value.start === 'new' && 'match' in value && typeof value.match === 'object');
}

export interface StartedGame {
  session: GameSession;
  /** El equipo que juega la persona (el que mira). */
  viewer: TeamId;
  /** La conexion con la sala, en una partida por la red (null en una de esta pantalla). */
  room: OnlineMatch | null;
}

/** La partida que empieza, o el aviso que dar en el menu si no se ha podido (la guardada no se lee, la sala no deja entrar). */
export type OpenedGame = { ok: true; game: StartedGame } | { ok: false; notice: string | null };

/** Abre esa partida: la de esta pantalla al momento; la de la red, cuando la sala la manda. */
export async function openGame(start: GameStart): Promise<OpenedGame> {
  if (start.start === 'online') return joinMatch(start.code, start.token);
  const game = localGame(start);
  return game ? { ok: true, game } : { ok: false, notice: null };
}

/** La sesion de esa partida de esta pantalla (null si es la guardada y no se puede leer). */
function localGame(start: Exclude<GameStart, { start: 'online' }>): StartedGame | null {
  const raw = start.start === 'load' ? readSave() : null;
  const state = start.start === 'new' ? createMatch(start.match) : raw ? loadGame(raw) : null;
  if (!state) return null;
  return { session: new GameSession(state, screenControllers(state)), viewer: playerTeam(state), room: null };
}

/**
 * Vuelve a entrar en la sala (en la carga de antes la dejo el vestibulo al empezar a jugar) y espera
 * su vista y a quien se espera: la pantalla juega su copia, en una sesion espejo. Si no se puede, la
 * partida ya no queda apuntada.
 */
async function joinMatch(code: string, token: string): Promise<OpenedGame> {
  const base = serverUrl();
  if (!base) return leaveOnline(t('onlineUnavailable'));
  const room = new OnlineMatch(base, code, token);
  const refused = await room.inPlay();
  const { state, team } = room.client;
  if (refused || !state || team === null) {
    room.close();
    return leaveOnline(closeText(refused ?? 'other'));
  }
  return { ok: true, game: { session: mirrorSession(cloneState(state), team), viewer: team, room } };
}

function leaveOnline(notice: string): OpenedGame {
  sessionStorage.removeItem(QUEUE_KEY);
  return { ok: false, notice };
}
