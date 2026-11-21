/**
 * Los efectos de sonido como los ve el juego: un nombre y un puerto para pedirlo, sin Web Audio.
 * Quien decide que suena (los menus, el turno, los sucesos) depende de `SoundPort`; quien lo hace
 * sonar es `sfx.ts` (Web Audio) y en los tests, uno falso. La raiz de composicion (`view3d/app/main.ts`)
 * junta los dos. Se pide por nombre (`SoundName`), haya o no WAV todavia: ver soundNames.ts.
 */
import { SOUND_VARIANTS } from './soundList';
import type { SoundId, SoundName } from './soundNames';

export type { SoundId, SoundName } from './soundNames';

/** Pedir que suene un efecto. Si no puede (ajustes, navegador), no pasa nada. */
export interface SoundPort {
  play(sound: SoundName): void;
}

export const SOUND_IDS = Object.keys(SOUND_VARIANTS) as SoundId[];
