import type { MatchSettings } from '../core/model';
import { isModuleOn } from '../core/rules';
import { HELP_TEXTS } from '../i18n';
import type { RuleFacts } from '../i18n/help';
import { settings } from '../settings';

/** Lo que la ayuda sabe de unos ajustes: las cifras y que modulos de reglas van con ellos. */
export const ruleFactsFor = (matchSettings: Readonly<MatchSettings>): RuleFacts => ({
  settings: matchSettings,
  on: (module) => isModuleOn(matchSettings, module),
});

/**
 * La ayuda en el idioma elegido, con las frases del objetivo que tocan con los ajustes de la partida. Los textos estan en src/i18n/<idioma>/help.ts.
 */
export const helpText = (matchSettings: Readonly<MatchSettings>) => {
  const help = HELP_TEXTS[settings.lang];
  const goal = [help.goalIntro, ...help.ruleLines(ruleFactsFor(matchSettings)), ...help.goalBasics].filter(Boolean);
  return { ...help, goal };
};
