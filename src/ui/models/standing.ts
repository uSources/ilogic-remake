import { buildingTypeOf } from '../../core/gameContent';
import { buildingIncome, teamUnits } from '../../core/rules';
import { isAlliedOwner } from '../../core/teams';
import type { GameState, TeamId } from '../../core/model';
import type { StandingVM } from '../../hud/store';
import { bySide } from './end';

/**
 * «Cómo va» la partida (la pausa): lo de la alianza de quien mira contra lo de sus enemigos juntos.
 * Solo lo que se sabe: los edificios y de quien son son publicos (y lo que pagan, de ahi), pero con
 * niebla no se sabe cuantas unidades tienen los enemigos (las que se ven no son todas).
 */
export function standingVM(s: GameState, viewer: TeamId): StandingVM {
  const units = bySide(s, viewer, (team) => teamUnits(s, team).length);
  return {
    units: [units[0], s.settings.fog ? null : units[1]],
    buildings: bySide(s, viewer, (team) => ownedBuildings(s, team).length),
    income: bySide(s, viewer, (team) => buildingsIncome(s, team)),
  };
}

/** Los edificios de la alianza de quien mira y cuantos hay en el mapa (neutrales incluidos). */
export function buildingShare(s: GameState, viewer: TeamId): { own: number; total: number } {
  const own = s.buildings.filter((building) => isAlliedOwner(s, building.owner, viewer)).length;
  return { own, total: s.buildings.length };
}

const ownedBuildings = (s: GameState, team: TeamId) => s.buildings.filter((building) => building.owner === team);

/** Lo que pagan cada dia los edificios del equipo (sin el mantenimiento, que depende de sus unidades). */
const buildingsIncome = (s: GameState, team: TeamId): number =>
  ownedBuildings(s, team).reduce((total, building) => total + buildingIncome(s, buildingTypeOf(s, building)), 0);
