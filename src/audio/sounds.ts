/**
 * Los efectos de sonido como los ve el juego: un nombre y un puerto para pedirlo, sin Web Audio.
 * Quien decide que suena (los menus, el turno, los sucesos) depende de `SoundPort`; quien lo hace
 * sonar es `sfx.ts` (Web Audio) y en los tests, uno falso. La raiz de composicion (`view3d/app/main.ts`)
 * junta los dos.
 */
import { SOUND_VARIANTS } from './soundList';

export type SoundId = keyof typeof SOUND_VARIANTS;

/** Pedir que suene un efecto. Si no puede (ajustes, navegador), no pasa nada. */
export interface SoundPort {
  play(sound: SoundId): void;
}

/** Un puerto que no suena nunca. */
export const SILENCE: SoundPort = { play: () => {} };

export const SOUND_IDS = Object.keys(SOUND_VARIANTS) as SoundId[];
