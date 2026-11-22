/**
 * Notas de parche: el modelo y las conversiones (sin red ni interfaz, para poder probarlas).
 * Vienen de dos sitios: CHANGELOG.md (va dentro del juego) y las Releases de GitHub.
 */

export interface PatchNote {
  /** "0.1.0" (sin la v). */
  version: string;
  /** Titulo corto; vacio si no tiene. */
  title: string;
  /** Fecha ISO (AAAA-MM-DD) o "" si no se sabe. */
  date: string;
  /** Texto en Markdown por idioma (en = es si no hay version en ingles). */
  body: { es: string; en: string };
  /** Pagina de la Release en GitHub (null si solo esta en el CHANGELOG). */
  url: string | null;
  /** Descarga del juego adjunta a la Release (ilogic.html), si la hay. */
  download: string | null;
  prerelease: boolean;
}

/** Separador del texto en ingles dentro de unas notas. */
const EN_MARK = /^\s*<!--\s*en\s*-->\s*$/im;

export function splitLangs(markdown: string): { es: string; en: string } {
  const mark = EN_MARK.exec(markdown);
  if (!mark) return { es: markdown.trim(), en: markdown.trim() };
  const es = markdown.slice(0, mark.index).trim();
  const en = markdown.slice(mark.index + mark[0].length).trim();
  return { es, en: en || es };
}

/** "v1.2.3", "1.2" o "1.2.3-beta.1" → numeros comparables; null si no es una version. */
export function parseVersion(version: string): number[] | null {
  const found = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
  if (!found) return null;
  const [, major, minor, patch, prerelease] = found;
  // Una prerelease va antes que la version final: 1.0.0-beta < 1.0.0.
  return [Number(major), Number(minor ?? 0), Number(patch ?? 0), prerelease ? 0 : 1];
}

export function normVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. Lo que no es version va al final. */
export function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);
  if (!partsA || !partsB) return partsA ? 1 : partsB ? -1 : a.localeCompare(b);
  const differs = partsA.findIndex((part, index) => part !== partsB[index]);
  return differs < 0 ? 0 : (partsA[differs] ?? 0) - (partsB[differs] ?? 0);
}

/** Cabecera de version del CHANGELOG: "## [0.1.0] - 2026-10-29 — Titulo" (corchetes, fecha y titulo opcionales). */
const HEAD = /^##\s+\[?v?(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)\]?(?:\s*[-–(]\s*(\d{4}-\d{2}-\d{2})\)?)?(?:\s*[—–-]\s*(.+?))?\s*$/;

export function parseChangelog(markdown: string): PatchNote[] {
  const notes: PatchNote[] = [];
  let current: { version: string; date: string; title: string; lines: string[] } | null = null;
  const flush = () => {
    if (current)
      notes.push({
        version: current.version,
        title: current.title,
        date: current.date,
        body: splitLangs(current.lines.join('\n')),
        url: null,
        download: null,
        prerelease: (parseVersion(current.version)?.[3] ?? 1) === 0,
      });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const header = HEAD.exec(line);
    if (header) {
      flush();
      const [, version = '', date = '', title = ''] = header;
      current = { version, date, title, lines: [] };
    } else if (/^#{1,2}\s/.test(line)) {
      // Otra cabecera de primer nivel (no de version): termina la anterior.
      flush();
      current = null;
    } else if (current) current.lines.push(line);
  }
  flush();
  return notes.sort((a, b) => compareVersions(b.version, a.version));
}

/** "2026-10-29": lo que se queda de una fecha ISO con hora. */
const ISO_DATE_LENGTH = 10;

/** Lo que el juego usa de una Release de la API de GitHub. */
export interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets?: { name: string; browser_download_url: string }[];
}

export function fromRelease(release: GithubRelease): PatchNote | null {
  if (release.draft || !parseVersion(release.tag_name)) return null;
  const version = normVersion(release.tag_name);
  // El nombre suele ser "v0.1.0 — Titulo": se quita la version.
  const title = (release.name ?? '').replace(/^v?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?\s*[—–:-]?\s*/, '').trim();
  const html = release.assets?.find((asset) => /\.html$/i.test(asset.name));
  return {
    version,
    title,
    date: (release.published_at ?? '').slice(0, ISO_DATE_LENGTH),
    body: splitLangs(release.body ?? ''),
    url: release.html_url,
    download: html?.browser_download_url ?? null,
    prerelease: release.prerelease,
  };
}

/** Une las notas de GitHub con las del juego: manda GitHub, salvo que su texto venga vacio. */
export function mergeNotes(local: PatchNote[], remote: PatchNote[]): PatchNote[] {
  const byVersion = new Map<string, PatchNote>();
  for (const note of local) byVersion.set(note.version, note);
  for (const release of remote) {
    const own = byVersion.get(release.version);
    byVersion.set(release.version, {
      ...release,
      title: release.title || own?.title || '',
      date: release.date || own?.date || '',
      body: release.body.es || release.body.en ? release.body : (own?.body ?? release.body),
    });
  }
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}
