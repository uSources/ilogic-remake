/**
 * Con que partida empieza la escena (GameStartData): una nueva (de su configuracion: createMatch),
 * la guardada, una preparada desde fuera o el laboratorio. Cada una trae sus reglas en `state.rules`
 * y su modo en `state.mode`. Sin Phaser.
 */
import { duel, playerTeam, teamIds, teamState } from '../../core/teams';
import { humanController, passiveController, type Controller } from '../../core/session';
import { createMatch, loadGame } from '../../core/defaultGames';
import { skirmishConfig, type MatchConfig } from '../../core/match';
import type { GameState, TeamId } from '../../core/model';
import { defaultLab, labMatch, type LabOptions } from '../../lab';
import { randomSeed } from '../../setup';
import { deleteSave, readSave } from '../../storage';
import type { GameStartData } from './types';

export interface MatchStart {
  state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira: niebla, colores, mandos). */
  viewer: TeamId;
  /**
   * Quien juega los equipos que no van por su `controller`: el que mira lo juega la persona (aunque
   * la partida diga 'ai': una de IA contra IA de las herramientas) y, en el laboratorio, el otro no
   * hace nada.
   */
  controllers: ReadonlyMap<TeamId, Controller>;
  /** Laboratorio de animaciones (null en una partida normal). */
  lab: LabOptions | null;
  /** Viene del guardado (al terminarla se borra). */
  fromSave: boolean;
  /** Se pidio una partida guardada o preparada que no se ha podido leer (y se ha borrado). */
  corruptSave: boolean;
}

/** Una escaramuza nueva al azar, una persona contra la IA (sin datos, o si no se ha podido abrir la pedida). */
const randomSkirmish = (): MatchConfig => skirmishConfig({ seed: randomSeed(), teams: duel('human', 'ai') });

export function startMatch(data: GameStartData = { start: 'new', match: randomSkirmish() }): MatchStart {
  const lab = data.start === 'lab' ? (data.lab ?? defaultLab()) : null;
  const saved = data.start === 'load' ? readSavedGame() : null;
  const given = data.start === 'state' ? loadGame(data.state) : null;
  const loaded = saved ?? given;
  const corruptSave = (data.start === 'load' || data.start === 'state') && !loaded;
  // Solo se borra el guardado si lo que no se ha podido abrir era el guardado (no una partida de depuracion).
  if (corruptSave && data.start === 'load') deleteSave();
  const state = lab ? createMatch(labMatch(lab, lab.play)) : (loaded ?? createMatch(newMatchConfig(data)));
  const viewer = viewerOf(state);
  return { state, viewer, controllers: controllersOf(state, viewer, !!lab), lab, fromSave: !!saved, corruptSave };
}

/** La persona juega el equipo que mira; en el laboratorio, los demas se quedan quietos (solo se mira). */
function controllersOf(state: GameState, viewer: TeamId, isLab: boolean): Map<TeamId, Controller> {
  const quiet = isLab ? teamIds(state).filter((team) => team !== viewer) : [];
  return new Map([[viewer, humanController()], ...quiet.map((team) => [team, passiveController()] as const)]);
}

/** La configuracion de la partida nueva que se pide (o una al azar si no se pedia una nueva o no se pudo abrir la pedida). */
const newMatchConfig = (data: GameStartData): MatchConfig => (data.start === 'new' ? data.match : randomSkirmish());

/**
 * El equipo que mira la pantalla al abrir la partida: la persona a la que le toca (con varias en la
 * misma pantalla, cada una mira en su turno: TurnFlow cambia de una a otra) o, si le toca a la IA, la
 * primera persona. Una sin personas (IA contra IA, de las herramientas) se mira desde el primer
 * equipo, y ese equipo lo juega la persona en esta pantalla aunque guarde `controller: 'ai'` (las
 * reglas no miran el controller; los demas siguen siendo de la IA).
 */
export function viewerOf(state: GameState): TeamId {
  return teamState(state, state.turn).controller === 'human' ? state.turn : playerTeam(state);
}

function readSavedGame(): GameState | null {
  const raw = readSave();
  return raw ? loadGame(raw) : null;
}
