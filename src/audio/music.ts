/**
 * La musica: una sola pista sonando a la vez (como el Clip unico del original), "menu" en los menus y
 * en la partida la de su tema (generadas con `npm run sonidos`; si aun no esta, la "game" de siempre), en bucle. Con <audio> del navegador (sin motor de juego). Los navegadores no
 * dejan sonar nada hasta la primera tecla o clic: si aun no se puede, empieza con ella.
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';

export type MusicTrack = 'menu' | 'game' | 'game_plains' | 'game_desert' | 'game_forest' | 'game_swamp' | 'game_snowy';

/** La pista de batalla de cada tema (id de themes.json). */
const THEME_TRACKS: Readonly<Record<string, MusicTrack>> = {
  Plains: 'game_plains',
  Desert: 'game_desert',
  Forest: 'game_forest',
  Swamp: 'game_swamp',
  Snowy: 'game_snowy',
};
/** Si una pista no esta (aun no se ha elegido), suena esta. */
const FALLBACK_TRACKS: Readonly<Partial<Record<MusicTrack, MusicTrack>>> = {
  game_plains: 'game',
  game_desert: 'game',
  game_forest: 'game',
  game_swamp: 'game',
  game_snowy: 'game',
};

export const gameTrackOf = (themeId: string): MusicTrack => THEME_TRACKS[themeId] ?? 'game';

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
  audio.addEventListener('error', () => playFallback(track, audio), { once: true });
  void audio.play().catch(() => startOnFirstGesture(audio));
}

/** La pista no se ha podido bajar: si tiene sustituta y sigue tocandole, la sustituta. */
function playFallback(track: MusicTrack, audio: HTMLAudioElement): void {
  const fallback = FALLBACK_TRACKS[track];
  if (fallback && current?.audio === audio) playMusic(fallback, true);
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
