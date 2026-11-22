/**
 * Los efectos de sonido (disparos, pasos, menus...) con Web Audio: la implementacion de `SoundPort`
 * (sounds.ts). Los hace Ashfox (tools/art/ashfox/sounds.mjs) o la IA (tools/audio) y se guardan en WAV.
 * Suenan con Web Audio para que varios se mezclen sin cortarse; cada sonido tiene variantes y cada vez
 * se elige una al azar, para que no suene siempre igual. Lo del tablero suena desde su sitio
 * (`playSoundAt`, spatial.ts); lo de la interfaz, sin sitio. Se pide por nombre: si aun no hay WAV,
 * suena su sustituto (soundNames.ts).
 */
import { asset, assetsAvailable } from '../assets';
import { settings } from '../settings';
import { audioMixer, runningMixer, unlockOnGesture, whenUnlocked, type Channel, type Mixer } from './audioContext';
import { SOUND_NAMES, resolveSound, type SoundId, type SoundName } from './soundNames';
import { SOUND_IDS, type SoundPort } from './sounds';
import { SOUND_VARIANTS } from './soundList';
import { pannerAt, type Point3 } from './spatial';
import { isAudible, type VolumeChannel } from './volumes';

/** Un mismo sonido no se repite antes de esto (segundos): dos a la vez solo suenan mas fuerte. */
const MIN_GAP = 0.04;
/** Los que salen a rafagas (pasar por encima, el cursor, la rueda): mas separados, para que no zumben. */
const MIN_GAPS: Partial<Record<SoundName, number>> = {
  ui_hover: 0.07,
  buy_hover: 0.07,
  cursor_tick: 0.06,
  path_tick: 0.06,
  zoom_tick: 0.09,
};
/** Entre dos voces de juguete, al menos esto (segundos): nunca una encima de otra ni una tras cada clic. */
const VOICE_GAP = 1.5;
/** Lo pedido antes de que el navegador deje sonar suena al abrirse el audio, si no es mas viejo que esto (ms). */
const PENDING_MAX_AGE_MS = 2000;
/** Cuantos se recuerdan para `recentSounds` (comprobar sin oir, docs/AGENTES.md). */
const RECENT_LIMIT = 40;
/** Entre dos muestras de volumen, al menos esto (segundos): mantener la flecha no hace una rafaga. */
const PREVIEW_GAP = 0.15;
/**
 * Lo que suena al mover el volumen de cada canal en Opciones, para oir como queda, y por donde. La del
 * general va directa al general: asi se oye aunque la interfaz este callada. La musica y el ambiente no
 * llevan: ya suenan solos.
 */
const PREVIEW_SOUNDS: Readonly<Record<VolumeChannel, { name: SoundName; channel: Output } | null>> = {
  master: { name: 'ui_select', channel: 'master' },
  music: null,
  effects: { name: 'shot_rifle', channel: 'effects' },
  ambience: null,
  voices: { name: 'voice_ack_infantry', channel: 'voices' },
  interface: { name: 'ui_select', channel: 'interface' },
};

/** Un efecto pedido: que nombre, que sono de verdad (null: nada) y desde donde. */
export interface HeardSound {
  readonly name: SoundName;
  readonly played: SoundId | null;
  readonly at: Point3 | null;
}

const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundId, number>();
const recent: HeardSound[] = [];
let lastVoiceAt = -Infinity;
let lastPreviewAt = -Infinity;
let pending: { name: SoundName; at: Point3 | null; askedAt: number } | null = null;

/** Por donde sale un sonido: un canal, o directo al general (la muestra de su volumen). */
type Output = Channel | 'master';

const outputOf = (mixer: Mixer, output: Output): GainNode => (output === 'master' ? mixer.master : mixer.channels[output]);

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

/** Las voces van por su canal; lo que tiene sitio es del tablero, y lo que no, de la interfaz. */
const channelOf = (name: SoundName, at: Point3 | null): Channel => (name.startsWith('voice_') ? 'voices' : at ? 'effects' : 'interface');

/** Que suene `name` (una de sus variantes) en `at`, o sin sitio con null. Con su canal callado en Opciones, nada. */
export function playSoundAt(name: SoundName, at: Point3 | null): void {
  if (!isAudible(settings.volumes, channelOf(name, at))) return;
  const played = resolveSound(name);
  remember({ name, played, at });
  const mixer = runningMixer();
  if (mixer) playNow(mixer, name, played, at);
  else pending = { name, at, askedAt: performance.now() };
}

/** Suena ya `played` (lo que sale de `name`), salvo que acabe de sonar. */
function playNow(mixer: Mixer, name: SoundName, played: SoundId | null, at: Point3 | null): void {
  if (!played || tooSoon(name, played, mixer.context.currentTime)) return;
  playVariant(mixer, played, channelOf(name, at), at);
}

/** Una variante de `sound` al azar, por `channel` (en cuanto este bajada). */
function playVariant(mixer: Mixer, sound: SoundId, channel: Output, at: Point3 | null): void {
  const [path] = assetsAvailable([pathOf(sound, randomVariant(sound))]);
  if (!path) return;
  void bufferOf(mixer.context, path).then((buffer) => buffer && start(mixer, buffer, channel, at));
}

/** Una muestra de `volume` (Opciones), para oir como queda; si se acaba de oir otra, no. */
export function previewVolume(volume: VolumeChannel): void {
  const preview = PREVIEW_SOUNDS[volume];
  const mixer = runningMixer();
  if (!preview || !mixer || !isAudible(settings.volumes, preview.channel)) return;
  const played = resolveSound(preview.name);
  const now = mixer.context.currentTime;
  if (!played || now - lastPreviewAt < PREVIEW_GAP) return;
  lastPreviewAt = now;
  playVariant(mixer, played, preview.channel, null);
}

/** Si `name` acaba de sonar (o, si es una voz, otra voz); si no, apunta que suena ahora. */
function tooSoon(name: SoundName, sound: SoundId, now: number): boolean {
  const isVoice = name.startsWith('voice_');
  const last = lastPlayed.get(sound);
  const isRepeat = last !== undefined && now - last < (MIN_GAPS[name] ?? MIN_GAP);
  if (isRepeat || (isVoice && now - lastVoiceAt < VOICE_GAP)) return true;
  lastPlayed.set(sound, now);
  if (isVoice) lastVoiceAt = now;
  return false;
}

function start(mixer: Mixer, buffer: AudioBuffer, channel: Output, at: Point3 | null): void {
  const source = mixer.context.createBufferSource();
  source.buffer = buffer;
  const output = outputOf(mixer, channel);
  if (at) source.connect(pannerAt(mixer.context, at)).connect(output);
  else source.connect(output);
  source.start();
}

function remember(heard: HeardSound): void {
  recent.push(heard);
  if (recent.length > RECENT_LIMIT) recent.shift();
}

/** Los ultimos efectos pedidos, del mas viejo al mas nuevo (para comprobar sin oir). */
export const recentSounds = (): readonly HeardSound[] => [...recent];

/** Descarga los sonidos de antemano, para que el primero de cada uno no llegue tarde. */
function preload(audio: AudioContext): void {
  for (const sound of SOUND_IDS)
    for (let variant = 1; variant <= SOUND_VARIANTS[sound]; variant++) {
      const [path] = assetsAvailable([pathOf(sound, variant)]);
      if (path) void bufferOf(audio, path);
    }
}

/**
 * Lo que se pidio justo antes de poder sonar (el "TU TURNO" al cargar la partida) suena al abrirse el
 * audio. Ya esta en `recent` desde que se pidio.
 */
function playPending(mixer: Mixer): void {
  const request = pending;
  pending = null;
  if (request && performance.now() - request.askedAt <= PENDING_MAX_AGE_MS)
    playNow(mixer, request.name, resolveSound(request.name), request.at);
}

/** Los efectos del juego sin sitio (menus, interfaz), por Web Audio. */
export const webAudioSounds: SoundPort = { play: (sound) => playSoundAt(sound, null) };

const isSoundName = (value: string | undefined): value is SoundName => !!value && (SOUND_NAMES as string[]).includes(value);

/** El sonido de un boton: el de su `data-sound` si lo lleva (Atras, una pestaña...), si no `ui_select`. */
function buttonSound(target: EventTarget | null): SoundName | null {
  const button = target instanceof Element ? target.closest('button') : null;
  if (!button) return null;
  const declared = button.dataset.sound;
  return isSoundName(declared) ? declared : 'ui_select';
}

/**
 * Prepara los efectos: el audio se abre con la primera tecla o clic (antes el navegador no deja) y los
 * botones de la interfaz suenan al pulsarlos.
 */
export function installSounds(): void {
  audioMixer();
  unlockOnGesture();
  whenUnlocked((mixer) => {
    preload(mixer.context);
    playPending(mixer);
  });
  document.addEventListener('click', (event) => {
    const sound = buttonSound(event.target);
    if (sound) webAudioSounds.play(sound);
  });
  installHoverSound();
}

/** Pasar el raton por encima de un boton (otro que el de antes) hace un tic flojo; con el dedo, no. */
function installHoverSound(): void {
  let hovered: HTMLButtonElement | null = null;
  document.addEventListener('pointerover', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button === hovered) return;
    hovered = button;
    if (button && !button.disabled && event.pointerType === 'mouse') webAudioSounds.play('ui_hover');
  });
}
