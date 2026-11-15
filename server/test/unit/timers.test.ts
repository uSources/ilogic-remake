import { describe, expect, it } from 'vitest';
import { ROOM_EXPIRY_MS } from '../../src/limits';
import { watchRejections } from '../../src/rateLimit';
import { doneWaiting, dueTimers, initialTimers, nextAlarm, timedOutSeat, touched, withContinuation, withTurnOf } from '../../src/timers';

const NOW = 1_000_000;

describe('los relojes de una sala', () => {
  it('nace con la caducidad y, si se pidio, la espera; sin reloj de turno hasta que se espera a alguien', () => {
    const timers = initialTimers({ waitingSeconds: 60 }, NOW);
    expect(timers).toEqual({ expiresAt: NOW + ROOM_EXPIRY_MS, turn: null, waitingUntil: NOW + 60_000, continueAt: null });
    expect(nextAlarm(timers)).toBe(NOW + 60_000);
    expect(initialTimers({}, NOW).waitingUntil).toBeNull();
    expect(nextAlarm(initialTimers({}, NOW))).toBe(NOW + ROOM_EXPIRY_MS);
  });

  it('el reloj del turno empieza con cada turno y se conserva mientras es el mismo', () => {
    const settings = { turnSeconds: 90 };
    const started = withTurnOf(initialTimers(settings, NOW), { seat: 0, day: 1 }, settings, NOW);
    expect(started.turn).toEqual({ seat: 0, day: 1, at: NOW + 90_000 });
    expect(withTurnOf(started, { seat: 0, day: 1 }, settings, NOW + 50_000).turn).toEqual(started.turn);
    expect(withTurnOf(started, { seat: 0, day: 2 }, settings, NOW + 50_000).turn).toEqual({ seat: 0, day: 2, at: NOW + 140_000 });
    expect(withTurnOf(started, null, settings, NOW).turn).toBeNull();
    expect(withTurnOf(started, { seat: 1, day: 1 }, {}, NOW).turn).toBeNull();
  });

  it('dice que ha vencido, con la caducidad delante, y a quien se le acabo el turno', () => {
    const settings = { turnSeconds: 60, waitingSeconds: 30 };
    const timers = withTurnOf(initialTimers(settings, NOW), { seat: 1, day: 3 }, settings, NOW);
    expect(dueTimers(timers, NOW)).toEqual([]);
    expect(dueTimers(timers, NOW + 30_000)).toEqual(['waiting']);
    expect(dueTimers(timers, NOW + 60_000)).toEqual(['waiting', 'turn']);
    expect(dueTimers(timers, NOW + ROOM_EXPIRY_MS)).toEqual(['expiry', 'waiting', 'turn']);
    expect(timedOutSeat(timers)).toBe(1);
    expect(dueTimers(doneWaiting(timers), NOW + 30_000)).toEqual([]);
  });

  it('una partida a medias se sigue cuanto antes: la alarma suena ya', () => {
    const pending = withContinuation(initialTimers({}, NOW), true, NOW);
    expect(pending.continueAt).toBe(NOW);
    expect(nextAlarm(pending)).toBe(NOW);
    expect(dueTimers(pending, NOW)).toEqual(['continue']);
    expect(withContinuation(pending, false, NOW + 1).continueAt).toBeNull();
  });

  it('tocar la sala la hace caducar mas tarde', () => {
    const later = touched(initialTimers({}, NOW), NOW + 5000);
    expect(later.expiresAt).toBe(NOW + 5000 + ROOM_EXPIRY_MS);
  });
});

describe('frenar a quien insiste', () => {
  it('cuenta los rechazos de la ventana y avisa pasado el tope; otra ventana empieza de cero', () => {
    const first = watchRejections(undefined, 3, NOW);
    expect(first).toEqual({ window: { since: NOW, countAtStart: 3 }, exceeded: false });
    expect(watchRejections(first.window, 33, NOW + 1000).exceeded).toBe(false);
    expect(watchRejections(first.window, 34, NOW + 1000).exceeded).toBe(true);
    const next = watchRejections(first.window, 34, NOW + 61_000);
    expect(next).toEqual({ window: { since: NOW + 61_000, countAtStart: 34 }, exceeded: false });
  });
});
