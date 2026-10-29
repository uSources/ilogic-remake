import { fromRelease, type GithubRelease, type PatchNote } from './notes';

/**
 * Lee las Releases del repositorio en la API publica de GitHub (sin iniciar sesion: el repo tiene
 * que ser publico). Para no gastar el limite de 60 peticiones por hora, se guarda la respuesta en
 * el navegador y se vuelve a preguntar como mucho cada media hora, con ETag (si no ha cambiado,
 * GitHub contesta 304 y no cuenta).
 */

const CACHE_KEY = 'ilogic.patchNotes';
const MAX_AGE = 30 * 60 * 1000;
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
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cache | null;
    return c && c.repo === repo && Array.isArray(c.notes) ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // sin almacenamiento: la proxima vez se vuelve a pedir
  }
}

export async function fetchReleases(repo: string, force = false): Promise<{ notes: PatchNote[]; status: FetchStatus }> {
  const cache = readCache(repo);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { notes: cache?.notes ?? [], status: 'offline' };
  if (cache && !force && Date.now() - cache.at < MAX_AGE) return { notes: cache.notes, status: 'cached' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (cache?.etag) headers['If-None-Match'] = cache.etag;
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (res.status === 304 && cache) {
      writeCache({ ...cache, at: Date.now() });
      return { notes: cache.notes, status: 'online' };
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = (await res.json()) as GithubRelease[];
    const notes = list.map(fromRelease).filter((n): n is PatchNote => n !== null);
    writeCache({ repo, etag: res.headers.get('ETag'), at: Date.now(), notes });
    return { notes, status: 'online' };
  } catch {
    return { notes: cache?.notes ?? [], status: cache ? 'cached' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
