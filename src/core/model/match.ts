import type { TeamId } from './team';

/**
 * El modo de juego de una partida: como se prepara, en que orden se juegan los turnos, cuando se
 * acaba y que hace la sesion al empezar cada turno (core/modes.ts, `GAME_MODES`). Lo guarda la
 * partida (`GameState.mode`), como sus reglas.
 * - skirmish: mapa al azar (o con codigo), gana la ultima alianza en pie o la de mas puntos al limite de dias;
 * - mission: una mision de la campaña, con su objetivo;
 * - sandbox: una partida preparada a mano (el laboratorio de animaciones): no se acaba sola.
 */
export type GameModeId = 'skirmish' | 'mission' | 'sandbox';

/**
 * Una forma de acabar la partida (rules/victory.ts, `VICTORY_RULES`). Cada modo dice las suyas, en
 * orden (`GAME_MODES`, core/modes.ts): la primera que decide, manda.
 * - lastAllianceStanding: solo queda en pie una alianza (o ninguna: empate);
 * - objective: el objetivo de la mision se cumple (gana su alianza) o falla (ganan sus enemigos);
 * - dayLimit: al acabar el ultimo dia gana la alianza con mas puntos (y si empatan, empate).
 */
export type VictoryRuleId = 'lastAllianceStanding' | 'objective' | 'dayLimit';

/**
 * Por que se ha acabado una partida: un equipo rival sin Base ('hq') o sin nada ('wipeout'), uno
 * que se ha rendido ('surrender'), el objetivo de la mision ('objective') o el limite de dias ('days').
 */
export type EndReason = 'hq' | 'wipeout' | 'surrender' | 'objective' | 'days';

/** Por que cae un equipo: se ha rendido, se ha quedado sin nada o sin su Base. */
export type DefeatReason = Extract<EndReason, 'surrender' | 'wipeout' | 'hq'>;

/**
 * Como va una partida, igual para todos: sigue ('playing'), se ha decidido ('decided': `winners`,
 * los equipos que ganan: una alianza entera, o, si el dueño de un objetivo de mision lo falla, todos
 * sus enemigos) o nadie gana ('draw': cayeron todos a la vez, o empate a puntos). Nada en ella es
 * "ganado" o "perdido" de un equipo concreto: eso lo mira quien lo enseña.
 */
export type MatchResult =
  | { status: 'playing'; winners: []; reason: null }
  | { status: 'decided'; winners: TeamId[]; reason: EndReason }
  | { status: 'draw'; winners: []; reason: EndReason };
