/**
 * Dejar un audio recien generado listo para el juego: quitar el silencio de delante, cortar la cola,
 * igualar el volumen y cerrar los bucles. Todo puro, sobre muestras en memoria (sin ficheros).
 */

/** Un audio en memoria: una lista de muestras (-1..1) por canal, todas del mismo largo. */
export interface Pcm {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

/** Lo que se deja antes del primer sonido al recortar el principio: sin ello el ataque suena cortado. */
const ATTACK_MARGIN_SECONDS = 0.005;

export const lengthOf = (pcm: Pcm): number => pcm.channels[0]?.length ?? 0;

export const secondsOf = (pcm: Pcm): number => lengthOf(pcm) / pcm.sampleRate;

const fromDb = (db: number): number => 10 ** (db / 20);

const toDb = (amplitude: number): number => 20 * Math.log10(amplitude);

function mapChannels(pcm: Pcm, change: (samples: Float32Array) => Float32Array): Pcm {
  return { sampleRate: pcm.sampleRate, channels: pcm.channels.map(change) };
}

/** Lo mas alto que llega cualquier canal (0 si es silencio). */
export function peakOf(pcm: Pcm): number {
  let peak = 0;
  for (const samples of pcm.channels) for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

/** El volumen medio (raiz de la media de los cuadrados) de todos los canales juntos. */
export function rmsOf(pcm: Pcm): number {
  let sum = 0;
  for (const samples of pcm.channels) for (const sample of samples) sum += sample * sample;
  const count = lengthOf(pcm) * pcm.channels.length;
  return count ? Math.sqrt(sum / count) : 0;
}

/** Si en la muestra `index` algun canal pasa de `threshold`. */
const isAudibleAt = (pcm: Pcm, index: number, threshold: number): boolean =>
  pcm.channels.some((samples) => Math.abs(samples[index] ?? 0) >= threshold);

/** El umbral de "se oye": `belowPeakDb` por debajo del pico del audio. */
const audibleThreshold = (pcm: Pcm, belowPeakDb: number): number => peakOf(pcm) * fromDb(-belowPeakDb);

export function slice(pcm: Pcm, start: number, end: number): Pcm {
  return mapChannels(pcm, (samples) => samples.slice(Math.max(0, start), Math.min(samples.length, end)));
}

/** Quita lo de delante que no llega a oirse (`belowPeakDb` bajo el pico), dejando un margen para el ataque. */
export function trimStart(pcm: Pcm, belowPeakDb: number): Pcm {
  const threshold = audibleThreshold(pcm, belowPeakDb);
  let first = 0;
  while (first < lengthOf(pcm) && !isAudibleAt(pcm, first, threshold)) first++;
  return slice(pcm, first - Math.round(ATTACK_MARGIN_SECONDS * pcm.sampleRate), lengthOf(pcm));
}

/** Corta la cola que ya no se oye (`belowPeakDb` bajo el pico). */
export function trimEnd(pcm: Pcm, belowPeakDb: number): Pcm {
  const threshold = audibleThreshold(pcm, belowPeakDb);
  let last = lengthOf(pcm) - 1;
  while (last > 0 && !isAudibleAt(pcm, last, threshold)) last--;
  return slice(pcm, 0, last + 1);
}

/** Como mucho `seconds` (lo que pase, fuera). */
export const limitLength = (pcm: Pcm, seconds: number): Pcm => slice(pcm, 0, Math.round(seconds * pcm.sampleRate));

/** Baja a cero en los ultimos `seconds`, para que no acabe en un chasquido. */
export function fadeOut(pcm: Pcm, seconds: number): Pcm {
  const length = lengthOf(pcm);
  const fadeLength = Math.min(length, Math.round(seconds * pcm.sampleRate));
  return mapChannels(pcm, (samples) => {
    const faded = samples.slice();
    for (let i = 0; i < fadeLength; i++) faded[length - fadeLength + i]! *= 1 - (i + 1) / fadeLength;
    return faded;
  });
}

export const gain = (pcm: Pcm, db: number): Pcm => mapChannels(pcm, (samples) => samples.map((sample) => sample * fromDb(db)));

/** Sube o baja el volumen para que el pico quede en `peakDb`. */
export function normalizePeak(pcm: Pcm, peakDb: number): Pcm {
  const peak = peakOf(pcm);
  return peak ? gain(pcm, peakDb - toDb(peak)) : pcm;
}

/**
 * Iguala el volumen medio a `rmsDb` (para que todos los ambientes suenen igual de fuerte), sin que el
 * pico pase de `peakCeilingDb`.
 */
export function normalizeRms(pcm: Pcm, rmsDb: number, peakCeilingDb: number): Pcm {
  const rms = rmsOf(pcm);
  if (!rms) return pcm;
  const wanted = rmsDb - toDb(rms);
  const allowed = peakCeilingDb - toDb(peakOf(pcm));
  return gain(pcm, Math.min(wanted, allowed));
}

/**
 * Un bucle sin corte: los ultimos `crossfadeSeconds` se funden con el principio (a igual potencia), asi
 * el final empalma con el principio. Sale `crossfadeSeconds` mas corto.
 */
export function loopWithCrossfade(pcm: Pcm, crossfadeSeconds: number): Pcm {
  const length = lengthOf(pcm);
  const fadeLength = Math.min(Math.floor(length / 2), Math.round(crossfadeSeconds * pcm.sampleRate));
  const loopLength = length - fadeLength;
  return mapChannels(pcm, (samples) => {
    const loop = samples.slice(0, loopLength);
    for (let i = 0; i < fadeLength; i++) {
      const progress = (i + 0.5) / fadeLength;
      const fromTail = samples[loopLength + i]! * Math.cos((progress * Math.PI) / 2);
      const fromHead = samples[i]! * Math.sin((progress * Math.PI) / 2);
      loop[i] = fromTail + fromHead;
    }
    return loop;
  });
}
