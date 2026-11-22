/**
 * La musica: una sola pista sonando a la vez (como el Clip unico del original), "menu" en los menus y
 * en la partida la de su tema (generadas con `npm run sonidos`; si aun no esta, la "game" de siempre), en bucle. Con <audio> del navegador (sin motor de juego). Los navegadores no
 * dejan sonar nada hasta la primera tecla o clic: si aun no se puede, empieza con ella.
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';
import { masterGain } from './audioContext';
import { gainOf, isAudible } from './volumes';

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

/** La musica con Opciones al maximo: por debajo de los efectos. */
const MUSIC_VOLUME = 0.6;
/** Formatos, del preferido al de reserva (el navegador usa el primero que sepa tocar). */
const FORMATS = [
  { extension: 'ogg', type: 'audio/ogg' },
  { extension: 'mp3', type: 'audio/mpeg' },
] as const;

let current: { track: MusicTrack; audio: HTMLAudioElement } | null = null;
/** La pista que toca (la del menu o la de la partida), suene o no: al volver a subir la musica, esa. */
let wantedTrack: MusicTrack | null = null;
let waitingForGesture: (() => void) | null = null;

/** Lo que suena la musica ahora: Opciones (general y musica) y si la pestaña esta escondida. */
const musicVolume = (): number => MUSIC_VOLUME * masterGain() * gainOf(settings.volumes.music);

/**
 * Pone la pista `track` (si ya suena, sigue; con `restart`, vuelve a empezar). Con la musica o el general
 * callados en Opciones no suena (ni se baja), pero se recuerda para cuando se suban.
 */
export function playMusic(track: MusicTrack, restart = false): void {
  wantedTrack = track;
  startTrack(track, restart);
}

/** Hace sonar `track` sin cambiar la elegida (la sustituta suena en su lugar, pero la elegida sigue siendo la otra). */
function startTrack(track: MusicTrack, restart = false): void {
  if (!isAudible(settings.volumes, 'music')) return stopMusic();
  if (current?.track === track && !current.audio.paused && !restart) return applyMusicVolume();
  stopMusic();
  const audio = audioFor(track);
  if (!audio) return startFallback(track);
  current = { track, audio };
  audio.addEventListener('error', () => current?.audio === audio && startFallback(track), { once: true });
  void audio.play().catch(() => startOnFirstGesture(audio));
}

/**
 * La sustituta de `track`, si tiene. Suena cuando la suya no esta (en la version de un fichero solo va lo
 * que hay) o no se ha podido bajar (en la web).
 */
function startFallback(track: MusicTrack): void {
  const fallback = FALLBACK_TRACKS[track];
  if (fallback) startTrack(fallback, true);
}

/**
 * La musica, a los volumenes de ahora: callada en Opciones, para; si vuelve a oirse, empieza la que
 * tocaba. Tambien pone `muted`: en el iPhone el volumen de un <audio> no se puede cambiar, pero callarlo si.
 */
export function applyMusicVolume(): void {
  if (!isAudible(settings.volumes, 'music')) return stopMusic();
  if (!current) {
    if (wantedTrack) startTrack(wantedTrack);
    return;
  }
  const volume = musicVolume();
  current.audio.volume = volume;
  current.audio.muted = volume === 0;
}

function stopMusic(): void {
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
  audio.volume = musicVolume();
  audio.muted = audio.volume === 0;
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
