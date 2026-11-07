/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La
 * IA solo propone sus acciones (`ActionPlan`): las manda la sesion, como las de cualquiera. Decide con
 * lo que sabe su equipo (la `PlayerView` que le da la sesion, al dia tras cada accion: `seeing`).
 */
import { aiTurn, defaultAiProfile, type AiProfile } from '../ai';
import { decisionRng } from '../dice';
import { proposing, type Controller } from '../session/controller';
import { seeing } from '../playerView';

/**
 * La IA que juega con `profile` (la del juego con el contenido de la partida, si no se dice: su
 * `defaultAiProfile`). Su azar de cada turno sale de la partida (`decisionRng`): la misma partida da
 * las mismas decisiones, se juegue donde se juegue.
 */
export const aiController = (profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (view) => {
    const rng = decisionRng(view.state, view.team);
    return proposing(seeing(view, aiTurn(view, profile ?? defaultAiProfile(view.state.content), rng)));
  },
});
