/**
 * Con que partida empieza la escena (GameStartData): la guardada, una preparada desde fuera, el
 * laboratorio, una mision o un mapa nuevo. Cada una lleva sus reglas en `state.rules`. Sin Phaser.
 */
import { newGeneral } from '../../core/generals';
import { seededRng } from '../../core/geom';
import { defaultContent } from '../../core/content/default';
import { createGame, loadGame } from '../../core/defaultGames';
import { buildMission, missionById } from '../../core/missions';
import type { GameSetup, GameState } from '../../core/model';
import { ensureWeather } from '../../core/weather';
import { defaultLab, labState, type LabOptions } from '../../lab';
import { randomSeed } from '../../setup';
import { deleteSave, readSave } from '../../storage';
import type { GameStartData } from './types';

export interface MatchStart {
  state: GameState;
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
  const saved = data.mode === 'load' ? readSavedGame() : null;
  const given = data.mode === 'state' && data.state ? loadGame(data.state) : null;
  const loaded = saved ?? given;
  const corruptSave = (data.mode === 'load' || data.mode === 'state') && !loaded;
  if (corruptSave) deleteSave();
  const state = lab ? labMatch(lab) : loaded ? loaded : (missionMatch(data) ?? newMatch(data));
  ensureWeather(state);
  return { state, lab, fromSave: !!saved, corruptSave };
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

/** Mapa al azar (o el de `setup`), con los generales elegidos. */
function newMatch(data: GameStartData): GameState {
  const setup: GameSetup = data.setup ?? { seed: randomSeed(), size: DEFAULT_MAP_SIZE, theme: null };
  const state = createGame(seededRng(setup.seed), { size: setup.size, theme: setup.theme, ruleChanges: data.rules });
  state.setup = setup;
  const player = newGeneral(state, data.general);
  const enemy = newGeneral(state, data.enemyGeneral);
  if (player || enemy) state.generals = [player, enemy];
  return state;
}
