/**
 * Los modulos de reglas del juego y cuales lleva cada partida. Un modulo nuevo es su fichero en esta
 * carpeta (lo que aporta a cada lista: `RuleHooks`) y su entrada en `RULE_MODULES`; las reglas que
 * miran esas listas no cambian.
 */
import type { GameState } from '../model';
import { ABILITIES } from './abilities';
import { AMBUSH } from './ambush';
import { BOUNTY } from './bounty';
import { CONTROL_POINTS } from './controlPoints';
import { COUNTERATTACK } from './counterattack';
import { FLANK } from './flank';
import { FOREST_HIDES } from './forestHides';
import { GENERALS } from './generals';
import type { RuleHooks, RuleModule, RuleModuleId } from './hooks';
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

/** Los modulos que lleva la partida, segun sus ajustes. */
export const activeModules = (s: GameState): RuleModule[] => RULE_MODULES.filter((module) => module.isOn(s.rules));

/** La partida lleva ese modulo de reglas. */
export const isRuleOn = (s: GameState, id: RuleModuleId): boolean => activeModules(s).some((module) => module.id === id);

/** Las entradas de una lista que aportan los modulos que lleva la partida, en el orden de RULE_MODULES. */
export function hooksOf<K extends keyof RuleHooks>(s: GameState, list: K): HookOf<K>[] {
  const entries = (module: RuleModule): readonly HookOf<K>[] => module.hooks[list] ?? [];
  return activeModules(s).flatMap(entries);
}

/** Lo que es una entrada de esa lista. */
type HookOf<K extends keyof RuleHooks> = NonNullable<RuleHooks[K]>[number];
