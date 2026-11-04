import { DEFAULT_RULES } from '../core/data';
import type { RulesConfig } from '../core/model';
import { HELP_TEXTS } from '../i18n';
import { settings } from '../settings';

/**
 * La ayuda en el idioma elegido, con las frases del objetivo que tocan con las reglas de la partida
 * (las de siempre fuera de una partida). Los textos estan en src/i18n/<idioma>/help.ts.
 */
export const helpText = (rules: Readonly<RulesConfig> | null) => {
  const help = HELP_TEXTS[settings.lang];
  const goal = [help.goalIntro, ...help.ruleLines(rules ?? DEFAULT_RULES), ...help.goalBasics].filter(Boolean);
  return { ...help, goal };
};
