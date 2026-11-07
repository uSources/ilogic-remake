/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La
 * IA solo propone sus acciones (`ActionPlan`): las manda la sesion, como las de cualquiera. Decide con
 * lo que sabe su equipo (la `PlayerView` que le da la sesion, que la pone al dia tras cada accion).
 */
import { defaultAiProfile, type AiProfile } from '../ai';
import { decisionRngOf } from '../playerView';
import { proposing, type Controller } from '../session/controller';

/**
 * La IA que juega con `profile` (la del juego con el contenido de la partida, si no se dice: su
 * `defaultAiProfile`). Su azar de cada turno sale de la partida (el de su vista, `decisionRngOf`): la misma partida da
 * las mismas decisiones, se juegue donde se juegue.
 */
export const aiController = (profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (view) => {
    const played = profile ?? defaultAiProfile(view.state.content);
    return proposing(played.turn(view, played, decisionRngOf(view)));
  },
});
