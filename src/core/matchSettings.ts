/** Escribir los ajustes de una partida (`MatchSettings`, que cada partida lleva en `s.settings`). */
import type { GameContent } from './content';
import type { MatchSettings } from './model';

/**
 * Las reglas por defecto de ese contenido (settings.json, validado por loadContent:
 * `content.defaultSettings`) con estos cambios: la unica forma de escribir unas reglas nuevas.
 * [CAMBIO] El modo "reglas de 2013" se ha quitado.
 */
export function settingsWith(content: GameContent, overrides: Partial<MatchSettings> = {}): MatchSettings {
  return { ...content.defaultSettings, ...overrides };
}
