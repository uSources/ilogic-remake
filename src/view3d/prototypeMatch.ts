/**
 * La partida del prototipo 3D: una escaramuza normal (el mismo generador de mapas, las mismas reglas
 * y la misma IA que el juego), una persona contra la IA. La semilla del mapa se puede elegir con
 * `?seed=` en la direccion, para comparar el mismo mapa en 2D y en 3D.
 */
import { screenControllers } from '../core/controllers';
import { createMatch } from '../core/defaultGames';
import { skirmishConfig } from '../core/match';
import type { TeamId } from '../core/model';
import { GameSession } from '../core/session';
import { duel, playerTeam } from '../core/teams';

/** Semilla de partida si no se pide otra: siempre el mismo mapa, para comparar cambios de aspecto. */
const DEFAULT_SEED = 2013;

export interface PrototypeStart {
  session: GameSession;
  /** El equipo que juega la persona (el que mira). */
  viewer: TeamId;
}

/** La semilla de `?seed=` (si es un numero entero) o la de siempre. */
function seedFromAddress(): number {
  const asked = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isInteger(asked) && asked > 0 ? asked : DEFAULT_SEED;
}

/** La escaramuza del prototipo en juego: la persona contra la IA. */
export function startPrototype(): PrototypeStart {
  const state = createMatch(skirmishConfig({ seed: seedFromAddress(), teams: duel('human', 'ai') }));
  const session = new GameSession(state, screenControllers(state));
  return { session, viewer: playerTeam(state) };
}
