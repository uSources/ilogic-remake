/**
 * Los equipos de una partida (GameState.teams): quien es quien, de quien es enemigo cada uno y lo que
 * tiene cada uno. Ningun numero de equipo es especial: el que juega una persona lo dice su
 * `controller`, y los enemigos, su `alliance`. Asi una partida puede tener 2, 3 o 4 equipos, con
 * alianzas o todos contra todos, sin tocar las reglas.
 */
import type { ControllerKind, GameState, TeamId, TeamState, TeamStats } from './model';

/** El estado de un equipo de la partida. Un numero que no es de ningun equipo es un fallo de quien lo pide. */
export function teamState(s: GameState, team: TeamId): TeamState {
  const found = s.teams[team];
  if (!found) throw new Error(`El equipo ${team} no esta en la partida (hay ${s.teams.length})`);
  return found;
}

/** Los numeros de todos los equipos, en orden. */
export const teamIds = (s: GameState): TeamId[] => s.teams.map((team) => team.id);

/** Son de la misma alianza (un equipo es aliado de si mismo): ni se atacan ni se capturan. */
export function areAllied(s: GameState, first: TeamId, second: TeamId): boolean {
  return teamState(s, first).alliance === teamState(s, second).alliance;
}

/** Son de alianzas distintas: se pueden atacar y capturar lo del otro. */
export function isHostile(s: GameState, first: TeamId, second: TeamId): boolean {
  return !areAllied(s, first, second);
}

/** El dueño de algo (un edificio, un punto de control) es de la alianza de `team`. Sin dueño, no. */
export const isAlliedOwner = (s: GameState, owner: TeamId | null, team: TeamId): boolean => owner !== null && areAllied(s, owner, team);

/** El dueño de algo es enemigo de `team`. Sin dueño, no. */
export const isHostileOwner = (s: GameState, owner: TeamId | null, team: TeamId): boolean => owner !== null && isHostile(s, owner, team);

/** Los equipos enemigos de `team`, en orden. */
export const enemiesOf = (s: GameState, team: TeamId): TeamId[] => teamIds(s).filter((other) => isHostile(s, team, other));

/** Los equipos de su alianza, el incluido, en orden. */
export const alliesOf = (s: GameState, team: TeamId): TeamId[] => teamIds(s).filter((other) => areAllied(s, team, other));

/**
 * Todos los controladores (el tipo `ControllerKind` esta en model/, que solo tiene tipos). Es un
 * registro por clave para que un controlador nuevo no compile hasta estar aqui.
 */
const CONTROLLERS: Readonly<Record<ControllerKind, true>> = { human: true, ai: true };
export const CONTROLLER_KINDS = Object.keys(CONTROLLERS) as readonly ControllerKind[];

/** Es uno de los controladores que hay (para lo que viene de fuera: partidas guardadas). */
export const isControllerKind = (value: unknown): value is ControllerKind => (CONTROLLER_KINDS as readonly unknown[]).includes(value);

/** Los equipos que lleva ese tipo de controlador (p. ej. los que juega una persona), en orden. */
export const teamsControlledBy = (s: GameState, controller: ControllerKind): TeamId[] =>
  s.teams.filter((team) => team.controller === controller).map((team) => team.id);

/** El equipo lo lleva la IA del juego (los demas de una pantalla tienen que serlo: ver isPlayableOnOneScreen). */
export const isAiControlled = (s: GameState, team: TeamId): boolean => teamState(s, team).controller === 'ai';

/**
 * Por que el turno de `team` no lo puede jugar la IA (null si es de la IA): hasta la fase 4, en una
 * pantalla juega una sola persona y los demas equipos tienen que ser de la IA. Lo usan la escena y
 * `npm run play`, cada uno con su tipo de error.
 */
export function notAiControlledReason(s: GameState, team: TeamId): string | null {
  if (isAiControlled(s, team)) return null;
  return `El equipo ${team} lo juega '${teamState(s, team).controller}': aqui solo juega una persona`;
}

/**
 * Se puede jugar en una sola pantalla: como mucho un equipo de personas (el que mira; los demas los
 * lleva la IA). Varias personas en la misma partida (por turnos o en red) es la fase 4: hasta
 * entonces, ni el menu ofrece continuar una asi ni la escena la abre.
 */
export const isPlayableOnOneScreen = (s: GameState): boolean => teamsControlledBy(s, 'human').length <= 1;

/**
 * El equipo de la persona: el primero que lleva una persona. Es el que mira la pantalla (niebla,
 * colores, mandos) y el de las tarjetas de la partida guardada. Si todos son de la IA (el fondo del
 * menu, la herramienta de equilibrio) no hay persona: se mira desde el primer equipo de la lista.
 */
export function playerTeam(s: GameState): TeamId {
  const firstPerson = teamsControlledBy(s, 'human')[0];
  return firstPerson ?? s.teams[0]!.id;
}

/** Cuantas alianzas distintas hay entre estos equipos (una partida necesita al menos dos: si no, nadie es enemigo de nadie). */
export const allianceCount = (teams: readonly Pick<TeamState, 'alliance'>[]): number => new Set(teams.map((team) => team.alliance)).size;

/** El valor de `team` en una lista por equipo (un informe de la ronda...). Si no esta, es un fallo de quien lo pide. */
export function teamValue<T>(perTeamList: readonly T[], team: TeamId): T {
  const value = perTeamList[team];
  if (value === undefined) throw new Error(`La lista por equipo no tiene el equipo ${team} (tiene ${perTeamList.length})`);
  return value;
}

/** Una lista con un valor por equipo, en orden (informes de la ronda, puntos de control...). */
export const perTeam = <T>(s: GameState, valueFor: (team: TeamId) => T): T[] => teamIds(s).map(valueFor);

/** Lo que se elige de cada equipo al empezar una partida. */
export interface TeamSetup {
  controller: ControllerKind;
  /** Su alianza (si no, una propia: es enemigo de todos los demas). */
  alliance?: number;
  /** Dinero al empezar (si no, la regla initialFunds). */
  funds?: number;
}

/** Dos equipos enemigos: el primero lo juega `first` y el segundo, `second` (una partida normal es humano contra IA). */
export const duel = (first: ControllerKind, second: ControllerKind): TeamSetup[] => [{ controller: first }, { controller: second }];

/** Los dos equipos de una partida de dos (la de `duel`): el primero y el segundo. Con otro numero de equipos, falla. */
export function duelTeams(s: GameState): [first: TeamId, second: TeamId] {
  const [first, second, ...more] = teamIds(s);
  if (first === undefined || second === undefined || more.length)
    throw new Error(`Se esperaba una partida de dos equipos (hay ${s.teams.length})`);
  return [first, second];
}

export const emptyTeamStats = (): TeamStats => ({ built: 0, spent: 0, lost: 0, captured: 0, army: [] });

/** Los equipos de una partida nueva, sin general (se elige despues: generals.ts). */
export function newTeams(setups: readonly TeamSetup[], initialFunds: number): TeamState[] {
  if (setups.length < 2) throw new Error('Una partida necesita al menos dos equipos');
  const teams = setups.map((setup, id) => ({
    id,
    alliance: setup.alliance ?? id,
    controller: setup.controller,
    funds: setup.funds ?? initialFunds,
    general: null,
    stats: emptyTeamStats(),
  }));
  if (allianceCount(teams) < 2) throw new Error('Una partida necesita al menos dos alianzas: si no, nadie es enemigo de nadie');
  return teams;
}
