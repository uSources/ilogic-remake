/**
 * Lo que un modo puede fijar y ningun modo del juego usa aun: pasos de turno propios y otro orden de
 * turnos. GAME_MODES esta congelado, asi que el modo de prueba entra por `gameModeOf` (vi.mock del
 * modulo: lo usan las reglas, la sesion y la preparacion de la partida).
 */
import { describe, expect, it, vi } from 'vitest';
import type * as Modes from '@core/modes';
import type { GameMode } from '@core/modes';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { newUnit, unitById } from '@core/rules';
import { GameSession, passiveController, runMatch } from '@core/session';
import { startsTurn } from '@core/actions';
import { act, blankState, unitTypeNamed } from './helpers';
import { PLAIN_RULES } from './plainRules';

const testMode = vi.hoisted(() => ({ changes: null as Partial<GameMode> | null }));

vi.mock('@core/modes', async (importOriginal) => {
  const original = await importOriginal<typeof Modes>();
  return {
    ...original,
    gameModeOf: (s: { mode: keyof typeof original.GAME_MODES }) => ({ ...original.gameModeOf(s), ...(testMode.changes ?? {}) }),
  };
});

/** Juega `run` con el modo de cada partida cambiado por `changes` (y lo deja como estaba). */
function withMode<T>(changes: Partial<GameMode>, run: () => T): T {
  testMode.changes = changes;
  try {
    return run();
  } finally {
    testMode.changes = null;
  }
}

describe('modos de juego: lo que fija un modo (core/modes.ts)', () => {
  it('GAME_MODES no se puede cambiar en marcha', async () => {
    const { GAME_MODES } = await import('@core/modes');
    expect(Object.isFrozen(GAME_MODES)).toBe(true);
    expect(Object.isFrozen(GAME_MODES.skirmish.victory)).toBe(true);
  });

  it('los pasos de turno del modo van detras de los de todos, y por las mismas comprobaciones', () => {
    const s = blankState(PLAIN_RULES, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const traveler = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
    traveler.travelTo = { x: 2, y: 20 };
    s.buildings.push({ type: 'City', owner: null, x: 9, y: 9 });
    const capturer = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 9, y: 9 });
    s.buildings.at(-1)!.capture = { team: 0, uid: capturer.uid, left: 1 };
    const other = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 5, y: 12 });
    const enemy = newUnit(s, unitTypeNamed('Soldier'), 1, { x: 12, y: 5 });
    const seen: string[] = [];
    const replies: unknown[] = [];
    const result = withMode(
      {
        turnPhases: {
          start: [
            {
              id: 'modeStart',
              run: (state, team, perform) => {
                // Los viajes (TURN_START_PHASES) ya han dado su paso.
                seen.push(`start: viajero en y=${unitById(state, traveler.uid)!.y}`);
                const result = perform(state, team, { kind: 'wait', uid: other.uid });
                return result.ok ? result.events : [];
              },
            },
          ],
          end: [
            {
              id: 'modeEnd',
              run: (state, team, perform) => {
                // Las capturas (TURN_END_PHASES) ya se han hecho.
                seen.push(`end: ciudad de ${String(state.buildings.at(-1)!.owner)}`);
                replies.push(perform(state, team, { kind: 'wait', uid: other.uid }));
                replies.push(perform(state, 1, { kind: 'wait', uid: enemy.uid }));
                replies.push(perform(state, 1, { kind: 'surrender' }));
                return [];
              },
            },
          ],
        },
      },
      () => {
        const started = act(s, 0, { kind: 'startTurn' });
        const ended = act(s, 0, { kind: 'endTurn' });
        return { started, ended };
      },
    );
    expect(seen[0]).not.toBe('start: viajero en y=2');
    expect(result.started.at(-1)).toMatchObject({ kind: 'wait', uid: other.uid });
    expect(seen[1]).toBe('end: ciudad de 0');
    // Lo que manda el paso pasa por validate (esa unidad ya se ha usado) y por las guardas: otro
    // equipo no actua en este turno, ni para rendirse: un paso de turno solo manda las de su equipo.
    expect(replies).toMatchObject([
      { ok: false, reason: 'spent' },
      { ok: false, reason: 'notYourTurn' },
      { ok: false, reason: 'notYourTurn' },
    ]);
  });

  it('un modo con su propio orden de turnos: la partida lo guarda y la sesion lo sigue', () => {
    const reversed = (teams: readonly number[]) => [...teams].reverse();
    const s = withMode({ turnOrder: reversed }, () =>
      createMatch(skirmishConfig({ seed: 4, size: 16, teams: [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }] })),
    );
    expect(s.turnOrder).toEqual([2, 1, 0]);
    expect(s.turn).toBe(2);
    const session = new GameSession(
      s,
      s.teams.map(() => passiveController()),
    );
    const started: number[] = [];
    session.subscribe((step) => startsTurn(step) && started.push(step.team));
    runMatch(session, { until: (state) => state.day > 2 });
    expect(started).toEqual([2, 1, 0, 2, 1, 0]);
  });
});
