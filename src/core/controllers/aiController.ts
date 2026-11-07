/**
 * El controlador que decide con la IA del juego (`aiController`: la IA rival, o la de referencia de
 * la arena). La IA aun manda ella sus acciones (fase 6: solo las propondra), por el dispatcher que
 * apunta de session/selfDispatched.ts: solo las de su equipo y nunca los limites de turno.
 */
import { aiTurn } from '../ai';
import type { ActionDispatcher, GameEvent, GameState, Rng, TeamId } from '../model';
import type { Controller } from '../session/controller';
import { selfDispatched } from '../session/selfDispatched';

/** Una IA: el turno de un equipo, mandando sus acciones por `dispatcher` (la de `aiTurn` o la de referencia de la arena). */
export type AiBrain = (s: GameState, rng: Rng, team: TeamId, dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>;

/** La IA del juego (o otra con la misma forma, `brain`), que decide con su azar `rng`. */
export const aiController = (rng: Rng, brain: AiBrain = aiTurn): Controller => ({
  name: 'ai',
  playTurn: (s, team) => selfDispatched(team, (dispatcher) => brain(s, rng, team, dispatcher)),
});
