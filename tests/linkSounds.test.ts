/**
 * Lo que suena de la conexion con la sala (`LinkSounds`), con el reloj a mano: un corte que dura, la
 * vuelta de ese corte y el cierre sin arreglo. Lo que va bien, y un corte que se arregla enseguida, no
 * suena.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUT_NOTICE_MS, LinkSounds } from '../src/net/linkSounds';
import { FakeSounds } from './sim/turnPorts';

describe('LinkSounds', () => {
  let sounds: FakeSounds;
  let link: LinkSounds;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    sounds = new FakeSounds();
    link = new LinkSounds(sounds);
  });

  afterEach(() => {
    link.stop();
    vi.useRealTimers();
  });

  it('conectar la primera vez no suena', () => {
    link.statusChanged('connecting');
    link.statusChanged('online');
    expect(sounds.heard).toEqual([]);
  });

  it('un corte que se arregla antes del aviso no suena, ni al irse ni al volver', () => {
    link.statusChanged('online');
    link.statusChanged('reconnecting');
    vi.advanceTimersByTime(CUT_NOTICE_MS - 1);
    link.statusChanged('online');
    vi.advanceTimersByTime(CUT_NOTICE_MS);
    expect(sounds.heard).toEqual([]);
  });

  it('un corte que dura suena una vez, y su vuelta tambien', () => {
    link.statusChanged('online');
    link.statusChanged('reconnecting');
    vi.advanceTimersByTime(CUT_NOTICE_MS * 3);
    expect(sounds.heard).toEqual(['net_reconnecting']);

    link.statusChanged('online');
    expect(sounds.heard).toEqual(['net_reconnecting', 'net_connected']);
  });

  it('despues de una vuelta, el corte siguiente vuelve a esperar antes de sonar', () => {
    link.statusChanged('reconnecting');
    vi.advanceTimersByTime(CUT_NOTICE_MS);
    link.statusChanged('online');
    link.statusChanged('reconnecting');
    vi.advanceTimersByTime(CUT_NOTICE_MS - 1);
    expect(sounds.heard).toEqual(['net_reconnecting', 'net_connected']);
  });

  it('el cierre sin arreglo suena en el acto, y el corte que faltaba por sonar ya no', () => {
    link.statusChanged('reconnecting');
    link.closed();
    vi.advanceTimersByTime(CUT_NOTICE_MS);
    expect(sounds.heard).toEqual(['net_lost']);
  });

  it('al dejar de escucharla (salir de la sala) no suena lo que faltaba, ni la vuelta despues', () => {
    link.statusChanged('reconnecting');
    vi.advanceTimersByTime(CUT_NOTICE_MS);
    link.stop();
    link.statusChanged('online');
    link.statusChanged('reconnecting');
    link.stop();
    vi.advanceTimersByTime(CUT_NOTICE_MS);
    expect(sounds.heard).toEqual(['net_reconnecting']);
  });
});
