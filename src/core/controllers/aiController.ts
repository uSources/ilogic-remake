/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La IA aun manda ella sus acciones (fase 6: solo las propondra), por el dispatcher que
 * apunta de session/selfDispatched.ts: solo las de su equipo y nunca los limites de turno.
 */
import { aiTurn, defaultAiProfile, type AiProfile } from '../ai';
import type { Rng } from '../model';
import type { Controller } from '../session/controller';
import { selfDispatched } from '../session/selfDispatched';

/**
 * La IA que juega con `profile` (la del juego con el contenido de la partida, si no se dice: su
 * `defaultAiProfile`) y decide con su azar `rng`.
 */
export const aiController = (rng: Rng, profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (s, team) => selfDispatched(team, (dispatcher) => aiTurn(s, team, profile ?? defaultAiProfile(s.content), rng, dispatcher)),
});
