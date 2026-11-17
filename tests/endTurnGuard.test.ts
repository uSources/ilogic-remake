import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { EndTurnGuard, END_CONFIRM_MS } from '../src/view3d/systems/turn/endTurnGuard';
import { blankState, PLAYER, unitTypeNamed } from './helpers';

/** «Fin del turno» con unidades sin mover: la primera pulsacion las hace saltar; la segunda termina. */

function guardFor(idle: number) {
  const s = blankState({ fog: false });
  for (let index = 0; index < idle; index++) newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 2 + index, y: 2 });
  const log = { hops: [] as number[], ends: 0, clock: 0, timers: [] as (() => void)[] };
  const guard = new EndTurnGuard({
    s,
    viewer: PLAYER,
    pieces: { hop: async (uid) => void log.hops.push(uid) },
    endTurn: () => log.ends++,
    changed: () => {},
    now: () => log.clock,
    later: (_ms, run) => void log.timers.push(run),
  });
  return { guard, log };
}

describe('EndTurnGuard', () => {
  it('sin unidades sin mover, termina a la primera', () => {
    const { guard, log } = guardFor(0);
    guard.press();
    expect(log.ends).toBe(1);
  });

  it('con unidades sin mover: saltan, se arma y la segunda pulsacion a tiempo termina', () => {
    const { guard, log } = guardFor(2);
    guard.press();
    expect(log.ends).toBe(0);
    expect(log.hops).toHaveLength(2);
    expect(guard.isArmed).toBe(true);
    log.clock = END_CONFIRM_MS - 1;
    guard.press();
    expect(log.ends).toBe(1);
    expect(guard.isArmed).toBe(false);
  });

  it('si la segunda llega tarde, vuelve a avisar en vez de terminar', () => {
    const { guard, log } = guardFor(1);
    guard.press();
    log.clock = END_CONFIRM_MS + 1;
    expect(guard.isArmed).toBe(false);
    guard.press();
    expect(log.ends).toBe(0);
    expect(log.hops).toHaveLength(2);
  });
});
