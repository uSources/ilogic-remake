/** Acciones de la partida entera, no de una unidad: rendirse. */
import { teamState } from '../teams';
import type { ActionRegistry } from './types';

export const MATCH_ACTIONS: Pick<ActionRegistry, 'surrender'> = {
  surrender: {
    // Basta con que lo pida un equipo que sigue jugando (ACTION_GUARDS): desde ahi cuenta como
    // derrotado (isDefeated) y, si con eso solo queda una alianza, la partida acaba (rules/victory.ts).
    validate: () => null,
    apply: (s, team) => {
      teamState(s, team).resigned = true;
      return [{ kind: 'surrender', actor: team }];
    },
  },
};
