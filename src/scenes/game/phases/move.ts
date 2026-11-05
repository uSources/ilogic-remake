/** Fase 'move': la unidad elegida sigue al cursor con su camino; aceptar la suelta alli. */
import { posKey } from '../../../core/geom';
import { reachableTiles } from '../../../core/rules';

import { noHighlights, type PhaseHandler } from './phase';

export const movePhase: PhaseHandler = {
  accept: (host) => void host.moves.commit(host.view.cursor),
  back: (host) => host.toMap(),
  highlights: (input) => {
    const marks = noHighlights();
    if (!input.range) return marks;
    for (const tile of reachableTiles(input.range)) marks.tiles.set(posKey(tile), 'move');
    for (const tile of input.merge.keys()) marks.tiles.set(tile, 'merge');
    for (const tile of input.load.keys()) marks.tiles.set(tile, 'load');
    return marks;
  },
};
