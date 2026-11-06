import type { GameState, MatchSettings } from '../core/model';
import { gameModulesFor } from '../core/rules';
import { HELP_TEXTS } from '../i18n';
import type { HelpRules, RuleFacts } from '../i18n/help';
import { settings } from '../settings';

/** La ayuda en una partida: sus ajustes y los modulos que lleva de verdad (los del juego y los de su modo). */
export const helpRulesOfMatch = (s: GameState): HelpRules => ({
  settings: s.settings,
  modules: s.ruleset.modules.map((module) => module.id),
});

/** La ayuda sin partida (el menu): solo hay ajustes, asi que cuenta los modulos del juego que van con ellos. */
export const helpRulesForSettingsOnly = (matchSettings: Readonly<MatchSettings>): HelpRules => ({
  settings: matchSettings,
  modules: gameModulesFor(matchSettings),
});

/** Lo que reciben las frases: los ajustes y si un modulo esta entre los que cuenta la ayuda. */
export const ruleFactsOf = (rules: HelpRules): RuleFacts => ({ settings: rules.settings, on: (module) => rules.modules.includes(module) });

/**
 * La ayuda en el idioma elegido, con las frases del objetivo que tocan con esas reglas. Los textos
 * estan en src/i18n/<idioma>/help.ts.
 */
export const helpText = (rules: HelpRules) => {
  const help = HELP_TEXTS[settings.lang];
  const goal = [help.goalIntro, ...help.ruleLines(ruleFactsOf(rules)), ...help.goalBasics].filter(Boolean);
  return { ...help, goal };
};
