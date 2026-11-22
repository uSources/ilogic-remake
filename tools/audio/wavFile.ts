/**
 * Leer y escribir WAV, y pasar a WAV lo que da ComfyUI (FLAC) con `afconvert`, que viene con macOS
 * (en el equipo no hay ffmpeg). El WAV que se escribe es PCM de 16 bits, como los efectos de Ashfox.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { lengthOf, type Pcm } from './shaping';

/** Formatos de muestra de la cabecera `fmt ` de un WAV. */
const PCM_INTEGER = 1;
const PCM_FLOAT = 3;
/** Cabecera ampliada (la usa `afconvert` en estereo): el formato de verdad va en su subformato. */
const EXTENSIBLE = 0xfffe;
const SUBFORMAT_OFFSET = 24;
const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const INT16_SCALE = 32767;

interface WavFormat {
  readonly encoding: number;
  readonly channelCount: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
}

/** Los trozos (`fmt `, `data`...) de un WAV, por su nombre. */
function chunksOf(file: Buffer): Map<string, Buffer> {
  const chunks = new Map<string, Buffer>();
  let offset = RIFF_HEADER_BYTES;
  while (offset + CHUNK_HEADER_BYTES <= file.length) {
    const id = file.toString('ascii', offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    chunks.set(id, file.subarray(start, start + size));
    offset = start + size + (size % 2);
  }
  return chunks;
}

function formatOf(chunk: Buffer): WavFormat {
  const encoding = chunk.readUInt16LE(0);
  return {
    encoding: encoding === EXTENSIBLE ? chunk.readUInt16LE(SUBFORMAT_OFFSET) : encoding,
    channelCount: chunk.readUInt16LE(2),
    sampleRate: chunk.readUInt32LE(4),
    bitsPerSample: chunk.readUInt16LE(14),
  };
}

/** Lee la muestra `index` (contando todos los canales seguidos) como numero de -1 a 1. */
function sampleReader(data: Buffer, format: WavFormat): (index: number) => number {
  if (format.encoding === PCM_FLOAT && format.bitsPerSample === 32) return (index) => data.readFloatLE(index * 4);
  if (format.encoding === PCM_INTEGER && format.bitsPerSample === 16) return (index) => data.readInt16LE(index * 2) / INT16_SCALE;
  throw new Error(`WAV que no se sabe leer (formato ${format.encoding}, ${format.bitsPerSample} bits)`);
}

export function readWav(path: string): Pcm {
  const chunks = chunksOf(readFileSync(path));
  const fmt = chunks.get('fmt ');
  const data = chunks.get('data');
  if (!fmt || !data) throw new Error(`${path} no es un WAV`);
  const format = formatOf(fmt);
  const read = sampleReader(data, format);
  const frames = data.length / (format.channelCount * (format.bitsPerSample / 8));
  const channels = Array.from({ length: format.channelCount }, (_, channel) =>
    Float32Array.from({ length: frames }, (_, frame) => read(frame * format.channelCount + channel)),
  );
  return { sampleRate: format.sampleRate, channels };
}

function wavHeader(pcm: Pcm, dataBytes: number): Buffer {
  const channelCount = pcm.channels.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(PCM_INTEGER, 20);
  header.writeUInt16LE(channelCount, 22);
  header.writeUInt32LE(pcm.sampleRate, 24);
  header.writeUInt32LE(pcm.sampleRate * channelCount * 2, 28);
  header.writeUInt16LE(channelCount * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/** Escribe `pcm` como WAV de 16 bits (lo que pase de -1..1 se recorta). */
export function writeWav(path: string, pcm: Pcm): void {
  const frames = lengthOf(pcm);
  const data = Buffer.alloc(frames * pcm.channels.length * 2);
  pcm.channels.forEach((samples, channel) => {
    for (let frame = 0; frame < frames; frame++) {
      const sample = Math.max(-1, Math.min(1, samples[frame]!));
      data.writeInt16LE(Math.round(sample * INT16_SCALE), (frame * pcm.channels.length + channel) * 2);
    }
  });
  writeFileSync(path, Buffer.concat([wavHeader(pcm, data.length), data]));
}

/** Como se quiere el audio al pasarlo a WAV. */
export interface DecodeFormat {
  readonly channelCount: 1 | 2;
  readonly sampleRate: number;
}

/** Pasa `input` (FLAC, MP3...) a un WAV de muestras de coma flotante en `output`, con `afconvert`. */
export function decodeToWav(input: string, output: string, format: DecodeFormat): void {
  const dataFormat = `LEF32@${format.sampleRate}`;
  execFileSync('afconvert', ['-f', 'WAVE', '-d', dataFormat, '-c', String(format.channelCount), input, output], { stdio: 'inherit' });
}
