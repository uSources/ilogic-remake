/** Fase 'move': la unidad elegida sigue al cursor con su camino; aceptar la suelta alli. */
import { reachableTiles } from '../../../core/rules';
import { key } from '../types';
import { noHighlights, type PhaseHandler } from './phase';

export const movePhase: PhaseHandler = {
  accept: (h) => void h.moves.commit(h.view.cursor),
  back: (h) => h.toMap(),
  highlights: (input) => {
    const marks = noHighlights();
    if (!input.range) return marks;
    for (const tile of reachableTiles(input.range)) marks.tiles.set(key(tile), 'move');
    for (const tile of input.merge.keys()) marks.tiles.set(tile, 'merge');
    for (const tile of input.load.keys()) marks.tiles.set(tile, 'load');
    return marks;
  },
};
