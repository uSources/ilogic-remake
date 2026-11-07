/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La
 * IA solo propone sus acciones (`ActionPlan`): las manda la sesion, como las de cualquiera. Decide con
 * lo que sabe su equipo (la `PlayerView` que le da la sesion, que la pone al dia tras cada accion).
 */
import { aiTurn, defaultAiProfile, type AiProfile } from '../ai';
import { seededRng } from '../util/random';
import { proposing, type Controller } from '../session/controller';

/**
 * La IA que juega con `profile` (la del juego con el contenido de la partida, si no se dice: su
 * `defaultAiProfile`). Su azar de cada turno sale de la partida (el de su vista, `turnSeed`): la misma partida da
 * las mismas decisiones, se juegue donde se juegue.
 */
export const aiController = (profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (view) => {
    const rng = seededRng(view.turnSeed);
    return proposing(aiTurn(view, profile ?? defaultAiProfile(view.state.content), rng));
  },
});
