/**
 * Los controladores de cada equipo segun quien lo juega (`TeamState.controller`): una persona en la
 * pantalla o la IA. Lo que no sea eso (repetir, al azar, quieto, por la red) lo elige quien empieza la
 * sesion (`controllersFor` con `overrides`).
 */
import type { ControllerKind, GameState, Rng, TeamId } from '../model';
import { playerTeam } from '../teams';
import { aiController } from './aiController';
import { humanController, type Controller } from '../session/controller';

/** El controlador de cada tipo de equipo (el tipo obliga a tener uno por `ControllerKind`). */
const CONTROLLER_FOR: { readonly [Kind in ControllerKind]: (rng: Rng) => Controller } = {
  human: () => humanController(),
  ai: (rng) => aiController(rng),
};

/**
 * El controlador de cada equipo de la partida: el de su `controller` (la IA decide con `rng`), o el
 * que se pida para ese equipo en `overrides`.
 */
export function controllersFor(s: GameState, rng: Rng, overrides: ReadonlyMap<TeamId, Controller> = new Map()): Controller[] {
  return s.teams.map((team) => overrides.get(team.id) ?? CONTROLLER_FOR[team.controller](rng));
}

/**
 * Los de una pantalla en la que juega una persona (la escena, `npm run play`): como controllersFor,
 * pero el equipo de la persona (`playerTeam`) lo juega ella aunque la partida diga 'ai' (una de IA
 * contra IA de las herramientas o del fuzz): asi siempre hay alguien mirando. `overrides` manda.
 */
export function screenControllers(s: GameState, rng: Rng, overrides: ReadonlyMap<TeamId, Controller> = new Map()): Controller[] {
  return controllersFor(s, rng, new Map([[playerTeam(s), humanController()], ...overrides]));
}
