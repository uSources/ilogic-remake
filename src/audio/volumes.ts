/**
 * Los volumenes que elige el jugador: uno general y uno por clase de sonido, cada uno de 0 a 100 y con su
 * silencio aparte (callar un canal no pierde su volumen). Puro, sin audio del navegador: lo guarda
 * settings.ts y lo aplican el mezclador (audioContext.ts) y la musica (music.ts).
 */

/** Los canales que van por Web Audio (audioContext.ts), uno por clase de efecto. */
export const MIXER_CHANNELS = ['effects', 'ambience', 'voices', 'interface'] as const;
export type Channel = (typeof MIXER_CHANNELS)[number];

/** Lo que el jugador puede subir y bajar, en el orden de Opciones. El general multiplica a todos. */
export const VOLUME_CHANNELS = ['master', 'music', ...MIXER_CHANNELS] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];

export interface ChannelVolume {
  /** De 0 a `MAX_LEVEL`. */
  readonly level: number;
  readonly muted: boolean;
}

export type Volumes = Readonly<Record<VolumeChannel, ChannelVolume>>;

export const MAX_LEVEL = 100;
/** Lo que sube o baja cada flecha. */
export const LEVEL_STEP = 10;

const FULL: ChannelVolume = { level: MAX_LEVEL, muted: false };

/** Al maximo, cada canal suena como antes de haber volumenes; la musica empieza callada, como siempre. */
export const DEFAULT_VOLUMES: Volumes = {
  master: FULL,
  music: { level: MAX_LEVEL, muted: true },
  effects: FULL,
  ambience: FULL,
  voices: FULL,
  interface: FULL,
};

/**
 * Lo que suena un canal suelto, de 0 a 1. Va al cuadrado porque el oido no es lineal: asi la mitad del
 * deslizador suena a la mitad de fuerte, y no casi igual que arriba del todo.
 */
export const gainOf = (volume: ChannelVolume): number => (volume.muted ? 0 : (volume.level / MAX_LEVEL) ** 2);

/** Si se oye algo de `channel`: ni el general ni el suyo estan callados o a cero. */
export const isAudible = (volumes: Volumes, channel: VolumeChannel): boolean => gainOf(volumes.master) > 0 && gainOf(volumes[channel]) > 0;

const clampLevel = (level: number): number => Math.min(MAX_LEVEL, Math.max(0, Math.round(level)));

/** `channel` a `level`. Mover el volumen de un canal callado le quita el silencio: se quiere oir. */
export const withLevel = (volumes: Volumes, channel: VolumeChannel, level: number): Volumes => ({
  ...volumes,
  [channel]: { level: clampLevel(level), muted: false },
});

/** `channel` callado o, si ya lo estaba, otra vez a su volumen. */
export const withMuteToggled = (volumes: Volumes, channel: VolumeChannel): Volumes => ({
  ...volumes,
  [channel]: { ...volumes[channel], muted: !volumes[channel].muted },
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un valor por canal, en una tabla que el compilador comprueba entera. */
const byChannel = <T>(valueOf: (channel: VolumeChannel) => T): Record<VolumeChannel, T> => ({
  master: valueOf('master'),
  music: valueOf('music'),
  effects: valueOf('effects'),
  ambience: valueOf('ambience'),
  voices: valueOf('voices'),
  interface: valueOf('interface'),
});

/** Un canal guardado, o `fallback` en lo que no valga (cada campo por su lado). */
function parseChannel(saved: unknown, fallback: ChannelVolume): ChannelVolume {
  if (!isRecord(saved)) return fallback;
  const { level, muted } = saved;
  return {
    level: typeof level === 'number' && Number.isFinite(level) ? clampLevel(level) : fallback.level,
    muted: typeof muted === 'boolean' ? muted : fallback.muted,
  };
}

/** Los volumenes guardados, sin fiarse de lo que haya: cada canal que falte o no valga, el de por defecto. */
export function parseVolumes(saved: unknown): Volumes {
  const channels = isRecord(saved) ? saved : {};
  return byChannel((channel) => parseChannel(channels[channel], DEFAULT_VOLUMES[channel]));
}
