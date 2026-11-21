/**
 * Sonidos con IA local: Stable Audio 3 Medium en ComfyUI (docs/PLAN-SONIDO.md). ComfyUI tiene que estar
 * abierto y con el modelo en su carpeta models/.
 *
 *   npm run sonidos -- lista                          el catalogo (tools/audio/catalog/) y sus candidatos
 *   npm run sonidos -- generar shot_flak,amb_sea      4 candidatos de cada uno en tools/audio/out/
 *   npm run sonidos -- generar shot_flak --tandas 3   12 candidatos (4 por tanda)
 *   npm run sonidos -- escuchar                       abre en el navegador la pagina para oirlos y compararlos
 *   npm run sonidos -- oir shot_flak 2,5              los suena aqui mismo, uno detras de otro (sin numeros, todos)
 *   npm run sonidos -- elegir shot_flak 2,5,7         esos candidatos pasan al juego (public/assets/...)
 *   npm run sonidos -- grafo shot_flak                el grafo para abrirlo a mano en ComfyUI
 *
 * `escuchar` sirve la pagina en http://localhost:5180 (--puerto otro; --no-abrir para no abrir el
 * navegador) hasta Ctrl+C. COMFYUI_URL cambia donde esta ComfyUI (por defecto http://127.0.0.1:8188).
 */
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandLine, usageOf } from '../cliArgs';
import { auditionPage } from './auditionPage';
import {
  addCandidate,
  candidate,
  candidateRaw,
  candidatesOf,
  candidateWav,
  nextCandidateNumber,
  OUT_FOLDER,
  type Candidate,
} from './candidates';
import { CATALOG, soundSpec, type SoundSpec } from './catalog';
import { download, runGraph, upload, type ComfyFile } from './comfyClient';
import { encodingGraph, generationGraph, withNumberedNodes } from './comfyGraphs';
import { serveFolder } from './listeningServer';
import { generatedSecondsFor, isEffect, KINDS, promptFor } from './soundKinds';
import { secondsOf } from './shaping';
import { SFX_FOLDER, writeSoundList } from './soundList.mjs';
import { decodeToWav, readWav, writeWav } from './wavFile';

const CANDIDATES_PER_ROUND = 4;
/** Hasta donde llega la semilla de ComfyUI sin problemas en todos sus muestreadores. */
const MAX_SEED = 2 ** 31 - 1;
const ASHFOX_SOURCES = fileURLToPath(new URL('../art/ashfox/sounds/', import.meta.url));
const ASSETS = fileURLToPath(new URL('../../public/assets/', import.meta.url));
/** Lo que guarda ComfyUI al codificar y como lo pide el juego (music.ts): Opus en Ogg como `.ogg`. */
const GAME_EXTENSION: Readonly<Record<string, string>> = { '.mp3': 'mp3', '.opus': 'ogg' };

const LISTENING_PORT = 5180;

const args = commandLine(import.meta.url, { tandas: 'number', puerto: 'number', abrir: 'flag' });

/** Lo de delante en `ilogic/<id>/...` de la carpeta output/ de ComfyUI, para encontrarlo a mano. */
const comfyPrefix = (spec: SoundSpec, name: string): string => `ilogic/${spec.id}/${name}`;

const specsOf = (idsText: string | undefined): SoundSpec[] => (idsText ?? '').split(',').filter(Boolean).map(soundSpec);

// --- generar -------------------------------------------------------------------------------------------

/** Baja un sonido que ha hecho ComfyUI, lo recorta segun su clase y lo guarda como candidato nuevo. */
async function keepCandidate(
  spec: SoundSpec,
  file: ComfyFile,
  origin: Omit<Candidate, 'number' | 'seconds'>,
  workFolder: string,
): Promise<void> {
  const number = nextCandidateNumber(spec.id);
  const raw = candidateRaw(spec.id, number);
  mkdirSync(dirname(raw), { recursive: true });
  writeFileSync(raw, await download(file));
  const decoded = join(workFolder, `${spec.id}-${number}.wav`);
  decodeToWav(raw, decoded, KINDS[spec.kind].decode);
  const shaped = KINDS[spec.kind].shape(readWav(decoded), spec);
  writeWav(candidateWav(spec.id, number), shaped);
  addCandidate(spec.id, { number, ...origin, seconds: secondsOf(shaped) });
}

async function generateRound(spec: SoundSpec, workFolder: string): Promise<void> {
  const seed = randomInt(MAX_SEED);
  const prompt = promptFor(spec);
  const graph = generationGraph({
    prompt,
    seconds: generatedSecondsFor(spec),
    seed,
    batch: CANDIDATES_PER_ROUND,
    filenamePrefix: comfyPrefix(spec, `s${seed}`),
  });
  const files = await runGraph(graph);
  for (const [batchIndex, file] of files.entries()) await keepCandidate(spec, file, { seed, batchIndex, prompt }, workFolder);
}

function writeAuditionPage(): string {
  const sections = CATALOG.map((spec) => ({ spec, candidates: candidatesOf(spec.id) })).filter((section) => section.candidates.length);
  const page = join(OUT_FOLDER, 'index.html');
  writeFileSync(page, auditionPage(sections));
  return page;
}

async function generate(idsText: string | undefined): Promise<void> {
  const specs = specsOf(idsText);
  if (!specs.length) throw new Error('Falta que sonidos (generar shot_flak,amb_sea)');
  const rounds = args.number('tandas', 1);
  const workFolder = mkdtempSync(join(tmpdir(), 'ilogic-sonidos-'));
  try {
    for (const spec of specs) {
      for (let round = 0; round < rounds; round++) await generateRound(spec, workFolder);
      console.log(`${spec.id}: ${candidatesOf(spec.id).length} candidatos`);
    }
  } finally {
    rmSync(workFolder, { recursive: true, force: true });
  }
  writeAuditionPage();
  console.log('Para oirlos: npm run sonidos -- escuchar (o, aqui mismo, npm run sonidos -- oir <sonido>)');
}

// --- elegir --------------------------------------------------------------------------------------------

/** Quita del juego las variantes que tenia el efecto (`<id>_<n>.wav`), para que no quede ninguna vieja. */
function removeEffectVariants(id: string): void {
  const isVariant = new RegExp(`^${id}_\\d+\\.wav$`);
  for (const file of readdirSync(SFX_FOLDER).filter((name) => isVariant.test(name))) rmSync(join(SFX_FOLDER, file));
}

function pickEffect(spec: SoundSpec, numbers: readonly number[]): void {
  if (existsSync(join(ASHFOX_SOURCES, `${spec.id}.ashfox`)))
    throw new Error(`${spec.id} lo hace Ashfox: quitalo de tools/art/ashfox/models/sounds.mjs (y su .ashfox) antes de cambiarlo`);
  removeEffectVariants(spec.id);
  numbers.forEach((number, index) => copyFileSync(candidateWav(spec.id, number), join(SFX_FOLDER, `${spec.id}_${index + 1}.wav`)));
  writeSoundList();
  console.log(`${spec.id}: ${numbers.length} variantes en public/assets/sfx (y src/audio/soundList.ts al dia)`);
}

/** Ambientes y musica: ComfyUI los pasa a MP3 y a Opus (aqui no hay ffmpeg) y quedan en public/assets. */
async function pickTrack(spec: SoundSpec, number: number): Promise<void> {
  const input = await upload(candidateWav(spec.id, number), `ilogic_${spec.id}.wav`);
  const files = await runGraph(encodingGraph(input, comfyPrefix(spec, 'elegido')));
  const folder = join(ASSETS, KINDS[spec.kind].folder);
  mkdirSync(folder, { recursive: true });
  for (const file of files) {
    const path = join(folder, `${spec.id}.${GAME_EXTENSION[extname(file.filename)]}`);
    writeFileSync(path, await download(file));
    console.log(`${spec.id}: ${path}`);
  }
}

async function pick(id: string | undefined, numbersText: string | undefined): Promise<void> {
  const spec = soundSpec(id ?? '');
  const numbers = (numbersText ?? '').split(',').filter(Boolean).map(Number);
  if (!numbers.length) throw new Error(`Falta que candidatos (elegir ${spec.id} 1,2)`);
  for (const number of numbers) candidate(spec.id, number);
  if (isEffect(spec)) return pickEffect(spec, numbers);
  if (numbers.length !== 1) throw new Error(`${spec.id} es ${spec.kind}: se elige un solo candidato`);
  await pickTrack(spec, numbers[0]!);
}

// --- escuchar y oir ------------------------------------------------------------------------------------

async function listen(): Promise<void> {
  writeAuditionPage();
  const port = args.number('puerto', LISTENING_PORT);
  await serveFolder(OUT_FOLDER, port);
  const url = `http://localhost:${port}/`;
  console.log(`Candidatos en ${url} (Ctrl+C para cerrar)`);
  if (args.flag('abrir') !== false) execFileSync('open', [url]);
}

/** Los suena con `afplay` (viene con macOS), sin navegador. */
function play(id: string | undefined, numbersText: string | undefined): void {
  const spec = soundSpec(id ?? '');
  const numbers = numbersText ? numbersText.split(',').map(Number) : candidatesOf(spec.id).map((each) => each.number);
  if (!numbers.length) throw new Error(`${spec.id} no tiene candidatos: genera antes`);
  for (const number of numbers) {
    candidate(spec.id, number);
    console.log(`${spec.id} ${number}`);
    execFileSync('afplay', [candidateWav(spec.id, number)]);
  }
}

// --- lista y grafo -------------------------------------------------------------------------------------

function list(): void {
  const idWidth = Math.max(...CATALOG.map((spec) => spec.id.length));
  for (const spec of CATALOG) {
    const variants = isEffect(spec) ? ` x${spec.variants ?? 1}` : '';
    console.log(
      `${spec.id.padEnd(idWidth)} ${spec.kind.padEnd(8)} ${String(spec.seconds).padStart(4)} s${variants.padEnd(3)}  candidatos: ${candidatesOf(spec.id).length}`,
    );
  }
}

function writeGraph(id: string | undefined): void {
  const spec = soundSpec(id ?? '');
  const graph = generationGraph({
    prompt: promptFor(spec),
    seconds: generatedSecondsFor(spec),
    seed: randomInt(MAX_SEED),
    batch: CANDIDATES_PER_ROUND,
    filenamePrefix: comfyPrefix(spec, 'a-mano'),
  });
  const path = join(OUT_FOLDER, spec.id, 'grafo.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(withNumberedNodes(graph), null, 2)}\n`);
  console.log(`Arrastralo a la ventana de ComfyUI: ${path}`);
}

const COMMANDS: Readonly<Record<string, (first?: string, second?: string) => Promise<void> | void>> = {
  lista: list,
  generar: generate,
  escuchar: listen,
  oir: play,
  elegir: pick,
  grafo: writeGraph,
};

const [commandName, first, second] = args.positionals;
const command = COMMANDS[commandName ?? ''];
if (!command) {
  console.log(usageOf(import.meta.url));
  process.exit(commandName ? 2 : 0);
}
try {
  await command(first, second);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
