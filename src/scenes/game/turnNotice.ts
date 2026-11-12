/**
 * Avisar de que vuelve a tocar a la persona cuando no esta mirando (una partida por la red: los demas
 * tardan lo que tardan): el titulo de la pestaña cambia hasta que vuelve, y suena un toque corto si
 * la musica esta activada (el unico ajuste de sonido que hay). Sin ficheros de sonido: dos notas con
 * el contexto de audio de Phaser.
 */
import type Phaser from 'phaser';
import { settings, t } from '../../settings';

const ORIGINAL_TITLE = typeof document === 'undefined' ? '' : document.title;
/** Las dos notas del aviso (Hz) y lo que dura cada una. */
const CHIME_NOTES = [660, 880];
const CHIME_NOTE_MS = 120;
const CHIME_GAIN = 0.08;

let isListening = false;

/** El titulo vuelve a ser el de siempre en cuanto la persona vuelve a la pestaña. */
function listenForReturn(): void {
  if (isListening || typeof document === 'undefined') return;
  isListening = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) restoreTitle();
  });
}

export function restoreTitle(): void {
  if (typeof document !== 'undefined' && ORIGINAL_TITLE) document.title = ORIGINAL_TITLE;
}

/** Le toca a la persona: si no mira la pestaña, el titulo lo dice y suena el aviso. */
export function notifyTurn(scene: Phaser.Scene): void {
  if (typeof document === 'undefined' || !document.hidden) return;
  listenForReturn();
  document.title = t('onlineYourTurnTitle');
  if (settings.music) chime(scene);
}

/** Dos notas cortas con el contexto de audio de Phaser (si es WebAudio y esta desbloqueado). */
function chime(scene: Phaser.Scene): void {
  const manager = scene.sound as Phaser.Sound.BaseSoundManager & { context?: AudioContext };
  const context = manager.context;
  if (!context || manager.locked) return;
  CHIME_NOTES.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + (index * CHIME_NOTE_MS) / 1000;
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(CHIME_GAIN, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + CHIME_NOTE_MS / 1000);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + CHIME_NOTE_MS / 1000);
  });
}
