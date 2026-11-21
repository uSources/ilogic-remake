/**
 * Los candidatos de cada sonido, en tools/audio/out/<id>/ (fuera de git): cada uno con su numero, su
 * WAV ya recortado (<n>.wav), lo que dio el modelo tal cual (raw/<n>.flac) y de donde salio
 * (candidates.json). Se numeran seguidos aunque se generen en varias veces, para elegirlos por numero.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OUT_FOLDER = fileURLToPath(new URL('./out/', import.meta.url));

export interface Candidate {
  readonly number: number;
  /** La semilla de la tanda y su sitio en ella: con el mismo texto vuelve a salir igual. */
  readonly seed: number;
  readonly batchIndex: number;
  readonly prompt: string;
  readonly seconds: number;
}

export const candidateFolder = (id: string): string => join(OUT_FOLDER, id);
export const candidateWav = (id: string, number: number): string => join(candidateFolder(id), `${number}.wav`);
export const candidateRaw = (id: string, number: number): string => join(candidateFolder(id), 'raw', `${number}.flac`);
const listFile = (id: string): string => join(candidateFolder(id), 'candidates.json');

export function candidatesOf(id: string): Candidate[] {
  const file = listFile(id);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Candidate[]) : [];
}

export const nextCandidateNumber = (id: string): number => Math.max(0, ...candidatesOf(id).map((candidate) => candidate.number)) + 1;

export function addCandidate(id: string, candidate: Candidate): void {
  mkdirSync(join(candidateFolder(id), 'raw'), { recursive: true });
  writeFileSync(listFile(id), `${JSON.stringify([...candidatesOf(id), candidate], null, 2)}\n`);
}

/** El candidato `number` de `id`, o un error que dice cuales hay. */
export function candidate(id: string, number: number): Candidate {
  const found = candidatesOf(id).find((each) => each.number === number);
  if (found) return found;
  const numbers = candidatesOf(id).map((each) => each.number);
  throw new Error(`${id} no tiene el candidato ${number} (tiene: ${numbers.join(', ') || 'ninguno; genera antes'})`);
}
