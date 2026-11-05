/**
 * Con que partida empieza la escena (GameStartData): la guardada, una preparada desde fuera, el
 * laboratorio, una mision o un mapa nuevo. Cada una lleva sus reglas en `state.rules`. Sin Phaser.
 */
import { appointGeneral } from '../../core/generals';
import { duel, playerTeam, teamIds, teamsControlledBy } from '../../core/teams';
import { seededRng } from '../../core/geom';
import { defaultContent } from '../../core/content/default';
import { createGame, loadGame } from '../../core/defaultGames';
import { buildMission, missionById } from '../../core/missions';
import type { GameSetup, GameState, TeamId } from '../../core/model';
import { ensureWeather } from '../../core/weather';
import { defaultLab, labState, type LabOptions } from '../../lab';
import { randomSeed } from '../../setup';
import { deleteSave, readSave } from '../../storage';
import type { GameStartData } from './types';

export interface MatchStart {
  state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira: niebla, colores, mandos). */
  viewer: TeamId;
  /** Laboratorio de animaciones (null en una partida normal). */
  lab: LabOptions | null;
  /** Viene del guardado (al terminarla se borra). */
  fromSave: boolean;
  /** Se pidio una partida guardada o preparada que no se ha podido leer (y se ha borrado). */
  corruptSave: boolean;
}

/** Tamaño del mapa al azar si no se dice otro. */
const DEFAULT_MAP_SIZE = 32;

export function startMatch(data: GameStartData): MatchStart {
  const lab = data.mode === 'lab' ? (data.lab ?? defaultLab()) : null;
  const saved = playableHere(data.mode === 'load' ? readSavedGame() : null);
  const given = playableHere(data.mode === 'state' && data.state ? loadGame(data.state) : null);
  const loaded = saved ?? given;
  const corruptSave = (data.mode === 'load' || data.mode === 'state') && !loaded;
  if (corruptSave) deleteSave();
  const state = lab ? labMatch(lab) : loaded ? loaded : (missionMatch(data) ?? newMatch(data));
  ensureWeather(state);
  return { state, viewer: viewerOf(state), lab, fromSave: !!saved, corruptSave };
}

/** En esta pantalla juega una sola persona: una partida con mas equipos de personas no se puede jugar aqui. */
export const isPlayableHere = (state: GameState): boolean => teamsControlledBy(state, 'human').length <= 1;

/**
 * Una partida guardada o preparada que no se puede jugar en esta pantalla (varias personas: fase 4)
 * cuenta como dañada: no se abre, se borra el guardado y se empieza otra.
 */
const playableHere = (state: GameState | null): GameState | null => (state && isPlayableHere(state) ? state : null);

/**
 * El equipo que mira la pantalla: el de la persona. En esta pantalla juega una sola persona; una
 * partida con varias (por turnos o en red) es la fase 4 y no se puede empezar aqui (startMatch no
 * la abre). Una sin personas (IA contra IA, de las herramientas) se mira desde el primer equipo, y
 * ese equipo lo juega la persona en esta pantalla aunque guarde `controller: 'ai'`: las reglas no
 * miran el controller y los demas siguen siendo de la IA.
 */
export function viewerOf(state: GameState): TeamId {
  const people = teamsControlledBy(state, 'human');
  if (people.length > 1) throw new Error(`La partida tiene ${people.length} equipos de personas: en esta pantalla solo juega una`);
  return playerTeam(state);
}

function readSavedGame(): GameState | null {
  const raw = readSave();
  return raw ? loadGame(raw) : null;
}

function labMatch(lab: LabOptions): GameState {
  return labState(lab, lab.play);
}

function missionMatch(data: GameStartData): GameState | null {
  const mission = data.mode === 'mission' && data.mission ? missionById(data.mission) : undefined;
  if (!mission) return null;
  return buildMission(mission, defaultContent());
}

/**
 * Mapa al azar (o el de `setup`): una persona contra la IA, con los generales elegidos (el de la
 * persona y el de su enemigo).
 */
function newMatch(data: GameStartData): GameState {
  const setup: GameSetup = data.setup ?? { seed: randomSeed(), size: DEFAULT_MAP_SIZE, theme: null };
  const state = createGame(seededRng(setup.seed), {
    size: setup.size,
    theme: setup.theme,
    ruleChanges: data.rules,
    teams: duel('human', 'ai'),
  });
  state.setup = setup;
  const [person, enemy] = teamIds(state);
  appointGeneral(state, person!, data.general);
  appointGeneral(state, enemy!, data.enemyGeneral);
  return state;
}
