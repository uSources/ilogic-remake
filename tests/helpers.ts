import { defaultContent } from '@core/content/default';
import { rulesWith } from '@core/data';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import type { GameState, RulesConfig } from '@core/model';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/** Partida vacia toda de hierba, para tests de reglas: con las reglas de siempre y los cambios de `rules`. */
/**
 * Una partida guardada como la guardaban las versiones de antes del formato 2 (`version: 1`): para
 * probar que MIGRATIONS las sigue leyendo.
 */
export function savedByVersion1(json: string): string {
  return json.replace('"version":2', '"version":1');
}

export function blankState(rules: Partial<RulesConfig> = {}): GameState {
  return newGameState({
    map: blankMap(BLANK_SIZE),
    rules: rulesWith(defaultContent(), rules),
    content: defaultContent(),
    funds: [5000, 5000],
  });
}
