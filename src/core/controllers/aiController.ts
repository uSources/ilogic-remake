/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La
 * IA solo propone sus acciones (`ActionPlan`): las manda la sesion, como las de cualquiera.
 */
import { aiTurn, defaultAiProfile, type AiProfile } from '../ai';
import type { Rng } from '../model';
import { proposing, type Controller } from '../session/controller';

/**
 * La IA que juega con `profile` (la del juego con el contenido de la partida, si no se dice: su
 * `defaultAiProfile`) y decide con su azar `rng`.
 */
export const aiController = (rng: Rng, profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (s, team) => proposing(aiTurn(s, team, profile ?? defaultAiProfile(s.content), rng)),
});
