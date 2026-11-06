/**
 * Lo que las reglas preguntan a los modulos de reglas de una partida: las entradas de cada lista
 * (`hooksOf`) y si lleva uno (`isRuleOn`). Los modulos ya estan resueltos en la partida
 * (`GameState.ruleset`, una vez por partida: al crearla, al leerla y al cambiar sus ajustes), asi
 * que las reglas no importan ningun modulo concreto ni la lista de todos (registry.ts): solo esto.
 */
import type { GameState, MatchSettings } from '../model';
import { damageModelFor, type DamageModel } from '../rules/damage';
import type { RuleHooks, RuleModule, RuleModuleId } from './hooks';

/** Lo que es una entrada de esa lista. */
export type HookOf<K extends keyof RuleHooks> = NonNullable<RuleHooks[K]>[number];

/** Los modulos que lleva una partida y lo que aportan, ya juntado lista a lista. */
export interface Ruleset {
  readonly modules: readonly RuleModule[];
  readonly hooks: { readonly [K in keyof RuleHooks]-?: readonly HookOf<K>[] };
  /** Como sale el daño en esta partida (el ajuste `damageModel`, construido una vez). */
  readonly damageModel: DamageModel;
}

declare module '../model/state' {
  /** Los modulos de una partida (`GameState.ruleset`) son un Ruleset. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- solo le da su forma
  interface MatchRuleset extends Ruleset {}
}

/** Todas las listas que pueden ampliar los modulos (el compilador obliga a que esten todas y solo ellas). */
const HOOK_LISTS = {
  hitModifiers: true,
  coverPiercing: true,
  counterRules: true,
  combatSteps: true,
  roundPhases: true,
  roundReportParts: true,
  matchSetup: true,
  healingBlocks: true,
  visionRadius: true,
  revealRules: true,
  concealment: true,
  coverSight: true,
  enterCosts: true,
  moveBudgets: true,
  passRules: true,
  stopRules: true,
  pathInterruptions: true,
  captureFactors: true,
} as const satisfies Record<keyof RuleHooks, true>;

/** Las entradas de una lista que aportan `modules`, en su orden. */
function collect<K extends keyof RuleHooks>(modules: readonly RuleModule[], list: K): readonly HookOf<K>[] {
  return modules.flatMap((module): readonly HookOf<K>[] => module.hooks[list] ?? []);
}

/** Los modulos de `available` que se enchufan con estos ajustes, con sus listas ya juntas. */
export function resolveRuleset(available: readonly RuleModule[], settings: Readonly<MatchSettings>): Ruleset {
  const repeated = available.find((module, index) => available.findIndex((other) => other.id === module.id) !== index);
  if (repeated) throw new Error(`Dos modulos de reglas con el mismo nombre: ${repeated.id}`);
  const modules = available.filter((module) => module.isOn(settings));
  const lists = Object.keys(HOOK_LISTS) as (keyof RuleHooks)[];
  // Cada lista se junta con su propio tipo (collect); el objeto entero no lo sabe ver TypeScript.
  const hooks = Object.fromEntries(lists.map((list) => [list, collect(modules, list)])) as Ruleset['hooks'];
  return Object.freeze({ modules, hooks, damageModel: damageModelFor(settings) });
}

/** Las entradas de una lista que aportan los modulos que lleva la partida, en el orden en que se enchufaron. */
export function hooksOf<K extends keyof RuleHooks>(s: GameState, list: K): readonly HookOf<K>[] {
  return s.ruleset.hooks[list];
}

/** La partida lleva ese modulo de reglas. */
export const isRuleOn = (s: GameState, id: RuleModuleId): boolean => s.ruleset.modules.some((module) => module.id === id);

/** El modelo de daño de la partida: la tirada del combate y el reparto de la prevision salen de el. */
export const damageModelOf = (s: GameState): DamageModel => s.ruleset.damageModel;
