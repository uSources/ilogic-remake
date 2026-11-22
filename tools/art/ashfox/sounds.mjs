// Escribe los .ashfox de los efectos de sonido a partir de sus descripciones cortas (models/sounds.mjs).
// Con --export saca cada variante a WAV en public/assets/sfx/<sonido>_<n>.wav (hace falta el CLI de
// Ashfox: ver README.md) y rehace la lista que lee el juego (src/audio/soundList.ts) con los WAV que hay,
// que tambien pone la herramienta de IA (tools/audio).
//
//   node tools/art/ashfox/sounds.mjs                    escribe los .ashfox y la lista
//   ASHFOX=<ejecutable> node tools/art/ashfox/sounds.mjs --export      y los WAV
//   ... --only hit,explosion                             solo esos
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOUNDS } from './models/sounds.mjs';
import { writeSoundList } from '../../audio/soundList.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const SOURCES = join(ROOT, 'tools/art/ashfox/sounds');
const OUTPUT = join(ROOT, 'public/assets/sfx');

const SAMPLE_RATE = 48000;
/** Silencio antes de la primera nota (el azar del momento no puede caer antes del principio). */
const LEAD_IN = 0.01;
/** Lo que se deja al final para que se apague lo que resuena. */
const TAIL = 0.03;
const MIN_DURATION = 0.05;
/** Lo que el azar de cada variante cambia una nota (si el sonido tiene mas de una variante). */
const VARIATION = { pitchCents: [-40, 40], gain: [0.9, 1.05], duration: [0.95, 1.05] };
const NO_VARIATION = { timing: [0, 0], pitchCents: [0, 0], gain: [1, 1], duration: [1, 1] };
const DEFAULT_FILTERS = { highpass: 20, lowpass: 16000 };
const PEAK_DB = -1;

/** Un numero sin restos de coma flotante. */
const round = (value) => Math.round(value * 1e6) / 1e6;

/** El texto de Ashfox de un valor: registros `{ clave = valor; }`, listas, textos y numeros. */
function literal(value, indent = '') {
  if (typeof value === 'number') return String(round(value));
  if (typeof value === 'string') return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) return `[${value.map((item) => literal(item, indent)).join(', ')}]`;
  const fields = Object.entries(value).map(([key, field]) => `${inner}${key} = ${literal(field, inner)};`);
  return `{\n${fields.join('\n')}\n${indent}}`;
}

const isNoise = (voice) => voice.source.kind === 'noise';

function variationOf(sound, voice) {
  if ((sound.variants ?? 1) === 1) return NO_VARIATION;
  return { ...NO_VARIATION, ...VARIATION, pitchCents: isNoise(voice) ? [0, 0] : VARIATION.pitchCents };
}

function stepOf(sound, note, index) {
  const voice = sound.voices[note.voice];
  if (!voice) throw new Error(`La nota ${index} pide la voz ${note.voice}, que no existe`);
  return {
    id: `note_${index}`,
    voice: note.voice,
    at: LEAD_IN + (note.at ?? 0),
    duration: note.duration,
    gain: note.gain ?? 1,
    pitchCents: isNoise(voice) ? 0 : (note.pitchCents ?? 0),
    vary: variationOf(sound, voice),
  };
}

/** Lo que dura el sonido entero: hasta que acaba la ultima nota (alargada por el azar), y su cola. */
function durationOf(steps) {
  const ends = steps.map((step) => step.at + step.duration * step.vary.duration[1]);
  return Math.max(MIN_DURATION, ...ends) + TAIL;
}

const voiceOf = ([id, voice]) => ({ id, ...DEFAULT_FILTERS, ...voice, gain: voice.gain });

function sourceOf(name, sound) {
  const steps = sound.notes.map((note, index) => stepOf(sound, note, index));
  const variantCount = sound.variants ?? 1;
  const body = {
    duration: durationOf(steps),
    sampleRate: SAMPLE_RATE,
    seed: 1,
    voices: Object.entries(sound.voices).map(voiceOf),
    sequences: [{ id: 'phrase', start: 0, repeat: { count: 1, period: 0 }, steps }],
    variants: Array.from({ length: variantCount }, (_, index) => ({ id: variantId(index), seed: index + 1 })),
    playback: { kind: 'oneshot' },
    output: { gainDb: sound.gainDb ?? 0, peakDb: PEAK_DB },
  };
  return `ashfox-model 1\n\n// Generado por tools/art/ashfox/sounds.mjs desde models/sounds.mjs. No editar a mano.\nsound ${name} ${literal(body)}\n`;
}

const variantId = (index) => `v${index + 1}`;

function exportSound(name, sound) {
  const ashfox = process.env.ASHFOX ?? 'ashfox';
  const input = join(SOURCES, `${name}.ashfox`);
  for (let index = 0; index < (sound.variants ?? 1); index++) {
    const output = join(OUTPUT, `${name}_${index + 1}.wav`);
    rmSync(output, { force: true });
    execFileSync(ashfox, ['export', input, '--variant', variantId(index), '--output', output], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
}

/** Los sonidos pedidos con --only (todos si no se pide ninguno). */
function chosen() {
  if (!process.argv.includes('--only')) return SOUNDS;
  const names = new Set(process.argv[process.argv.indexOf('--only') + 1].split(','));
  return Object.fromEntries(Object.entries(SOUNDS).filter(([name]) => names.has(name)));
}

mkdirSync(SOURCES, { recursive: true });
mkdirSync(OUTPUT, { recursive: true });
const sounds = chosen();
for (const [name, sound] of Object.entries(sounds)) writeFileSync(join(SOURCES, `${name}.ashfox`), sourceOf(name, sound));
if (process.argv.includes('--export')) {
  for (const [name, sound] of Object.entries(sounds)) exportSound(name, sound);
  writeSoundList();
}
console.log(`sonidos: ${Object.keys(sounds).length}${process.argv.includes('--export') ? ' (con WAV)' : ''}`);
