/** Escribir las reglas de una partida (`RulesConfig`, que cada partida lleva en `s.rules`). */
import type { GameContent } from './content';
import type { RulesConfig } from './model';

/**
 * Las reglas por defecto de ese contenido (rules.json, validado por loadContent:
 * `content.tables.DEFAULT_RULES`) con estos cambios: la unica forma de escribir unas reglas nuevas.
 * [CAMBIO] El modo "reglas de 2013" se ha quitado.
 */
export function rulesWith(content: GameContent, overrides: Partial<RulesConfig> = {}): RulesConfig {
  return { ...content.tables.DEFAULT_RULES, ...overrides };
}
