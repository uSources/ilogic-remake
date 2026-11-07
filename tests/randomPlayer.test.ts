import { describe, expect, it } from 'vitest';
import { isValidAction } from '@core/actions';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { aiController } from '@core/controllers';
import { GameSession, runMatch } from '@core/session';
import { duel } from '@core/teams';
import { cloneState } from '@core/gameContent';
import { seededRng } from '@core/util/random';
import type { GameAction } from '@core/model';
import { randomController } from '../tools/improve/randomPlayer';

/** Unos dias del jugador al azar contra la IA: lo que propone el y si valia cuando lo propuso. */
function playRandom(seed: number) {
  const s = createMatch(skirmishConfig({ seed: 6, size: 16, teams: duel('ai', 'ai') }));
  const random = randomController(seededRng(seed));
  const proposed: { action: GameAction; valid: boolean }[] = [];
  const watching = {
    ...random,
    playTurn: (view: Parameters<typeof random.playTurn>[0]) => {
      const turn = random.playTurn(view);
      // Antes de cada paso, si lo que propone vale en la partida de verdad.
      return (function* () {
        for (let step = turn.next(); !step.done;) {
          if (step.value.kind === 'propose')
            proposed.push({ action: step.value.action, valid: isValidAction(s, view.team, step.value.action) });
          step = turn.next(yield step.value);
        }
      })();
    },
  };
  const before = cloneState(s);
  runMatch(new GameSession(s, [watching, aiController()]), { until: (state) => state.day > 4 });
  return { proposed, before };
}

/** El jugador al azar del fuzz (L9): un controlador que solo propone jugadas que valen. */
describe('randomController', () => {
  it('solo propone acciones que valen (las elige de las que el juego da por buenas)', () => {
    const { proposed } = playRandom(3);
    expect(proposed.length).toBeGreaterThan(10);
    expect(proposed.filter((entry) => !entry.valid)).toEqual([]);
    expect(new Set(proposed.map((entry) => entry.action.kind)).size).toBeGreaterThan(2);
  });

  it('con la misma semilla juega lo mismo; con otra, otra cosa', () => {
    const actions = (seed: number) => playRandom(seed).proposed.map((entry) => entry.action);
    expect(actions(3)).toEqual(actions(3));
    expect(actions(3)).not.toEqual(actions(4));
  });
});
