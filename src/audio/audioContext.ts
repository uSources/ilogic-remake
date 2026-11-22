/**
 * El unico `AudioContext` del juego y sus canales: efectos del tablero, ambiente, voces e interfaz, que
 * van todos al general (`master`). Cada canal suena a su volumen de serie por el que le da el jugador en
 * Opciones (volumes.ts) y por lo que pida la vista (el tablero baja al alejar la camara), para poder bajar
 * uno sin tocar los demas. Los navegadores no dejan sonar nada hasta la primera tecla o clic
 * (`unlockOnGesture`).
 */
import { settings } from '../settings';
import { gainOf, MIXER_CHANNELS, type Channel } from './volumes';

export type { Channel } from './volumes';

/** Volumen de cada canal con Opciones al maximo: el ambiente va por debajo de todo. */
const CHANNEL_VOLUMES: Readonly<Record<Channel, number>> = {
  effects: 0.8,
  ambience: 0.45,
  voices: 0.7,
  interface: 0.8,
};
/** Cuanto tarda un cambio de volumen en notarse (segundos), para que no chasquee. */
const VOLUME_SMOOTHING = 0.15;

export interface Mixer {
  readonly context: AudioContext;
  /** Por donde sale todo: el volumen general. */
  readonly master: GainNode;
  readonly channels: Readonly<Record<Channel, GainNode>>;
}

let mixer: Mixer | null = null;
/** Lo que pide la vista a cada canal ademas de Opciones, de 0 a 1 (1: nada que bajar). */
const viewLevels: Record<Channel, number> = { effects: 1, ambience: 1, voices: 1, interface: 1 };
const unlockListeners: Array<(mixer: Mixer) => void> = [];

/** El volumen general de ahora: el de Opciones, o nada con la pestaña escondida si asi se ha pedido. */
export function masterGain(): number {
  if (settings.muteInBackground && document.hidden) return 0;
  return gainOf(settings.volumes.master);
}

const channelGain = (channel: Channel): number => CHANNEL_VOLUMES[channel] * gainOf(settings.volumes[channel]) * viewLevels[channel];

function createMixer(context: AudioContext): Mixer {
  const master = context.createGain();
  master.gain.value = masterGain();
  master.connect(context.destination);
  const channelOf = (channel: Channel): GainNode => {
    const gain = context.createGain();
    gain.gain.value = channelGain(channel);
    gain.connect(master);
    return gain;
  };
  return {
    context,
    master,
    channels: {
      effects: channelOf('effects'),
      ambience: channelOf('ambience'),
      voices: channelOf('voices'),
      interface: channelOf('interface'),
    },
  };
}

/** Lleva `node` a `value` poco a poco. */
function glide(node: GainNode, value: number): void {
  node.gain.setTargetAtTime(value, node.context.currentTime, VOLUME_SMOOTHING);
}

/** El mezclador, creado la primera vez (null si el navegador no tiene Web Audio). */
export function audioMixer(): Mixer | null {
  if (mixer || typeof AudioContext === 'undefined') return mixer;
  mixer = createMixer(new AudioContext());
  return mixer;
}

/** El mezclador si ya puede sonar (tras el primer gesto); si no, null. */
export function runningMixer(): Mixer | null {
  return mixer?.context.state === 'running' ? mixer : null;
}

/** Pone el canal a `fraction` de lo que le da Opciones (1: todo), poco a poco. Pedir lo mismo no hace nada. */
export function setChannelLevel(channel: Channel, fraction: number): void {
  if (viewLevels[channel] === fraction) return;
  viewLevels[channel] = fraction;
  if (mixer) glide(mixer.channels[channel], channelGain(channel));
}

/** El general y cada canal, a lo que digan ahora Opciones y la pestaña (escondida o no). */
export function applyMixerVolumes(): void {
  if (!mixer) return;
  glide(mixer.master, masterGain());
  for (const channel of MIXER_CHANNELS) glide(mixer.channels[channel], channelGain(channel));
}

/** Llama a `listener` cuando el audio ya pueda sonar (en seguida, si ya puede). */
export function whenUnlocked(listener: (mixer: Mixer) => void): void {
  const running = runningMixer();
  if (running) listener(running);
  else unlockListeners.push(listener);
}

/** Abre el audio con la primera tecla o clic (antes el navegador no deja) y avisa a quien esperaba. */
export function unlockOnGesture(): void {
  const unlock = () => {
    const opened = audioMixer();
    if (!opened) return;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    void opened.context.resume().then(() => unlockListeners.splice(0).forEach((listener) => listener(opened)));
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}
