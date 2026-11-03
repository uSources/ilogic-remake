/**
 * Con que partida empieza la escena (GameStartData): la guardada, una preparada desde fuera, el
 * laboratorio, una mision o un mapa nuevo. Pone las reglas de esa partida (useRules). Sin Phaser.
 */
import { DEFAULT_RULES, useRules, type RulesConfig } from '../../core/data';
import { newGeneral } from '../../core/generals';
import { seededRng } from '../../core/geom';
import { generateGame } from '../../core/mapgen';
import { buildMission, missionById, missionRules } from '../../core/missions';
import { deserialize } from '../../core/save';
import type { GameSetup, GameState } from '../../core/types';
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
  const given = data.mode === 'state' && data.state ? deserialize(data.state) : null;
  const loaded = saved ?? given;
  const corruptSave = (data.mode === 'load' || data.mode === 'state') && !loaded;
  if (corruptSave) deleteSave();
  const state = lab ? labMatch(lab) : loaded ? withCurrentRules(loaded) : (missionMatch(data) ?? newMatch(data));
  ensureWeather(state);
  return { state, lab, fromSave: !!saved, corruptSave };
}

function readSavedGame(): GameState | null {
  const raw = readSave();
  return raw ? deserialize(raw) : null;
}

function labMatch(lab: LabOptions): GameState {
  // Contraataque solo en la accion que lo enseña (en 'attack', el defensor no responde).
  useRules({ ...DEFAULT_RULES, fog: false, weather: false, counterattack: lab.play !== 'attack' });
  return labState(lab, lab.play);
}

/**
 * Solo se guardan los ajustes de la partida; las reglas son siempre las actuales (las partidas
 * antiguas con las reglas de 2013 pasan a jugarse con estas).
 */
function withCurrentRules(state: GameState): GameState {
  state.rules = { ...DEFAULT_RULES, ...(state.rules ? savedSettings(state.rules) : {}) };
  useRules(state.rules);
  return state;
}

function savedSettings(rules: RulesConfig): Partial<RulesConfig> {
  return {
    initialFunds: rules.initialFunds,
    maxUnits: rules.maxUnits,
    incomeScale: rules.incomeScale,
    fog: rules.fog,
    dayLimit: rules.dayLimit,
    commandPoints: rules.commandPoints,
    upkeep: rules.upkeep,
    weather: rules.weather ?? DEFAULT_RULES.weather,
  };
}

function missionMatch(data: GameStartData): GameState | null {
  const mission = data.mode === 'mission' && data.mission ? missionById(data.mission) : undefined;
  if (!mission) return null;
  useRules(missionRules(mission));
  return buildMission(mission);
}

/** Mapa al azar (o el de `setup`), con los generales elegidos. */
function newMatch(data: GameStartData): GameState {
  useRules(data.rules ?? DEFAULT_RULES);
  const setup: GameSetup = data.setup ?? { seed: randomSeed(), size: DEFAULT_MAP_SIZE, theme: null };
  const state = generateGame(seededRng(setup.seed), { size: setup.size, theme: setup.theme });
  state.setup = setup;
  const player = newGeneral(data.general);
  const enemy = newGeneral(data.enemyGeneral);
  if (player || enemy) state.generals = [player, enemy];
  return state;
}
