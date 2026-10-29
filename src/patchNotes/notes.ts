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

export function splitLangs(md: string): { es: string; en: string } {
  const m = EN_MARK.exec(md);
  if (!m) return { es: md.trim(), en: md.trim() };
  const es = md.slice(0, m.index).trim();
  const en = md.slice(m.index + m[0].length).trim();
  return { es, en: en || es };
}

/** "v1.2.3", "1.2" o "1.2.3-beta.1" → numeros comparables; null si no es una version. */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim());
  if (!m) return null;
  // Una prerelease va antes que la version final: 1.0.0-beta < 1.0.0.
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4] ? 0 : 1];
}

export function normVersion(v: string): string {
  return v.trim().replace(/^v/i, '');
}

/** Negativo si a < b, 0 si iguales, positivo si a > b. Lo que no es version va al final. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : a.localeCompare(b);
  for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/** Cabecera de version del CHANGELOG: "## [0.1.0] - 2026-10-29 — Titulo" (corchetes, fecha y titulo opcionales). */
const HEAD = /^##\s+\[?v?(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?)\]?(?:\s*[-–(]\s*(\d{4}-\d{2}-\d{2})\)?)?(?:\s*[—–-]\s*(.+?))?\s*$/;

export function parseChangelog(md: string): PatchNote[] {
  const out: PatchNote[] = [];
  let cur: { version: string; date: string; title: string; lines: string[] } | null = null;
  const flush = () => {
    if (cur) out.push({ version: cur.version, title: cur.title, date: cur.date, body: splitLangs(cur.lines.join('\n')), url: null, download: null, prerelease: (parseVersion(cur.version)?.[3] ?? 1) === 0 });
  };
  for (const line of md.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (h) {
      flush();
      cur = { version: h[1]!, date: h[2] ?? '', title: h[3] ?? '', lines: [] };
    } else if (/^#{1,2}\s/.test(line)) {
      // Otra cabecera de primer nivel (no de version): termina la anterior.
      flush();
      cur = null;
    } else if (cur) cur.lines.push(line);
  }
  flush();
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

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

export function fromRelease(r: GithubRelease): PatchNote | null {
  if (r.draft || !parseVersion(r.tag_name)) return null;
  const version = normVersion(r.tag_name);
  // El nombre suele ser "v0.1.0 — Titulo": se quita la version.
  const title = (r.name ?? '').replace(/^v?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?\s*[—–:-]?\s*/, '').trim();
  const html = r.assets?.find((a) => /\.html$/i.test(a.name));
  return {
    version,
    title,
    date: (r.published_at ?? '').slice(0, 10),
    body: splitLangs(r.body ?? ''),
    url: r.html_url,
    download: html?.browser_download_url ?? null,
    prerelease: r.prerelease,
  };
}

/** Une las notas de GitHub con las del juego: manda GitHub, salvo que su texto venga vacio. */
export function mergeNotes(local: PatchNote[], remote: PatchNote[]): PatchNote[] {
  const byVersion = new Map<string, PatchNote>();
  for (const n of local) byVersion.set(n.version, n);
  for (const r of remote) {
    const l = byVersion.get(r.version);
    byVersion.set(r.version, {
      ...r,
      title: r.title || l?.title || '',
      date: r.date || l?.date || '',
      body: r.body.es || r.body.en ? r.body : (l?.body ?? r.body),
    });
  }
  return [...byVersion.values()].sort((a, b) => compareVersions(b.version, a.version));
}
