/**
 * Con que partida empieza la escena (GameStartData): una nueva (de su configuracion: createMatch),
 * la guardada, una preparada desde fuera o el laboratorio. Cada una trae sus reglas en `state.settings`
 * y su modo en `state.mode`. Sin Phaser.
 */
import { duel, playerTeam, teamIds } from '../../core/teams';
import { screenControllers } from '../../core/controllers';
import { GameSession, passiveController, type Controller } from '../../core/session';
import { createMatch, loadGame } from '../../core/defaultGames';
import { skirmishConfig, type MatchConfig } from '../../core/match';
import type { GameState, Rng, TeamId } from '../../core/model';
import { defaultLab, labMatch, type LabOptions } from '../../lab';
import { randomSeed } from '../../setup';
import { deleteSave, readSave } from '../../storage';
import type { GameStartData } from './types';

export interface MatchStart {
  /** La partida en juego, con quien juega cada equipo (ver `sceneControllers`). */
  session: GameSession;
  /** El equipo que juega la persona en esta pantalla (el que mira: niebla, colores, mandos). */
  viewer: TeamId;
  /** Laboratorio de animaciones (null en una partida normal). */
  lab: LabOptions | null;
  /** Viene del guardado (al terminarla se borra). */
  fromSave: boolean;
  /** Se pidio una partida guardada o preparada que no se ha podido leer (y se ha borrado). */
  corruptSave: boolean;
}

/** Una escaramuza nueva al azar, una persona contra la IA (sin datos, o si no se ha podido abrir la pedida). */
const randomSkirmish = (): MatchConfig => skirmishConfig({ seed: randomSeed(), teams: duel('human', 'ai') });

/** La partida con la que empieza la escena, en juego; la IA decide con `aiRng`. */
export function startMatch(aiRng: Rng, data: GameStartData = { start: 'new', match: randomSkirmish() }): MatchStart {
  const lab = data.start === 'lab' ? (data.lab ?? defaultLab()) : null;
  const saved = data.start === 'load' ? readSavedGame() : null;
  const given = data.start === 'state' ? loadGame(data.state) : null;
  const loaded = saved ?? given;
  const corruptSave = (data.start === 'load' || data.start === 'state') && !loaded;
  // Solo se borra el guardado si lo que no se ha podido abrir era el guardado (no una partida de depuracion).
  if (corruptSave && data.start === 'load') deleteSave();
  const state = lab ? createMatch(labMatch(lab, lab.play)) : (loaded ?? createMatch(newMatchConfig(data)));
  const session = new GameSession(state, screenControllers(state, aiRng, labControllers(state, !!lab)));
  return { session, viewer: viewerOf(session), lab, fromSave: !!saved, corruptSave };
}

/**
 * En el laboratorio, los equipos que no son el de la persona no hacen nada (solo se mira). Que la
 * persona juegue el suyo aunque la partida diga 'ai' lo pone screenControllers (core/controllers).
 */
export function labControllers(state: GameState, isLab: boolean): Map<TeamId, Controller> {
  const person = playerTeam(state);
  const quiet = isLab ? teamIds(state).filter((team) => team !== person) : [];
  return new Map(quiet.map((team) => [team, passiveController()] as const));
}

/** La configuracion de la partida nueva que se pide (o una al azar si no se pedia una nueva o no se pudo abrir la pedida). */
const newMatchConfig = (data: GameStartData): MatchConfig => (data.start === 'new' ? data.match : randomSkirmish());

/**
 * El equipo que mira la pantalla al abrir la partida: la persona a la que le toca (con varias en la
 * misma pantalla, cada una mira en su turno: TurnFlow cambia de una a otra) o, si le toca a otro, la
 * primera persona (`GameSession.isPerson`, lo mismo que mira la escena despues). Una sin personas
 * (IA contra IA, de las herramientas) la juega desde el primer equipo la persona de esta pantalla
 * (`screenControllers`).
 */
export function viewerOf(session: GameSession): TeamId {
  const { state } = session;
  if (session.isPerson(state.turn)) return state.turn;
  const person = teamIds(state).find((team) => session.isPerson(team));
  if (person === undefined) throw new Error('La partida de la escena no tiene ninguna persona (ver sceneControllers)');
  return person;
}

function readSavedGame(): GameState | null {
  const raw = readSave();
  return raw ? loadGame(raw) : null;
}
