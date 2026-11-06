import type { MatchSettings } from '../core/model';
import { HELP_TEXTS } from '../i18n';
import { settings } from '../settings';

/**
 * La ayuda en el idioma elegido, con las frases del objetivo que tocan con los ajustes de la partida. Los textos estan en src/i18n/<idioma>/help.ts.
 */
export const helpText = (matchSettings: Readonly<MatchSettings>) => {
  const help = HELP_TEXTS[settings.lang];
  const goal = [help.goalIntro, ...help.ruleLines(matchSettings), ...help.goalBasics].filter(Boolean);
  return { ...help, goal };
};
