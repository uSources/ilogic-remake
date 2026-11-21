import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_IDS } from '../src/audio/sounds';
import { SOUND_VARIANTS } from '../src/audio/soundList';
import { defaultContent } from '@core/content/default';
import {
  captureSound,
  endSound,
  hitSound,
  menuSound,
  stepSounds,
  surfaceOf,
  UNIT_SOUND_TYPES,
  unitSounds,
} from '../src/view3d/systems/sound/soundCues';
import { blankState } from './helpers';

describe('efectos de sonido', () => {
  it('cada sonido tiene todos sus WAV', () => {
    const missing = SOUND_IDS.flatMap((sound) =>
      Array.from({ length: SOUND_VARIANTS[sound] }, (_, index) => `public/assets/sfx/${sound}_${index + 1}.wav`),
    ).filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });

  it('cada unidad tiene sus sonidos, y solo dispara la que ataca', () => {
    const units = defaultContent().units.list;
    expect(new Set(UNIT_SOUND_TYPES)).toEqual(new Set(units.map((unit) => unit.id)));
    for (const unit of units) expect(unitSounds(unit.id, unit.motion).shot === null, unit.id).toBe(unit.attack === null);
  });

  it('cada arma suena a lo suyo: el bazuca no es un fusil ni el helicoptero un avion', () => {
    expect(unitSounds('BSoldier', 'march').shot).not.toBe(unitSounds('Soldier', 'march').shot);
    expect(unitSounds('THelicopter', 'fly').step).not.toBe(unitSounds('Fighter', 'fly').step);
    expect(unitSounds('Unknown', 'drive')).toEqual(unitSounds('Unknown', 'drive'));
  });

  it('a pie, el paso de cada suelo; con ruedas, el motor y lo que añada el suelo', () => {
    const soldier = unitSounds('Soldier', 'march');
    const tank = unitSounds('Tank', 'drive');
    expect(stepSounds(soldier, 'march', 'sand')).toEqual(['step_sand']);
    expect(stepSounds(soldier, 'march', 'shallow')).toEqual(['step_wade']);
    expect(stepSounds(tank, 'drive', 'grass')).toEqual(['step_tracks']);
    expect(stepSounds(tank, 'drive', 'mud')).toEqual(['step_tracks', 'step_mud']);
    expect(stepSounds(unitSounds('Fighter', 'fly'), 'fly', 'water')).toEqual(['step_jet']);
  });

  it('el suelo: el de su terreno, pavimento en los edificios y barro con lluvia', () => {
    const s = blankState();
    s.map[4]![4] = 'Woods';
    s.buildings.push({ type: 'City', x: 6, y: 6, owner: null } as (typeof s.buildings)[number]);
    expect(surfaceOf(s, { x: 4, y: 4 })).toBe('leaves');
    expect(surfaceOf(s, { x: 6, y: 6 })).toBe('concrete');
    s.weather = { ...s.weather!, kind: 'Rain' } as NonNullable<typeof s.weather>;
    expect(surfaceOf(s, { x: 4, y: 4 })).toBe('mud');
  });

  it('el golpe segun a quien le da, y el que no hace nada falla', () => {
    expect(new Set([hitSound('march', 10), hitSound('drive', 10), hitSound('fly', 10)]).size).toBe(3);
    expect(hitSound('drive', 0)).toBe('shot_miss');
  });

  it('la captura acabada, la victoria y los menus suenan distinto de lo demas', () => {
    expect(captureSound(true)).not.toBe(captureSound(false));
    expect(endSound(true)).not.toBe(endSound(false));
    expect(menuSound({ kind: 'move', dx: 1, dy: 0 })).toBe('ui_move');
    expect(menuSound({ kind: 'back' })).toBe('ui_back');
    expect(menuSound({ kind: 'help' })).toBeUndefined();
  });
});
