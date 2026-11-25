/**
 * La partida que se ve detras del menu: una escaramuza de la IA contra la IA, sin niebla (se ve todo
 * el tablero) ni clima (siempre a pleno sol), jugada unos dias para que haya unidades repartidas y
 * algun edificio ganado. Con la misma semilla y el mismo tema sale la misma.
 */
import { aiController } from '../core/controllers';
import { createMatch } from '../core/defaultGames';
import { skirmishConfig } from '../core/match';
import type { GameState } from '../core/model';
import { GameSession, runMatch } from '../core/session';
import { duel } from '../core/teams';

/** Pequeño, para que se vea entero mientras gira (y se juega enseguida). */
export const MENU_BOARD_SIZE = 20;
/** Los dias que juega la IA antes de enseñarlo: a los seis ya hay unas quince unidades por el mapa. */
export const MENU_BOARD_DAYS = 6;

export function menuBoardMatch(seed: number, theme: string | null): GameState {
  const s = createMatch(
    skirmishConfig({
      seed,
      size: MENU_BOARD_SIZE,
      theme,
      teams: duel('ai', 'ai'),
      settingChanges: { fog: false, weather: false },
    }),
  );
  const session = new GameSession(
    s,
    s.teams.map(() => aiController()),
  );
  runMatch(session, { until: (state) => state.day > MENU_BOARD_DAYS });
  return session.state;
}
