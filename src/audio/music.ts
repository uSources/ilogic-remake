/**
 * La musica: una sola pista sonando a la vez (como el Clip unico del original), "menu" en los menus y
 * "game" en la partida, en bucle. Con <audio> del navegador (sin motor de juego). Los navegadores no
 * dejan sonar nada hasta la primera tecla o clic: si aun no se puede, empieza con ella.
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';

export type MusicTrack = 'menu' | 'game';

const MUSIC_VOLUME = 0.6;
/** Formatos, del preferido al de reserva (el navegador usa el primero que sepa tocar). */
const FORMATS = [
  { extension: 'ogg', type: 'audio/ogg' },
  { extension: 'mp3', type: 'audio/mpeg' },
] as const;

let current: { track: MusicTrack; audio: HTMLAudioElement } | null = null;
let waitingForGesture: (() => void) | null = null;

/** Pone la pista `track` (si ya suena, sigue; con `restart`, vuelve a empezar). Sin musica en ajustes, para. */
export function playMusic(track: MusicTrack, restart = false): void {
  if (!settings.music) return stopMusic();
  if (current?.track === track && !current.audio.paused && !restart) return;
  stopMusic();
  const audio = audioFor(track);
  if (!audio) return;
  current = { track, audio };
  void audio.play().catch(() => startOnFirstGesture(audio));
}

export function stopMusic(): void {
  cancelGestureWait();
  current?.audio.pause();
  current = null;
}

/** El <audio> de una pista en el primer formato que sepa tocar el navegador (null si ninguno). */
function audioFor(track: MusicTrack): HTMLAudioElement | null {
  const probe = document.createElement('audio');
  const paths = assetsAvailable(FORMATS.map((format) => `assets/music/${track}.${format.extension}`));
  const path = paths.find((candidate) => FORMATS.some((format) => candidate.endsWith(format.extension) && probe.canPlayType(format.type)));
  if (!path) return null;
  const audio = new Audio(asset(path));
  audio.loop = true;
  audio.volume = MUSIC_VOLUME;
  return audio;
}

function startOnFirstGesture(audio: HTMLAudioElement): void {
  cancelGestureWait();
  const start = () => {
    cancelGestureWait();
    if (current?.audio === audio) void audio.play().catch(() => undefined);
  };
  waitingForGesture = start;
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}

function cancelGestureWait(): void {
  if (!waitingForGesture) return;
  window.removeEventListener('pointerdown', waitingForGesture);
  window.removeEventListener('keydown', waitingForGesture);
  waitingForGesture = null;
}
