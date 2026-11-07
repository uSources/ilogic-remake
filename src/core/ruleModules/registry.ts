/**
 * Los modulos de reglas del juego y cuales lleva cada partida (`rulesetFor`). Un modulo nuevo es su
 * fichero en esta carpeta (lo que aporta a cada lista: `RuleHooks`) y su entrada en `RULE_MODULES`
 * (o en los `ruleModules` de un modo, si es solo de ese modo); las reglas que miran esas listas no
 * cambian. Las reglas no importan esto: preguntan a `GameState.ruleset` (ruleset.ts).
 */
import type { GameModeId, MatchSettings, ModuleEventsAreNew } from '../model';
import { gameModeOf } from '../modes';
import { ABILITIES } from './abilities';
import { AMBUSH } from './ambush';
import { BOUNTY } from './bounty';
import { CONTROL_POINTS } from './controlPoints';
import { COUNTERATTACK } from './counterattack';
import { FLANK } from './flank';
import { FOREST_HIDES } from './forestHides';
import { GENERALS } from './generals';
import type { RuleModule, RuleModuleId } from './hooks';
import { resolveRuleset, type Ruleset } from './ruleset';
import { NO_FOG } from './noFog';
import { NO_HEAL_UNDER_FIRE } from './noHealUnderFire';
import { PASS_ALLIES } from './passAllies';
import { TERRAIN_COST } from './terrainCost';
import { UPKEEP } from './upkeep';
import { VETERANCY } from './veterancy';
import { WEATHER } from './weather';

/**
 * Todos los modulos, en orden: lo que aportan a una lista va en este orden (en el acierto importa
 * por el redondeo de coma flotante: las partidas de referencia lo notarian).
 */
export const RULE_MODULES: readonly RuleModule[] = [
  ABILITIES,
  VETERANCY,
  FLANK,
  GENERALS,
  WEATHER,
  CONTROL_POINTS,
  UPKEEP,
  NO_HEAL_UNDER_FIRE,
  NO_FOG,
  FOREST_HIDES,
  TERRAIN_COST,
  PASS_ALLIES,
  AMBUSH,
  COUNTERATTACK,
  BOUNTY,
];

/**
 * Los modulos de reglas de una partida de ese modo con esos ajustes: los del juego (RULE_MODULES) y
 * los que añade el modo (`GameMode.ruleModules`), los que se enchufen con esos ajustes. Se resuelve
 * una vez por partida (newGameState, readSave, changeSettings) y se guarda en `GameState.ruleset`.
 */
export function rulesetFor(match: { readonly mode: GameModeId }, settings: Readonly<MatchSettings>): Ruleset {
  return resolveRuleset([...RULE_MODULES, ...(gameModeOf(match).ruleModules ?? [])], settings);
}

/**
 * Los modulos del juego que van con estos ajustes. Solo para lo que no tiene partida (la ayuda del
 * menu): con partida, `s.ruleset` (isRuleOn), que sabe tambien de los modulos de su modo.
 */
export const gameModulesFor = (settings: Readonly<MatchSettings>): RuleModuleId[] =>
  RULE_MODULES.filter((module) => module.isOn(settings)).map((module) => module.id);

/** Ningun modulo usa para sus sucesos el tipo de uno de siempre: si alguno lo hiciera, esto no compila. */
export const MODULE_EVENTS_ARE_NEW: ModuleEventsAreNew = true;
