/** Escribir los ajustes de una partida (`MatchSettings`, que cada partida lleva en `s.rules`). */
import type { GameContent } from './content';
import type { MatchSettings } from './model';

/**
 * Las reglas por defecto de ese contenido (rules.json, validado por loadContent:
 * `content.defaultRules`) con estos cambios: la unica forma de escribir unas reglas nuevas.
 * [CAMBIO] El modo "reglas de 2013" se ha quitado.
 */
export function rulesWith(content: GameContent, overrides: Partial<MatchSettings> = {}): MatchSettings {
  return { ...content.defaultRules, ...overrides };
}
