/**
 * Los ambientes con Web Audio: la implementacion de `LoopPort` (ambientNames.ts). Cada ambiente se baja y
 * decodifica una sola vez y todos sus emisores comparten el buffer (seis o siete por mapa, unos 40 MB en
 * memoria). Cada bucle empieza en un punto al azar y entra y sale con un fundido; con sitio, se apaga con
 * la distancia antes que los efectos (`AMBIENT_FALLOFF`). Sin ambiente en ajustes, no suena.
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';
import type { AmbientName, LoopHandle, LoopPort } from './ambientNames';
import { whenUnlocked, type Mixer } from './audioContext';
import { AMBIENT_FALLOFF, pannerAt, type Point3 } from './spatial';

/** Cuanto tarda un bucle en entrar y en salir (segundos). */
const FADE_SECONDS = 2.5;
/** Formatos, del preferido al de reserva (el OGG es Opus y no tiene el silencio del principio del MP3). */
const FORMATS = [
  { extension: 'ogg', type: 'audio/ogg; codecs=opus' },
  { extension: 'mp3', type: 'audio/mpeg' },
] as const;

const buffers = new Map<AmbientName, Promise<AudioBuffer | null>>();

/** El fichero del ambiente en el primer formato que sepa tocar el navegador (null si ninguno). */
function pathOf(name: AmbientName): string | null {
  const probe = document.createElement('audio');
  const playable = FORMATS.filter((format) => probe.canPlayType(format.type) !== '');
  const [path] = assetsAvailable(playable.map((format) => `assets/ambient/${name}.${format.extension}`));
  return path ?? null;
}

function bufferOf(context: AudioContext, name: AmbientName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const path = pathOf(name);
  const loading = path
    ? fetch(asset(path))
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(path))))
        .then((data) => context.decodeAudioData(data))
        .catch(() => null)
    : Promise.resolve(null);
  buffers.set(name, loading);
  return loading;
}

/** Un bucle sonando: su fuente y su volumen, para fundirlo al pararlo. */
interface Playing {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

function play(mixer: Mixer, buffer: AudioBuffer, at: Point3 | null, level: number): Playing {
  const { context } = mixer;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(level, context.currentTime + FADE_SECONDS);
  const faded = source.connect(gain);
  const placed = at ? faded.connect(pannerAt(context, at, AMBIENT_FALLOFF)) : faded;
  placed.connect(mixer.channels.ambience);
  source.start(0, Math.random() * buffer.duration);
  return { source, gain };
}

function fadeOut({ source, gain }: Playing, context: BaseAudioContext): void {
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
  source.stop(now + FADE_SECONDS);
}

/** Empieza `name` en cuanto pueda (el audio se abre con el primer gesto y el fichero tarda en bajar). */
function startLoop(name: AmbientName, at: Point3 | null, level: number): LoopHandle {
  let playing: Playing | null = null;
  let isStopped = !settings.ambience;
  whenUnlocked((mixer) => {
    if (isStopped) return;
    void bufferOf(mixer.context, name).then((buffer) => {
      if (buffer && !isStopped) playing = play(mixer, buffer, at, level);
    });
  });
  return {
    stop: () => {
      isStopped = true;
      if (playing) fadeOut(playing, playing.source.context);
      playing = null;
    },
  };
}

/** Los ambientes del juego, por Web Audio. */
export const webAudioLoops: LoopPort = { start: startLoop };
