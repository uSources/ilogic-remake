/**
 * El controlador que decide con una IA (`aiController`: la IA rival con su perfil, `AiProfile`). La
 * IA solo propone sus acciones (`ActionPlan`): las manda la sesion, como las de cualquiera. Decide con
 * lo que sabe su equipo (la `PlayerView` que le da la sesion, que la pone al dia tras cada accion).
 */
import { aiProfileFor, type AiProfile } from '../ai';
import { decisionRngOf } from '../playerView';
import { proposing, type Controller } from '../session/controller';

/**
 * La IA que juega con `profile` (si no se dice, la del juego con la personalidad y la dificultad de su
 * equipo: `aiProfileFor`). Su azar de cada turno sale de la partida (el de su vista, `decisionRngOf`): la misma partida da
 * las mismas decisiones, se juegue donde se juegue.
 */
export const aiController = (profile?: AiProfile): Controller => ({
  name: 'ai',
  playTurn: (view) => {
    const played = profile ?? aiProfileFor(view.state, view.team);
    return proposing(played.turn(view, played, decisionRngOf(view)));
  },
});
