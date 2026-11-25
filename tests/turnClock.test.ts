import { beforeEach, describe, expect, it } from 'vitest';
import { ui } from '../src/hud/store';
import type { FrameListener } from '../src/view3d/ports/frame';
import { settings } from '../src/settings';
import { clockText, HURRY_SECONDS, secondsLeftOf, turnClockVM } from '../src/ui/hudModels';
import { TurnClock, type TimedTurn } from '../src/view3d/systems/net/turnClock';
import { blankState } from './helpers';
import { FakeSounds } from './sim/turnPorts';

const NOW = 1_000_000;
const TWO_MINUTES = 120;
const MS_PER_SECOND = 1000;

beforeEach(() => {
  settings.lang = 'es';
  ui.set({ turnClock: null });
});

describe('el reloj del turno: que se enseña', () => {
  it('lo que queda, en minutos y segundos; en un turno de horas, con las horas delante', () => {
    expect(clockText(86)).toBe('1:26');
    expect(clockText(9)).toBe('0:09');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(3600)).toBe('1:00:00');
    expect(clockText(86_399)).toBe('23:59:59');
  });

  it('los segundos que quedan se cuentan hacia arriba (0:00 es que se acabo) y nunca menos de nada', () => {
    expect(secondsLeftOf(NOW + 86_000, NOW)).toBe(86);
    expect(secondsLeftOf(NOW + 400, NOW)).toBe(1);
    expect(secondsLeftOf(NOW, NOW)).toBe(0);
    expect(secondsLeftOf(NOW - 5000, NOW)).toBe(0);
  });

  it('el turno propio va en azul con el dia; los ultimos segundos, en rojo; el de otro, oscuro con su lado', () => {
    const own = { side: 'own', day: 4, totalSeconds: TWO_MINUTES } as const;
    expect(turnClockVM({ ...own, secondsLeft: 86 })).toEqual({
      time: '1:26',
      left: 86 / TWO_MINUTES,
      mood: 'calm',
      caption: 'Día 4 · Te toca',
      side: 'own',
    });
    expect(turnClockVM({ ...own, secondsLeft: HURRY_SECONDS + 1 }).mood).toBe('calm');
    expect(turnClockVM({ ...own, secondsLeft: HURRY_SECONDS })).toMatchObject({ mood: 'hurry', caption: 'Se acaba tu turno' });
    expect(turnClockVM({ ...own, side: 'enemy', secondsLeft: 5 })).toMatchObject({
      mood: 'waiting',
      caption: 'Juega el rojo',
      side: 'enemy',
    });
    expect(turnClockVM({ ...own, side: 'ally', secondsLeft: 54 })).toMatchObject({ mood: 'waiting', caption: 'Juega tu aliado' });
  });

  it('el anillo va de lleno a vacio y no se pasa (un turno que vuelve con mas de lo que dura, lleno)', () => {
    const turn = { side: 'own', day: 1, totalSeconds: TWO_MINUTES } as const;
    expect(turnClockVM({ ...turn, secondsLeft: TWO_MINUTES }).left).toBe(1);
    expect(turnClockVM({ ...turn, secondsLeft: TWO_MINUTES + 1 }).left).toBe(1);
    expect(turnClockVM({ ...turn, secondsLeft: 0 }).left).toBe(0);
    expect(turnClockVM({ ...turn, secondsLeft: 0, totalSeconds: 0 }).left).toBe(0);
  });
});

/** El reloj con la hora y los fotogramas a mano. */
function clockHarness() {
  const s = blankState();
  const time = { now: NOW };
  const frames = new Set<FrameListener>();
  const sounds = new FakeSounds();
  const clock = new TurnClock(s, 0, {
    now: () => time.now,
    onFrame: (listener) => {
      frames.add(listener);
      return () => frames.delete(listener);
    },
    sounds,
  });
  /** Pasa el tiempo y se dibuja un fotograma. */
  const wait = (ms: number) => {
    time.now += ms;
    for (const frame of frames) frame(ms / MS_PER_SECOND);
  };
  return { clock, frames, sounds, wait };
}

const turnOf = (team: number, secondsLeft: number): TimedTurn => ({
  team,
  day: 3,
  deadline: { endsAt: NOW + secondsLeft * MS_PER_SECOND, totalMs: TWO_MINUTES * MS_PER_SECOND },
});

describe('el reloj del turno: la cuenta', () => {
  it('cuenta segundo a segundo con el bucle de dibujo y, al quitarlo, deja de mirarlo y desaparece', () => {
    const { clock, frames, wait } = clockHarness();
    clock.follow(turnOf(0, 86));
    expect(ui.get().turnClock).toMatchObject({ time: '1:26', caption: 'Día 3 · Te toca' });
    wait(400);
    expect(ui.get().turnClock?.time).toBe('1:26');
    wait(600);
    expect(ui.get().turnClock?.time).toBe('1:25');
    expect(frames.size).toBe(1);
    clock.follow(null);
    expect(ui.get().turnClock).toBeNull();
    expect(frames.size).toBe(0);
  });

  it('en los ultimos segundos del turno propio, un tic por segundo (no a cada fotograma, ni con el tiempo ya acabado)', () => {
    const { clock, sounds, wait } = clockHarness();
    clock.follow(turnOf(0, HURRY_SECONDS + 2));
    wait(MS_PER_SECOND);
    expect(sounds.heard).toEqual([]);
    wait(MS_PER_SECOND);
    wait(MS_PER_SECOND / 2);
    wait(MS_PER_SECOND / 2);
    expect(ui.get().turnClock?.mood).toBe('hurry');
    expect(sounds.heard).toEqual(['turn_clock_tick', 'turn_clock_tick']);
    wait(HURRY_SECONDS * MS_PER_SECOND);
    expect(ui.get().turnClock?.time).toBe('0:00');
    expect(sounds.heard).toHaveLength(2);
  });

  it('el turno del rival no hace tic y pinta con su lado; otro turno empieza su cuenta con el mismo bucle', () => {
    const { clock, frames, sounds, wait } = clockHarness();
    clock.follow(turnOf(1, 5));
    expect(ui.get().turnClock).toMatchObject({ time: '0:05', mood: 'waiting', side: 'enemy' });
    wait(2 * MS_PER_SECOND);
    expect(sounds.heard).toEqual([]);
    clock.follow(turnOf(0, 100));
    expect(ui.get().turnClock).toMatchObject({ time: '1:38', mood: 'calm' });
    expect(frames.size).toBe(1);
  });

  it('el mismo turno que vuelve (tras un corte) en los ultimos segundos no repite el tic de ese segundo', () => {
    const { clock, sounds, wait } = clockHarness();
    clock.follow(turnOf(0, HURRY_SECONDS));
    expect(sounds.heard).toEqual(['turn_clock_tick']);
    wait(MS_PER_SECOND / 4);
    clock.follow({
      ...turnOf(0, HURRY_SECONDS),
      deadline: { endsAt: NOW + HURRY_SECONDS * MS_PER_SECOND + 30, totalMs: TWO_MINUTES * MS_PER_SECOND },
    });
    expect(sounds.heard).toEqual(['turn_clock_tick']);
    wait(MS_PER_SECOND);
    expect(sounds.heard).toEqual(['turn_clock_tick', 'turn_clock_tick']);
  });

  it('a 0:00 deja de mirar los fotogramas y se queda asi hasta el turno que sigue, que vuelve a contar', () => {
    const { clock, frames, wait } = clockHarness();
    clock.follow(turnOf(0, 2));
    wait(2 * MS_PER_SECOND);
    expect(ui.get().turnClock?.time).toBe('0:00');
    expect(frames.size).toBe(0);
    clock.follow(turnOf(1, 100));
    expect(frames.size).toBe(1);
    wait(MS_PER_SECOND);
    expect(ui.get().turnClock).toMatchObject({ time: '1:37', mood: 'waiting' });
  });
});
