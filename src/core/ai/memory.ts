/**
 * Los enemigos que la IA tiene en la cabeza (docs/PLAN-IA.md, fase 3): los que ve y los que recuerda
 * de su memoria con la niebla (`TeamState.sightings`, rules/sightings.ts), donde los vio por ultima
 * vez. Un recuerdo de hoy pesa 1, uno de ayer menos, y uno de hace mas de `memoryDays` dias ya no
 * cuenta (`memoryDays` 0: sin memoria).
 */
import { teamState } from '../teams';
import { mapGrid } from '../mapGrid';
import { knownFoes } from '../playerView';
import type { GameState, Sighting, TeamId, Unit } from '../model';

/** Un enemigo en la cabeza: el que ve (peso 1) o uno recordado (menos, cuanto mas viejo). */
export interface FoeInMind {
  unit: Unit;
  weight: number;
}

/** Una unidad como la recuerda (donde y como estaba al verla). */
const recalled = (sighting: Sighting): Unit => ({
  uid: sighting.uid,
  type: sighting.type,
  team: sighting.team,
  x: sighting.x,
  y: sighting.y,
  life: sighting.life,
  turnState: 'ready',
  carrier: null,
  cargo: [],
});

/** Los enemigos que ve y los que recuerda de hace `memoryDays` dias o menos (con 0, solo los que ve). */
export function foesInMind(s: GameState, team: TeamId, memoryDays: number): FoeInMind[] {
  const seen = knownFoes(s, team).map((unit) => ({ unit, weight: 1 }));
  if (memoryDays <= 0) return seen;
  const seenUids = new Set(seen.map((foe) => foe.unit.uid));
  const grid = mapGrid(s);
  const remembered = teamState(s, team)
    .sightings.filter((sighting) => !seenUids.has(sighting.uid) && grid.contains(sighting))
    .map((sighting) => ({ unit: recalled(sighting), weight: 1 - (s.day - sighting.day) / (memoryDays + 1) }))
    .filter((foe) => foe.weight > 0);
  return [...seen, ...remembered];
}
