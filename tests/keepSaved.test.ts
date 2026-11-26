/**
 * El guardado solo de la partida 3D (view3d/systems/turn/saving.ts): con el autoguardado, al empezar
 * cada turno de la persona; sin el, solo al salir de la pagina. Con `localStorage` y `window` falsos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiController } from '@core/controllers';
import { createMatch, loadGame } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { GameSession, humanController, runMatch } from '@core/session';
import { duel } from '@core/teams';
import { settings } from '../src/settings';
import { readSave } from '../src/storage';
import { keepSaved } from '../src/view3d/systems/turn/saving';

const PERSON = 0;

/** Un `localStorage` en memoria: solo lo que usa el hueco de la partida guardada. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** Una escaramuza de la persona contra la IA que se guarda sola, sin empezar. */
function savedMatch(): GameSession {
  const s = createMatch(skirmishConfig({ seed: 4, size: 20, teams: duel('human', 'ai') }));
  const session = new GameSession(s, [humanController(), aiController()]);
  keepSaved(session, { team: PERSON });
  return session;
}

/** El dia de la partida guardada, o null si no hay ninguna. */
const savedDay = (): number | null => {
  const saved = readSave();
  return saved === null ? null : (loadGame(saved)?.day ?? null);
};

describe('el guardado solo de la partida 3D', () => {
  const autosaveBefore = settings.autosave;
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', new EventTarget());
  });
  afterEach(() => {
    settings.autosave = autosaveBefore;
    vi.unstubAllGlobals();
  });

  it('con el autoguardado, se guarda al empezar cada turno de la persona', () => {
    settings.autosave = true;
    const session = savedMatch();
    runMatch(session);
    expect(savedDay()).toBe(1);
    session.finishInput(PERSON);
    runMatch(session);
    expect(savedDay()).toBe(2);
    expect(loadGame(readSave()!)?.turnStarted).toBe(true);
  });

  it('sin el autoguardado, solo al salir de la pagina', () => {
    settings.autosave = false;
    runMatch(savedMatch());
    expect(savedDay()).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(savedDay()).toBe(1);
  });
});
