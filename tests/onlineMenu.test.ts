/**
 * «Mis partidas en línea»: como se enseña cada sala segun lo que dice el servidor (roomLines.ts):
 * te toca, le toca a otro (o a la IA), esperando a que entren, acabada o ya no existe; lo que queda
 * del turno con reloj; y que lo que pide hacer algo va arriba.
 */
import { describe, expect, it } from 'vitest';
import { CURRENT_PROTOCOL } from '@core/net';
import { roomLineOf, roomLines, timeLeftText, type RoomLook } from '../src/menu/online/roomLines';
import type { OnlineRoomEntry } from '../src/net/onlineRooms';
import type { LobbyInfo, LobbyTurn } from '../src/net/roomApi';
import { t } from '../src/settings';

const NOW = 1_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Una sala apuntada en la que este navegador juega el asiento `seat`. */
const entry = (code: string, seat = 0): OnlineRoomEntry => ({ code, token: 'ficha', seat, team: seat, teams: 2, status: 'playing', at: 0 });

/** Lo que dice el servidor de una sala de dos personas. */
function info(status: LobbyInfo['status'], turn: LobbyTurn | null = null, joined = [true, true]): RoomLook {
  const seats = joined.map((isIn, seat) => ({ seat, team: seat, kind: 'person' as const, joined: isIn }));
  return { kind: 'info', info: { ...CURRENT_PROTOCOL, status, seats, turn } };
}

describe('las salas de «Mis partidas»', () => {
  it('te toca: el dia y lo que queda de turno, y el boton es «Jugar»', () => {
    const line = roomLineOf(entry('AAAAAA', 1), info('playing', { seat: 1, day: 4, endsAt: NOW + 3 * HOUR + 5 * MINUTE }), NOW);
    expect(line.state).toBe('yourTurn');
    expect(line.title).toBe(t('onlineYourTurn'));
    expect(line.detail).toContain(t('onlineDay').replace('{n}', '4'));
    expect(line.detail).toContain(`3 ${t('onlineHours')}`);
    expect(line.enter).toBe(t('onlinePlay'));
  });

  it('le toca a otro: dice a que equipo; si no se espera a nadie, juega la IA', () => {
    const theirs = roomLineOf(entry('AAAAAA', 0), info('playing', { seat: 1, day: 2, endsAt: null }), NOW);
    expect(theirs.state).toBe('theirTurn');
    expect(theirs.title).toBe(t('onlineTurnOf').replace('{n}', '2'));
    expect(theirs.detail).not.toContain(t('onlineLeft'));
    expect(theirs.enter).toBe(t('onlineRejoin'));
    expect(roomLineOf(entry('AAAAAA'), info('playing'), NOW).title).toBe(t('onlineAiPlaying'));
  });

  it('esperando a que entren: cuantos han entrado; la que ya no existe no se puede abrir', () => {
    const waiting = roomLineOf(entry('AAAAAA'), info('waiting', null, [true, false]), NOW);
    expect(waiting.state).toBe('waiting');
    expect(waiting.detail).toContain(`1/2 ${t('onlineIn')}`);
    const gone = roomLineOf(entry('AAAAAA'), { kind: 'gone' }, NOW);
    expect(gone.state).toBe('gone');
    expect(gone.enter).toBeNull();
  });

  it('sin respuesta del servidor, lo ultimo que se supo', () => {
    const line = roomLineOf({ ...entry('AAAAAA'), status: 'ended' }, { kind: 'unknown' }, NOW);
    expect(line.state).toBe('unknown');
    expect(line.title).toBe(t('onlineStatusEnded'));
  });

  it('lo que pide hacer algo va arriba; dentro de cada grupo, en el orden apuntado', () => {
    const looks: Record<string, RoomLook> = {
      GONE11: { kind: 'gone' },
      ENDED1: info('ended'),
      THEIRS: info('playing', { seat: 1, day: 1, endsAt: null }),
      MINE11: info('playing', { seat: 0, day: 1, endsAt: null }),
      WAITS1: info('waiting', null, [true, false]),
    };
    const entries = Object.keys(looks).map((code) => entry(code));
    const order = roomLines(entries, (code) => looks[code] ?? { kind: 'unknown' }, NOW).map((line) => line.code);
    expect(order).toEqual(['MINE11', 'THEIRS', 'WAITS1', 'ENDED1', 'GONE11']);
  });

  it('lo que queda de un turno, en la unidad mas grande que cabe', () => {
    expect(timeLeftText(2 * 24 * HOUR + HOUR)).toBe(`2 ${t('onlineDays')}`);
    expect(timeLeftText(5 * HOUR)).toBe(`5 ${t('onlineHours')}`);
    expect(timeLeftText(12 * MINUTE + 30_000)).toBe(`12 ${t('onlineMinutes')}`);
    expect(timeLeftText(10_000)).toBe(t('onlineUnderAMinute'));
  });
});
