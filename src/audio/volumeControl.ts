/**
 * Los volumenes de Opciones (volumes.ts) llegan a todo lo que suena: los canales de Web Audio
 * (audioContext.ts) y la musica, que va aparte con <audio> (music.ts). Tambien al esconder la pestaña y
 * al volver a ella, por «Silenciar en segundo plano».
 */
import { applyMixerVolumes } from './audioContext';
import { applyMusicVolume } from './music';

/** Todo lo que suena, a los volumenes de ahora. */
export function applyVolumes(): void {
  applyMixerVolumes();
  applyMusicVolume();
}

/** Al esconder la pestaña o volver a ella puede cambiar lo que suena (si se calla en segundo plano). */
export function followPageVisibility(): void {
  document.addEventListener('visibilitychange', applyVolumes);
}
