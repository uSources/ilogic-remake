/**
 * Lo que cambia segun la clase de sonido: el estilo que se le pide al modelo, cuanto de mas se genera,
 * como se deja listo para el juego y en que carpeta acaba. Cambiar el estilo de todo el juego es tocar
 * `style` aqui (docs/PLAN-SONIDO.md, "Estilo").
 */
import type { SoundKind, SoundSpec } from './catalog';
import { fadeOut, limitLength, loopWithCrossfade, normalizePeak, normalizeRms, secondsOf, trimEnd, trimStart, type Pcm } from './shaping';
import type { DecodeFormat } from './wavFile';

/** Carpetas de public/assets: los efectos en WAV; el resto, en OGG (Opus) y MP3. */
export type SoundFolder = 'sfx' | 'ambient' | 'music';

export interface KindSettings {
  /** Lo que se añade al texto de cada sonido de la clase. */
  readonly style: string;
  /** Lo que se genera de mas: para que quepa la cola, o para fundir el final del bucle con el principio. */
  readonly extraSeconds: number;
  readonly decode: DecodeFormat;
  readonly shape: (pcm: Pcm, spec: SoundSpec) => Pcm;
  readonly folder: SoundFolder;
}

const PEAK_DB = -1;
/** Lo que se funde el final de un bucle con su principio. */
const AMBIENT_CROSSFADE_SECONDS = 2;
const MUSIC_CROSSFADE_SECONDS = 3;
/** Todos los ambientes igual de fuertes: el juego los pone debajo de todo con su propio volumen. */
const AMBIENT_RMS_DB = -24;
/** Un efecto puede durar algo mas de lo pedido si su cola se sigue oyendo. */
const EFFECT_LENGTH_ALLOWANCE = 1.5;
const EFFECT_FADE_SHARE = 0.15;
const MIN_FADE_SECONDS = 0.01;
const JINGLE_FADE_SECONDS = 0.5;

/** Por debajo del pico, lo que cuenta como silencio delante y detras. */
const SILENCE_BEFORE_DB = 40;
const SILENCE_AFTER_DB = 50;
const MUSIC_SILENCE_DB = 60;

/**
 * Los efectos, las voces y los del campo como los de Ashfox: mono a 48 kHz. Los ambientes de zona, en mono: suenan
 * desde un sitio del mapa y el juego los coloca. Lo demas se queda en estereo a 44,1 kHz (lo que da el modelo).
 */
const MONO_48K: DecodeFormat = { channelCount: 1, sampleRate: 48000 };
const MONO_44K: DecodeFormat = { channelCount: 1, sampleRate: 44100 };
const STEREO_44K: DecodeFormat = { channelCount: 2, sampleRate: 44100 };

function shapeEffect(pcm: Pcm, spec: SoundSpec): Pcm {
  const trimmed = trimEnd(trimStart(pcm, SILENCE_BEFORE_DB), SILENCE_AFTER_DB);
  // Si el limite cae en un silencio (entre un pitido y el siguiente que sobra), ese silencio tambien sobra.
  const limited = trimEnd(limitLength(trimmed, spec.seconds * EFFECT_LENGTH_ALLOWANCE), SILENCE_AFTER_DB);
  const fadeSeconds = Math.max(MIN_FADE_SECONDS, secondsOf(limited) * EFFECT_FADE_SHARE);
  return normalizePeak(fadeOut(limited, fadeSeconds), spec.peakDb ?? PEAK_DB);
}

const shapeAmbient = (pcm: Pcm): Pcm => normalizeRms(loopWithCrossfade(pcm, AMBIENT_CROSSFADE_SECONDS), AMBIENT_RMS_DB, PEAK_DB);

const shapeMusic = (pcm: Pcm): Pcm => normalizePeak(loopWithCrossfade(trimStart(pcm, MUSIC_SILENCE_DB), MUSIC_CROSSFADE_SECONDS), PEAK_DB);

function shapeJingle(pcm: Pcm): Pcm {
  const trimmed = trimEnd(trimStart(pcm, MUSIC_SILENCE_DB), MUSIC_SILENCE_DB);
  return normalizePeak(fadeOut(trimmed, JINGLE_FADE_SECONDS), PEAK_DB);
}

/**
 * Las voces de los muñecos: ni chillonas ni de pito (asi eran las primeras y no gustaron), sino un
 * balbuceo de muñeco con su gracia, sin palabras. Tambien se probo todo por walkie-talkie: sale apagado
 * (casi nada por encima de 1,5 kHz) y con el tono inestable; solo lo lleva el piloto, en su texto.
 */
const VOICE_STYLE =
  'Vocal sound effect of a small cartoon toy figure for a toy soldiers strategy game, warm mid-pitched gibberish babble like a video game character, expressive, unintelligible with no real words, close-up, dry, no music';

/** Juguetes de bloques en una isla (docs/ESTETICA.md): guerra de juguete, con pegada y sin realismo duro. */
const MUSIC_STYLE =
  'Instrumental background music for a toy soldiers strategy game, light orchestral military band with snare drums, brass and woodwinds, playful but determined, steady tempo, seamless loop';

export const KINDS: Readonly<Record<SoundKind, KindSettings>> = {
  sfx: {
    style: 'Stylized sound effect for a toy soldiers strategy game, clean and punchy, close-up, dry, no music, no voices',
    extraSeconds: 1,
    decode: MONO_48K,
    shape: shapeEffect,
    folder: 'sfx',
  },
  voice: {
    style: VOICE_STYLE,
    extraSeconds: 1,
    decode: MONO_48K,
    shape: shapeEffect,
    folder: 'sfx',
  },
  nature: {
    style: 'Natural outdoor sound effect in a calm toy diorama landscape, clear and natural, no music, no human voices',
    extraSeconds: 1,
    decode: MONO_48K,
    shape: shapeEffect,
    folder: 'sfx',
  },
  zone: {
    style: 'Soft ambience from one spot of a toy diorama landscape, smooth, airy and even, no music, no voices',
    extraSeconds: AMBIENT_CROSSFADE_SECONDS,
    decode: MONO_44K,
    shape: shapeAmbient,
    folder: 'ambient',
  },
  ambient: {
    style: 'Soft wide background ambience for a miniature toy diorama, calm and even, no music, no voices',
    extraSeconds: AMBIENT_CROSSFADE_SECONDS,
    decode: STEREO_44K,
    shape: shapeAmbient,
    folder: 'ambient',
  },
  music: { style: MUSIC_STYLE, extraSeconds: MUSIC_CROSSFADE_SECONDS + 1, decode: STEREO_44K, shape: shapeMusic, folder: 'music' },
  jingle: {
    style: 'Short instrumental music sting for a toy soldiers strategy game, military band with brass and snare drum',
    extraSeconds: 2,
    decode: STEREO_44K,
    shape: shapeJingle,
    folder: 'music',
  },
};

/** Efectos y voces van al juego como variantes (`<id>_<n>.wav`); ambientes y musica, un bucle o una pista. */
export const isEffect = (spec: SoundSpec): boolean => KINDS[spec.kind].folder === 'sfx';

/** El texto que se le da al modelo: lo que suena, el estilo y la duracion, como se entreno ("Length: N seconds"). */
export function promptFor(spec: SoundSpec): string {
  const lengthSeconds = Math.max(1, Math.round(spec.seconds));
  return `${spec.prompt}. ${KINDS[spec.kind].style}. Length: ${lengthSeconds} seconds`;
}

/** Lo que se genera (ComfyUI no baja de un segundo). */
export const generatedSecondsFor = (spec: SoundSpec): number => Math.max(1, spec.seconds + KINDS[spec.kind].extraSeconds);
