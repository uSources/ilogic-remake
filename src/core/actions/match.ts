/** Acciones de la partida entera, no de una unidad: rendirse. */
import { canBeLost, gameModeOf } from '../modes';
import { teamState } from '../teams';
import type { ActionRegistry } from './types';

export const MATCH_ACTIONS: Pick<ActionRegistry, 'surrender'> = {
  surrender: {
    // Basta con que lo pida un equipo que sigue jugando (ACTION_GUARDS), en su turno o no: desde ahi
    // cuenta como derrotado (isDefeated) y, si con eso solo queda una alianza, la partida acaba
    // (rules/victory.ts). Si era su turno, la sesion lo pasa.
    // Donde la partida no se puede perder (su modo no tiene forma de acabar: el laboratorio), rendirse
    // no acabaria nada: no vale ('cannotLose'; el menu ni lo ofrece).
    anyTime: true,
    validate: (s) => (canBeLost(gameModeOf(s)) ? null : 'cannotLose'),
    apply: (s, team) => {
      teamState(s, team).resigned = true;
      return [{ kind: 'surrender', actor: team }];
    },
  },
};
