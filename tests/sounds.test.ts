import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_IDS } from '../src/audio/sounds';
import { SOUND_VARIANTS } from '../src/audio/soundList';
import { captureSound, endSound, menuSound, shotSound, STEP_SOUNDS } from '../src/view3d/soundCues';

const MOTIONS = ['march', 'drive', 'fly'] as const;

describe('efectos de sonido', () => {
  it('cada sonido tiene todos sus WAV', () => {
    const missing = SOUND_IDS.flatMap((sound) =>
      Array.from({ length: SOUND_VARIANTS[sound] }, (_, index) => `public/assets/sfx/${sound}_${index + 1}.wav`),
    ).filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });

  it('los vehiculos disparan cañon de cerca y artilleria en arco; los demas, igual a cualquier distancia', () => {
    expect([shotSound('drive', false), shotSound('drive', true)]).toEqual(['shot_cannon', 'shot_artillery']);
    expect(shotSound('march', true)).toBe(shotSound('march', false));
    expect(shotSound('fly', true)).toBe(shotSound('fly', false));
  });

  it('cada forma de moverse tiene su paso, distinto de las demas', () => {
    expect(new Set(MOTIONS.map((motion) => STEP_SOUNDS[motion])).size).toBe(MOTIONS.length);
  });

  it('la captura acabada, la victoria y los menus suenan distinto de lo demas', () => {
    expect(captureSound(true)).not.toBe(captureSound(false));
    expect(endSound(true)).not.toBe(endSound(false));
    expect(menuSound({ kind: 'move', dx: 1, dy: 0 })).toBe('ui_move');
    expect(menuSound({ kind: 'back' })).toBe('ui_back');
    expect(menuSound({ kind: 'help' })).toBeUndefined();
  });
});
