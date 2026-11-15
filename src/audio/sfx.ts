/**
 * Los efectos de sonido (disparos, pasos, menus...) con Web Audio: la implementacion de `SoundPort`
 * (sounds.ts). Los hace Ashfox (tools/art/ashfox/sounds.mjs) y se guardan en WAV. Suenan con Web Audio para que varios se mezclen sin cortarse; cada sonido tiene
 * variantes y cada vez se elige una al azar, para que no suene siempre igual. Los navegadores no dejan
 * sonar nada hasta la primera tecla o clic: lo que se pide antes no suena.
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';
import { SOUND_IDS, type SoundId, type SoundPort } from './sounds';
import { SOUND_VARIANTS } from './soundList';

const SFX_VOLUME = 0.8;
/** Un mismo sonido no se repite antes de esto (segundos): dos a la vez solo suenan mas fuerte. */
const MIN_GAP = 0.04;

let context: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundId, number>();

/** El audio del navegador, creado la primera vez (null si no hay Web Audio). */
function audioContext(): AudioContext | null {
  if (context || typeof AudioContext === 'undefined') return context;
  context = new AudioContext();
  return context;
}

const pathOf = (sound: SoundId, variant: number): string => `assets/sfx/${sound}_${variant}.wav`;

/** El sonido ya decodificado (se baja la primera vez que suena; null si no esta o no se entiende). */
function bufferOf(audio: AudioContext, path: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(path);
  if (cached) return cached;
  const loading = fetch(asset(path))
    .then((response) => response.arrayBuffer())
    .then((data) => audio.decodeAudioData(data))
    .catch(() => null);
  buffers.set(path, loading);
  return loading;
}

const randomVariant = (sound: SoundId): number => 1 + Math.floor(Math.random() * SOUND_VARIANTS[sound]);

/** Que suene `sound` (una de sus variantes). Sin efectos en ajustes, o si el navegador aun no deja, no hace nada. */
function playSound(sound: SoundId): void {
  if (!settings.sfx) return;
  const audio = audioContext();
  if (!audio || audio.state !== 'running' || tooSoon(sound, audio.currentTime)) return;
  const [path] = assetsAvailable([pathOf(sound, randomVariant(sound))]);
  if (!path) return;
  void bufferOf(audio, path).then((buffer) => buffer && start(audio, buffer));
}

function tooSoon(sound: SoundId, now: number): boolean {
  const last = lastPlayed.get(sound);
  if (last !== undefined && now - last < MIN_GAP) return true;
  lastPlayed.set(sound, now);
  return false;
}

function start(audio: AudioContext, buffer: AudioBuffer): void {
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = SFX_VOLUME;
  source.connect(gain).connect(audio.destination);
  source.start();
}

/** Descarga los sonidos de antemano, para que el primero de cada uno no llegue tarde. */
function preload(audio: AudioContext): void {
  for (const sound of SOUND_IDS)
    for (let variant = 1; variant <= SOUND_VARIANTS[sound]; variant++) {
      const [path] = assetsAvailable([pathOf(sound, variant)]);
      if (path) void bufferOf(audio, path);
    }
}

/** Los efectos del juego, por Web Audio. */
export const webAudioSounds: SoundPort = { play: playSound };

/**
 * Prepara los efectos: el audio se abre con la primera tecla o clic (antes el navegador no deja) y los
 * botones de la interfaz suenan al pulsarlos.
 */
export function installSounds(): void {
  const unlock = () => {
    const audio = audioContext();
    if (!audio) return;
    void audio.resume().then(() => preload(audio));
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) webAudioSounds.play('ui_select');
  });
}
