/**
 * Como empieza cada partida 3D: nueva (con su configuracion, del menu), la guardada, o una escaramuza
 * directa con `?seed=` en la direccion (para probar: mismo mapa siempre; `?elevation=0` quita lo que hace la altura).
 * Cada partida va en su propia carga de la pagina: el menu apunta lo que se ha elegido y recarga, y
 * salir al menu recarga sin nada. Asi no hay que deshacer a mano la escena 3D de la partida anterior.
 */
import { screenControllers } from '../../core/controllers';
import { createMatch, loadGame } from '../../core/defaultGames';
import { skirmishConfig, type MatchConfig } from '../../core/match';
import type { TeamId } from '../../core/model';
import { GameSession } from '../../core/session';
import { duel, playerTeam } from '../../core/teams';
import { readSave } from '../../storage';

export type GameStart = { start: 'new'; match: MatchConfig } | { start: 'load' };

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

/** La partida que toca en esta carga, si hay: la de `?seed=` o la que dejo apuntada el menu (se gasta). */
export function pendingStart(): GameStart | null {
  const address = new URLSearchParams(location.search);
  const seed = Number(address.get('seed'));
  if (Number.isInteger(seed) && seed > 0) {
    const settingChanges = { elevation: address.get('elevation') !== '0' };
    return { start: 'new', match: skirmishConfig({ seed, teams: duel('human', 'ai'), settingChanges }) };
  }
  const queued = sessionStorage.getItem(QUEUE_KEY);
  sessionStorage.removeItem(QUEUE_KEY);
  const parsed: unknown = queued ? JSON.parse(queued) : null;
  return isGameStart(parsed) ? parsed : null;
}

/** Lo apuntado tiene forma de partida (lo escribe `startGame` en esta misma pagina). */
function isGameStart(value: unknown): value is GameStart {
  if (typeof value !== 'object' || value === null || !('start' in value)) return false;
  return value.start === 'load' || (value.start === 'new' && 'match' in value && typeof value.match === 'object');
}

export interface StartedGame {
  session: GameSession;
  /** El equipo que juega la persona (el que mira). */
  viewer: TeamId;
}

/** La sesion de esa partida (null si es la guardada y no se puede leer). */
export function sessionFor(start: GameStart): StartedGame | null {
  const raw = start.start === 'load' ? readSave() : null;
  const state = start.start === 'new' ? createMatch(start.match) : raw ? loadGame(raw) : null;
  if (!state) return null;
  return { session: new GameSession(state, screenControllers(state)), viewer: playerTeam(state) };
}
