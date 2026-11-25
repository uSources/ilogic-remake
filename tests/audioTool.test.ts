import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BED_AMBIENTS, WEATHER_AMBIENTS, ZONE_AMBIENTS } from '../src/audio/ambientNames';
import { SOUND_FALLBACKS } from '../src/audio/soundNames';
import { CATALOG, type SoundKind, type SoundSpec } from '../tools/audio/catalog';
import { soft } from '../tools/audio/catalog/spec';
import { generationGraph, withNumberedNodes } from '../tools/audio/comfyGraphs';
import { generatedSecondsFor, isEffect, KINDS, promptFor } from '../tools/audio/soundKinds';
import {
  fadeOut,
  lengthOf,
  loopWithCrossfade,
  normalizePeak,
  normalizeRms,
  peakOf,
  rmsOf,
  trimEnd,
  trimStart,
  type Pcm,
} from '../tools/audio/shaping';

const RATE = 1000;
const mono = (samples: number[]): Pcm => ({ sampleRate: RATE, channels: [Float32Array.from(samples)] });
const samplesOf = (pcm: Pcm): number[] => Array.from(pcm.channels[0]!);
const silence = (count: number): number[] => Array<number>(count).fill(0);
const toDb = (amplitude: number): number => 20 * Math.log10(amplitude);

describe('shaping: dejar listo un audio generado', () => {
  it('quita el silencio de delante dejando 5 ms para el ataque, y la cola que no se oye', () => {
    const pcm = mono([...silence(100), 1, 0.5, 0.2, ...silence(50)]);
    const trimmed = trimEnd(trimStart(pcm, 40), 40);
    expect(samplesOf(trimmed)).toEqual([...silence(5), 1, 0.5, 0.2].map((sample) => Math.fround(sample)));
  });

  it('el fundido de salida acaba en cero y no toca lo de antes', () => {
    const faded = samplesOf(fadeOut(mono(Array<number>(10).fill(1)), 0.004));
    expect(faded.slice(0, 6)).toEqual(Array<number>(6).fill(1));
    expect(faded.at(-1)).toBe(0);
  });

  it('el bucle empalma: el final sigue en el principio y sale el fundido mas corto', () => {
    const ramp = Array.from({ length: 100 }, (_, i) => i / 100);
    const loop = samplesOf(loopWithCrossfade(mono(ramp), 0.01));
    expect(loop).toHaveLength(90);
    // El ultimo del bucle es el 89; lo siguiente al volver al principio es casi el 90 (el que venia despues).
    expect(loop[0]).toBeCloseTo(0.9, 1);
    expect(loop.at(-1)).toBeCloseTo(0.89, 5);
    // Pasado el fundido, el principio tal cual.
    expect(loop[10]).toBeCloseTo(0.1, 5);
  });

  it('normaliza el pico, y el volumen medio sin pasarse del pico', () => {
    expect(toDb(peakOf(normalizePeak(mono([0.1, -0.25, 0.2]), -1)))).toBeCloseTo(-1, 5);
    const quiet = mono([0.01, -0.01, 0.01, -0.01]);
    expect(toDb(rmsOf(normalizeRms(quiet, -24, -1)))).toBeCloseTo(-24, 5);
    const spiky = mono([1e-3, 1e-3, 1e-3, 0.5]);
    expect(toDb(peakOf(normalizeRms(spiky, -3, -1)))).toBeCloseTo(-1, 5);
  });

  it('el silencio se queda como esta', () => {
    expect(lengthOf(normalizePeak(mono(silence(3)), -1))).toBe(3);
  });

  it('un efecto queda con el pico casi arriba; uno suave (el tic del reloj del turno), bastante mas flojo', () => {
    const click = mono([...silence(20), ...Array.from({ length: 60 }, (_, i) => 0.3 * 0.95 ** i * (i % 2 ? -1 : 1))]);
    const spec: SoundSpec = { id: 'x', kind: 'sfx', prompt: 'A click', seconds: 0.1 };
    const loud = toDb(peakOf(KINDS.sfx.shape(click, spec)));
    expect(loud).toBeCloseTo(-1, 5);
    expect(toDb(peakOf(KINDS.sfx.shape(click, soft(spec))))).toBeLessThan(loud - 6);
  });
});

/** Los efectos que hace Ashfox: uno por fichero en tools/art/ashfox/sounds/ (lo mismo que mira `elegir`). */
const ASHFOX_SOUNDS = readdirSync('tools/art/ashfox/sounds')
  .filter((file) => file.endsWith('.ashfox'))
  .map((file) => file.replace(/\.ashfox$/, ''));

const catalogIds = CATALOG.map((spec) => spec.id);
const KIND_NAMES = Object.keys(KINDS) as SoundKind[];
const specsOfKind = (kind: SoundKind): SoundSpec[] => CATALOG.filter((spec) => spec.kind === kind);

describe('el catalogo y lo que se le pide a ComfyUI', () => {
  it('los nombres no se repiten y son como los del juego (snake_case)', () => {
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    for (const id of catalogIds) expect(id).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  });

  it('no rehace ninguno de los que hace Ashfox', () => {
    expect(ASHFOX_SOUNDS.length).toBeGreaterThan(0);
    expect(catalogIds.filter((id) => ASHFOX_SOUNDS.includes(id))).toEqual([]);
  });

  it('tiene todo lo que pide el juego y no hace Ashfox: efectos, voces y ambientes', () => {
    const asked = [...Object.keys(SOUND_FALLBACKS), ...ZONE_AMBIENTS, ...BED_AMBIENTS, ...WEATHER_AMBIENTS];
    const missing = asked.filter((id) => !catalogIds.includes(id) && !ASHFOX_SOUNDS.includes(id));
    expect(missing).toEqual([]);
  });

  it('cada clase tiene sonidos y su propio estilo, que va en el texto de cada uno', () => {
    const styles = KIND_NAMES.map((kind) => KINDS[kind].style);
    expect(new Set(styles).size).toBe(styles.length);
    for (const kind of KIND_NAMES) {
      expect(specsOfKind(kind).length, kind).toBeGreaterThan(0);
      for (const spec of specsOfKind(kind)) expect(promptFor(spec)).toContain(KINDS[kind].style);
    }
  });

  it('las voces son de muñeco y sin palabras, y acaban como los efectos: mono a 48 kHz en sfx/', () => {
    expect(KINDS.voice.style).toMatch(/no real words/);
    expect(KINDS.voice.decode).toEqual(KINDS.sfx.decode);
    expect(KINDS.voice.decode.channelCount).toBe(1);
    expect(KINDS.voice.folder).toBe('sfx');
  });

  it('los ambientes de zona, en mono (el juego los coloca en el mapa); los de fondo, en estereo; todos en ambient/', () => {
    expect(KINDS.zone.decode.channelCount).toBe(1);
    expect(KINDS.ambient.decode.channelCount).toBe(2);
    expect([KINDS.zone.folder, KINDS.ambient.folder]).toEqual(['ambient', 'ambient']);
    expect(new Set(specsOfKind('zone').map((spec) => spec.id))).toEqual(new Set(ZONE_AMBIENTS));
  });

  it('efectos y voces dicen cuantas variantes; ambientes y musica son uno', () => {
    for (const spec of CATALOG) {
      if (isEffect(spec)) expect(spec.variants, spec.id).toBeGreaterThanOrEqual(1);
      else expect(spec.variants, spec.id).toBeUndefined();
    }
  });

  it('el texto acaba con la duracion en segundos enteros, como se entreno el modelo', () => {
    const spec = { id: 'x', kind: 'sfx', prompt: 'A click', seconds: 0.3 } as const;
    expect(promptFor(spec)).toMatch(/^A click\. .+\. Length: 1 seconds$/);
    expect(generatedSecondsFor(spec)).toBeGreaterThanOrEqual(1);
  });

  it('el grafo numerado enlaza los mismos nodos que el de nombres', () => {
    const graph = generationGraph({ prompt: 'p', seconds: 2, seed: 1, batch: 4, filenamePrefix: 'ilogic/x' });
    const numbered = withNumberedNodes(graph);
    expect(Object.keys(numbered)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(numbered['3']!.inputs.clip).toEqual(['2', 0]);
    expect(numbered['8']).toEqual({ class_type: 'SaveAudio', inputs: { audio: ['7', 0], filename_prefix: 'ilogic/x' } });
  });
});
