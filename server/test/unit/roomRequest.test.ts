import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { isRoomRequest } from '../../src/roomRequest';

const content = defaultContent();

/** Una peticion que vale: dos personas y la IA. */
const valid = () => ({
  match: {
    seed: 7,
    size: 20,
    theme: 'Plains',
    settingChanges: { fog: true },
    teams: [{ controller: 'human' }, { controller: 'human', general: 'Brisa' }, { controller: 'ai' }],
    firstTeam: 1,
  },
  turnSeconds: 120,
  waitingSeconds: 600,
});

const withMatch = (changes: Record<string, unknown>) => ({ ...valid(), match: { ...valid().match, ...changes } });

describe('lo que se pide al crear una sala', () => {
  it('acepta una escaramuza con relojes, y tambien solo la escaramuza', () => {
    expect(isRoomRequest(valid(), content)).toBe(true);
    expect(isRoomRequest({ match: { seed: 1, teams: [{ controller: 'human' }, { controller: 'ai' }] } }, content)).toBe(true);
  });

  it.each([
    ['nada', null],
    ['un campo de mas', { ...valid(), extra: 1 }],
    ['sin equipos', withMatch({ teams: [] })],
    ['un solo equipo', withMatch({ teams: [{ controller: 'human' }] })],
    ['cinco equipos', withMatch({ teams: Array.from({ length: 5 }, () => ({ controller: 'human' })) })],
    ['sin ninguna persona', withMatch({ teams: [{ controller: 'ai' }, { controller: 'ai' }] })],
    ['un controlador inventado', withMatch({ teams: [{ controller: 'bot' }, { controller: 'human' }] })],
    ['un general que no existe', withMatch({ teams: [{ controller: 'human', general: 'Nadie' }, { controller: 'ai' }] })],
    ['un tema que no existe', withMatch({ theme: 'Luna' })],
    ['un tamaño que no es de los mapas al azar', withMatch({ size: 17 })],
    ['una semilla con decimales', withMatch({ seed: 1.5 })],
    ['un primer equipo que no esta en la lista', withMatch({ firstTeam: 3 })],
    ['una regla que no existe', withMatch({ settingChanges: { turbo: true } })],
    ['una regla con un valor que no vale', withMatch({ settingChanges: { fog: 'si' } })],
    ['un reloj de turno demasiado corto', { ...valid(), turnSeconds: 5 }],
    ['una espera demasiado larga', { ...valid(), waitingSeconds: 1e9 }],
  ])('rechaza %s', (_what, request) => {
    expect(isRoomRequest(request, content)).toBe(false);
  });
});
