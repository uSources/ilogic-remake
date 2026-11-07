/**
 * Lo que mira una pantalla de una partida en juego (la escena, la partida por texto): que equipos
 * juegan personas en ella, cuando se acaba la partida para ella y cuando se guarda sola. No es de la
 * sesion (ella solo lleva los turnos): son preguntas puras sobre la partida y sus controladores, asi
 * que una partida por la red o una repeticion, con otra pantalla, se preguntan lo mismo.
 */
import { startsTurn } from '../actions/turn';
import { gameModeOf } from '../modes';
import { fallOf } from '../rules/falls';
import { takesTurn } from '../rules/turnOrder';
import { matchResult } from '../rules/victory';
import { teamIds } from '../teams';
import type { GameState, MatchResult, TeamFall, TeamId } from '../model';
import type { Controller } from './controller';
import type { ActedStep } from './gameSession';

/** Lo que hace falta saber de una partida en juego: la partida y quien juega cada equipo (una `GameSession`). */
export interface SeatedMatch {
  readonly state: GameState;
  controllerOf(team: TeamId): Controller;
}

/**
 * Como se acaba la partida para la persona que mira (`screenEnd`): decidida, o fuera (ya no juega
 * ninguna persona) con su caida. (El final que se enseña, visto por ella, es el ScreenEnd de la escena.)
 */
export type PersonEnd = { kind: 'decided'; result: Exclude<MatchResult, { status: 'playing' }> } | { kind: 'out'; fall: TeamFall };

/** El equipo lo juega una persona en esta pantalla (la sesion la espera en su turno). */
export const isPerson = (match: SeatedMatch, team: TeamId): boolean => match.controllerOf(team).person === true;

/** Los equipos que juegan personas en esta pantalla. */
export const people = (match: SeatedMatch): TeamId[] => teamIds(match.state).filter((team) => isPerson(match, team));

/** Queda alguna persona de esta pantalla que sigue jugando. */
export const personStillPlays = (match: SeatedMatch): boolean => people(match).some((team) => takesTurn(match.state, team));

/**
 * Si la partida se ha acabado para quien mira en esta pantalla (`viewer`, una persona), y como: se
 * ha decidido (su resultado), o sigue pero ya no juega ninguna persona (todas han caido o se han
 * rendido y quedan otros equipos: nadie la miraria) y `viewer` esta fuera, con su caida. Lo miran la
 * escena y la partida por texto, asi acaban igual (K4). null: sigue.
 */
export function screenEnd(match: SeatedMatch, viewer: TeamId): PersonEnd | null {
  const result = matchResult(match.state);
  if (result.status !== 'playing') return { kind: 'decided', result };
  if (personStillPlays(match)) return null;
  const fall = fallOf(match.state, viewer);
  if (!fall) throw new Error(`El equipo ${viewer} mira la partida sin ninguna persona en juego, pero no ha caido`);
  return { kind: 'out', fall };
}

/**
 * Es el momento del guardado automatico: acaba de empezar el turno de una persona (con lo que pasa
 * solo al empezarlo ya hecho: asi, al cargar, nada se repite ni se pierde) y su modo lo marca.
 */
export const isAutosaveMoment = (match: SeatedMatch, step: ActedStep): boolean =>
  gameModeOf(match.state).saves && startsTurn(step) && isPerson(match, step.team);
