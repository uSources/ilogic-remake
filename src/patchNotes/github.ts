import { fromRelease, type GithubRelease, type PatchNote } from './notes';

/**
 * Lee las Releases del repositorio en la API publica de GitHub (sin iniciar sesion: el repo tiene
 * que ser publico). Para no gastar el limite de 60 peticiones por hora, se guarda la respuesta en
 * el navegador y se vuelve a preguntar como mucho cada media hora, con ETag (si no ha cambiado,
 * GitHub contesta 304 y no cuenta).
 */

const CACHE_KEY = 'ilogic.patchNotes';
/** Cada cuanto se vuelve a preguntar a GitHub (ms): media hora. */
const MAX_AGE = 30 * 60 * 1000;
/** Lo que se espera a GitHub antes de darlo por sin conexion (ms). */
const TIMEOUT = 8000;

interface Cache {
  repo: string;
  etag: string | null;
  at: number;
  notes: PatchNote[];
}

export type FetchStatus = 'online' | 'cached' | 'offline';

function readCache(repo: string): Cache | null {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cache | null;
    return cache && cache.repo === repo && Array.isArray(cache.notes) ? cache : null;
  } catch {
    return null;
  }
}

function writeCache(cache: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sin almacenamiento: la proxima vez se vuelve a pedir
  }
}

export async function fetchReleases(repo: string, force = false): Promise<{ notes: PatchNote[]; status: FetchStatus }> {
  const cache = readCache(repo);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { notes: cache?.notes ?? [], status: 'offline' };
  if (cache && !force && Date.now() - cache.at < MAX_AGE) return { notes: cache.notes, status: 'cached' };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT);
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (cache?.etag) headers['If-None-Match'] = cache.etag;
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers,
      signal: abort.signal,
      cache: 'no-store',
    });
    if (response.status === 304 && cache) {
      writeCache({ ...cache, at: Date.now() });
      return { notes: cache.notes, status: 'online' };
    }
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const list = (await response.json()) as GithubRelease[];
    const notes = list.map(fromRelease).filter((note): note is PatchNote => note !== null);
    writeCache({ repo, etag: response.headers.get('ETag'), at: Date.now(), notes });
    return { notes, status: 'online' };
  } catch {
    return { notes: cache?.notes ?? [], status: cache ? 'cached' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
