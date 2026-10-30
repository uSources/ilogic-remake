/**
 * Borrador de notas de parche a partir de los commits (gitmoji, ver docs/COMMITS.md): los de emojis que
 * tienen apartado en tools/git/gitmoji.json ("notes") se agrupan por apartado; el resto son internos y
 * no salen. Funciones puras: las usa tools/notes/cli.ts y se prueban en tests/notes.test.ts.
 */
import gitmojiFile from '../git/gitmoji.json';

export interface Gitmoji {
  emoji: string;
  es: string;
  notes?: { es: string; en: string };
}

export interface Commit {
  hash: string;
  subject: string;
  body?: string;
}

export interface DraftSection {
  emoji: string;
  title: { es: string; en: string };
  items: string[];
}

export interface Draft {
  sections: DraftSection[];
  /** Commits que no salen en las notas (documentacion, CI, tests...). */
  internal: number;
  /** Commits sin emoji de la lista (anteriores al formato o que se colaron). */
  unknown: string[];
}

export const GITMOJI: readonly Gitmoji[] = (gitmojiFile as { emojis: Gitmoji[] }).emojis;

const BY_LENGTH = [...GITMOJI].sort((a, b) => b.emoji.length - a.emoji.length);

/** Emoji de la lista con el que empieza el asunto, y el resto del asunto. */
export function parseSubject(subject: string): { gitmoji: Gitmoji; text: string } | null {
  const g = BY_LENGTH.find((e) => subject.startsWith(`${e.emoji} `));
  return g ? { gitmoji: g, text: subject.slice(g.emoji.length + 1).trim() } : null;
}

export function buildDraft(commits: readonly Commit[], gitmoji: readonly Gitmoji[] = GITMOJI): Draft {
  const sections = new Map<string, DraftSection>();
  // El orden de los apartados es el de gitmoji.json (Novedades primero).
  for (const g of gitmoji) if (g.notes) sections.set(g.emoji, { emoji: g.emoji, title: g.notes, items: [] });
  let internal = 0;
  const unknown: string[] = [];
  for (const c of commits) {
    const p = parseSubject(c.subject);
    if (!p) unknown.push(c.subject);
    else if (!p.gitmoji.notes) internal++;
    else sections.get(p.gitmoji.emoji)!.items.push(p.text);
  }
  return { sections: [...sections.values()].filter((s) => s.items.length), internal, unknown };
}

export const DRAFT_START = '<!-- borrador: npm run notes. Reescribir para el jugador (y traducir), y borrar estas marcas -->';
export const DRAFT_END = '<!-- fin del borrador -->';

/** Markdown de un idioma. Los asuntos de los commits estan en español: en ingles van marcados para traducir. */
export function renderDraft(d: Draft, lang: 'es' | 'en'): string {
  if (!d.sections.length) return '';
  const parts = d.sections.map(
    (s) => `### ${s.title[lang]}\n${s.items.map((i) => `- ${lang === 'en' ? `(traducir) ${i}` : i}`).join('\n')}`,
  );
  return `${DRAFT_START}\n\n${parts.join('\n\n')}\n\n${DRAFT_END}`;
}

/**
 * Mete el borrador en el apartado "## [Sin publicar]" del CHANGELOG (lo crea si no esta), en español
 * antes de `<!-- en -->` y en ingles despues. Si ya habia un borrador, lo sustituye; lo escrito a mano
 * se queda como esta.
 */
export function insertDraft(changelog: string, d: Draft): string {
  const es = renderDraft(d, 'es');
  const en = renderDraft(d, 'en');
  const strip = (s: string) => s.replace(new RegExp(`\\n*${escape(DRAFT_START)}[\\s\\S]*?${escape(DRAFT_END)}\\n*`, 'g'), '\n\n');
  let md = strip(changelog);
  const unreleased = /^## \[Sin publicar\]\s*$/m;
  if (!unreleased.test(md)) {
    const firstVersion = md.search(/^## \[/m);
    const at = firstVersion < 0 ? md.length : firstVersion;
    md = `${md.slice(0, at)}## [Sin publicar]\n\n<!-- en -->\n\n${md.slice(at)}`;
  }
  if (!es) return tidy(md);
  const start = md.search(unreleased);
  const next = md.slice(start + 1).search(/^## \[/m);
  const end = next < 0 ? md.length : start + 1 + next;
  let section = md.slice(start, end);
  const headerEnd = section.indexOf('\n') + 1;
  const split = section.indexOf('<!-- en -->');
  if (split < 0) section = `${section.trimEnd()}\n\n${es}\n\n<!-- en -->\n\n${en}\n\n`;
  else {
    const esPart = section.slice(headerEnd, split).trim();
    const enPart = section.slice(split + '<!-- en -->'.length).trim();
    section = `${section.slice(0, headerEnd)}\n${[es, esPart].filter(Boolean).join('\n\n')}\n\n<!-- en -->\n\n${[en, enPart].filter(Boolean).join('\n\n')}\n\n`;
  }
  return tidy(md.slice(0, start) + section + md.slice(end));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = (s: string) => `${s.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
