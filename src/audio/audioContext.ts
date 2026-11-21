/**
 * El unico `AudioContext` del juego y sus canales: efectos del tablero, ambiente, voces e interfaz, que
 * van todos a `master`. Cada canal tiene su volumen, para poder bajar uno (el tablero al alejar la camara)
 * sin tocar los demas. Los navegadores no dejan sonar nada hasta la primera tecla o clic (`unlockOnGesture`).
 */
export type Channel = 'effects' | 'ambience' | 'voices' | 'interface';

/** Volumen de cada canal: el ambiente va por debajo de todo. */
const CHANNEL_VOLUMES: Readonly<Record<Channel, number>> = {
  effects: 0.8,
  ambience: 0.45,
  voices: 0.7,
  interface: 0.8,
};
/** Cuanto tarda un cambio de volumen de canal en notarse (segundos), para que no chasquee. */
const VOLUME_SMOOTHING = 0.15;

export interface Mixer {
  readonly context: AudioContext;
  readonly channels: Readonly<Record<Channel, GainNode>>;
}

let mixer: Mixer | null = null;
/** El ultimo volumen pedido a cada canal: pedir el mismo cada fotograma no programa nada. */
const requestedLevels = new Map<Channel, number>();
const unlockListeners: Array<(mixer: Mixer) => void> = [];

function createMixer(context: AudioContext): Mixer {
  const master = context.createGain();
  master.connect(context.destination);
  const channelOf = (channel: Channel): GainNode => {
    const gain = context.createGain();
    gain.gain.value = CHANNEL_VOLUMES[channel];
    gain.connect(master);
    return gain;
  };
  return {
    context,
    channels: {
      effects: channelOf('effects'),
      ambience: channelOf('ambience'),
      voices: channelOf('voices'),
      interface: channelOf('interface'),
    },
  };
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

/** Pone el canal a `fraction` de su volumen de serie (1: el de siempre), poco a poco. */
export function setChannelLevel(channel: Channel, fraction: number): void {
  if (!mixer || requestedLevels.get(channel) === fraction) return;
  requestedLevels.set(channel, fraction);
  const gain = mixer.channels[channel].gain;
  gain.setTargetAtTime(CHANNEL_VOLUMES[channel] * fraction, mixer.context.currentTime, VOLUME_SMOOTHING);
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
