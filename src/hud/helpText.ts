import { RULES } from '../core/data';
import { HELP_TEXTS } from '../i18n';
import { settings } from '../settings';

/**
 * La ayuda en el idioma elegido, con las frases del objetivo que tocan con las reglas de esta
 * partida (los textos estan en src/i18n/<idioma>/help.ts).
 */
export const helpText = () => {
  const help = HELP_TEXTS[settings.lang];
  const goal = [help.goalIntro, ...help.ruleLines(RULES), ...help.goalBasics].filter(Boolean);
  return { ...help, goal };
};
