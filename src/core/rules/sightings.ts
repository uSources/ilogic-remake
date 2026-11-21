/**
 * La memoria de cada equipo con la niebla (docs/PLAN-IA.md, fase 3): donde vio por ultima vez a cada
 * unidad enemiga (`TeamState.sightings`). Se pone al dia tras cada accion y cada ronda (invariante
 * 'sightings'): lo que ve ahora se apunta (o se mueve) y lo que recordaba en una casilla que ahora ve
 * vacia se olvida. Asi solo sabe lo que ha visto: una unidad que cae lejos de su vista sigue en su
 * memoria hasta que mire alli.
 */
import { areAllied } from '../teams';
import type { GameState, Pos, Sighting, TeamId, Unit } from '../model';
import { seesEverything, visibility } from './visibility';

/** Pone al dia la memoria de cada equipo con lo que ve ahora. */
export function rememberSightings(s: GameState): void {
  for (const team of s.teams) team.sightings = updatedSightings(s, team.id, team.sightings);
}

function updatedSightings(s: GameState, team: TeamId, before: readonly Sighting[]): Sighting[] {
  // Sin niebla lo ve todo: no hay nada que recordar.
  if (seesEverything(s, team)) return [];
  const sees = visibility(s, team);
  const isInView = (pos: Pos) => sees.contains(pos) && sees.at(pos);
  const inView = s.units.filter((unit) => unit.carrier === null && !areAllied(s, unit.team, team) && isInView(unit));
  const seenUids = new Set(inView.map((unit) => unit.uid));
  // Lo que recordaba y no ve ahora se queda mientras su casilla siga fuera de la vista (si la ve, ya sabe que no esta).
  const kept = before.filter((sighting) => !seenUids.has(sighting.uid) && !isInView(sighting));
  return [...kept, ...inView.map((unit) => sightingOf(s, unit))];
}

const sightingOf = (s: GameState, unit: Unit): Sighting => ({
  uid: unit.uid,
  type: unit.type,
  team: unit.team,
  x: unit.x,
  y: unit.y,
  life: unit.life,
  day: s.day,
});
