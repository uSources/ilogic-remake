/**
 * Hablar con ComfyUI por su API HTTP: mandar un grafo, esperar a que acabe, bajar lo que ha guardado
 * y subirle un audio. ComfyUI tiene que estar abierto (Comfy Desktop lo deja en el puerto 8188).
 */
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ComfyGraph } from './comfyGraphs';

const COMFY_URL = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188';
const POLL_EVERY_MS = 500;
/** Un ambiente largo con el modelo frio tarda menos de un minuto; esto es por si ComfyUI se cuelga. */
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;

/** Un fichero que ha guardado ComfyUI, como lo da su historial. */
export interface ComfyFile {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

interface HistoryEntry {
  readonly status: { readonly status_str: string; readonly completed: boolean; readonly messages: readonly unknown[] };
  readonly outputs: Readonly<Record<string, { readonly audio?: readonly ComfyFile[] }>>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${COMFY_URL}${path}`, init);
  } catch {
    throw new Error(`No se llega a ComfyUI en ${COMFY_URL}: ¿esta abierto? (COMFYUI_URL cambia la direccion)`);
  }
  if (!response.ok) throw new Error(`ComfyUI ${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function queue(graph: ComfyGraph): Promise<string> {
  const body = JSON.stringify({ prompt: graph });
  const answer = await request<{ prompt_id: string }>('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  return answer.prompt_id;
}

async function finished(promptId: string): Promise<HistoryEntry> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
    const history = await request<Record<string, HistoryEntry>>(`/history/${promptId}`);
    const entry = history[promptId];
    if (entry?.status.completed || entry?.status.status_str === 'error') return entry;
    await sleep(POLL_EVERY_MS);
  }
  throw new Error(`ComfyUI no ha acabado ${promptId} en ${GIVE_UP_AFTER_MS / 60000} minutos`);
}

/** Manda el grafo, espera y devuelve los audios que ha guardado, en el orden de sus nodos de guardar. */
export async function runGraph(graph: ComfyGraph): Promise<ComfyFile[]> {
  const entry = await finished(await queue(graph));
  if (entry.status.status_str !== 'success') throw new Error(`ComfyUI ha fallado: ${JSON.stringify(entry.status.messages).slice(0, 800)}`);
  return Object.values(entry.outputs).flatMap((output) => output.audio ?? []);
}

export async function download(file: ComfyFile): Promise<Buffer> {
  const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
  const response = await fetch(`${COMFY_URL}/view?${query.toString()}`);
  if (!response.ok) throw new Error(`No se puede bajar ${file.filename} de ComfyUI: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Sube `path` a la carpeta input/ de ComfyUI con el nombre `name` (en la raiz: LoadAudio solo ofrece lo
 * que hay ahi) y devuelve el nombre con el que lo pide LoadAudio.
 */
export async function upload(path: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([readFileSync(path)]), name);
  form.append('overwrite', 'true');
  const answer = await request<{ name: string }>('/upload/image', { method: 'POST', body: form });
  return answer.name;
}
