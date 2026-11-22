/**
 * Markdown sencillo para las notas de parche (el que se escribe en una Release de GitHub).
 * Se convierte en bloques y trozos de texto, nunca en HTML: lo que venga de la red no puede
 * meter etiquetas ni scripts en la pagina. Los enlaces solo pueden ser http(s).
 *
 * Soporta: # titulos, parrafos, listas (- * + y 1.) con un nivel de sangria, > citas,
 * ``` bloques de codigo, ---, **negrita**, *cursiva* / _cursiva_, `codigo`, [texto](url),
 * URLs sueltas e imagenes (se queda el texto alternativo).
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] };

export interface ListItem {
  /** 0 o 1: solo hay un nivel de sangria. */
  depth: number;
  children: Inline[];
}

export type Block =
  | { kind: 'heading'; level: number; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'quote'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

/** La direccion si es http(s); null si no (ni `javascript:` ni nada que no sea una pagina). */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// --- Dentro de una linea ---------------------------------------------------------------------------

/** Lo que se busca dentro de una linea, por orden de prioridad (gana el primero que encaja). */
const INLINE = new RegExp(
  [
    '(?<ticks>`+)(?<code>[^`]+?)\\k<ticks>',
    '!\\[(?<imageAlt>[^\\]]*)\\]\\([^)\\s]*\\)',
    '\\[(?<linkText>[^\\]]+)\\]\\((?<linkHref>[^)\\s]+)\\)',
    '\\*\\*(?<strongStars>.+?)\\*\\*',
    '__(?<strongUnderscores>.+?)__',
    '(?<![\\w*])\\*(?!\\s)(?<emStar>.+?)(?<!\\s)\\*(?!\\w)',
    '(?<![\\w_])_(?!\\s)(?<emUnderscore>.+?)(?<!\\s)_(?!\\w)',
    '(?<url>https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?\'"])',
  ].join('|'),
);

/** Los trozos de una linea; el texto seguido se junta en un solo trozo. */
class InlineParts {
  readonly list: Inline[] = [];

  addText(text: string): void {
    if (!text) return;
    const last = this.list.at(-1);
    if (last?.kind === 'text') last.text += text;
    else this.list.push({ kind: 'text', text });
  }

  add(...parts: Inline[]): void {
    this.list.push(...parts);
  }
}

/** Un enlace con su texto; si la direccion no es una pagina, solo su texto. */
function addLink(parts: InlineParts, text: string, href: string): void {
  const safe = safeHref(href);
  if (safe) parts.add({ kind: 'link', href: safe, children: parseInline(text) });
  else parts.add(...parseInline(text));
}

/** Una URL suelta: enlace a si misma, o texto si no es una pagina. */
function addBareUrl(parts: InlineParts, url: string): void {
  const safe = safeHref(url);
  if (safe) parts.add({ kind: 'link', href: safe, children: [{ kind: 'text', text: url }] });
  else parts.addText(url);
}

/** El trozo que corresponde a lo encontrado (los grupos con nombre de INLINE). */
function addFound(parts: InlineParts, found: Partial<Record<string, string>>): void {
  if (found.code !== undefined) return parts.add({ kind: 'code', text: found.code });
  // De una imagen se queda su texto alternativo.
  if (found.imageAlt !== undefined) return parts.addText(found.imageAlt);
  if (found.linkText !== undefined) return addLink(parts, found.linkText, found.linkHref ?? '');
  const strong = found.strongStars ?? found.strongUnderscores;
  if (strong !== undefined) return parts.add({ kind: 'strong', children: parseInline(strong) });
  const emphasis = found.emStar ?? found.emUnderscore;
  if (emphasis !== undefined) return parts.add({ kind: 'em', children: parseInline(emphasis) });
  if (found.url !== undefined) addBareUrl(parts, found.url);
}

export function parseInline(source: string): Inline[] {
  const parts = new InlineParts();
  let rest = source;
  while (rest) {
    const found = INLINE.exec(rest);
    if (!found) {
      parts.addText(rest);
      break;
    }
    parts.addText(rest.slice(0, found.index));
    addFound(parts, found.groups ?? {});
    rest = rest.slice(found.index + found[0].length);
  }
  return parts.list;
}

// --- Linea a linea ---------------------------------------------------------------------------------

const CODE_FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const QUOTE_START = /^\s*>/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
/** Linea con sangria debajo de un elemento de lista: sigue siendo parte de el. */
const LIST_CONTINUATION = /^\s{2,}\S/;

/** Espacios de sangria por nivel de lista (un tabulador cuenta como un nivel). */
const INDENT_PER_LEVEL = 2;
const TAB_AS_SPACES = ' '.repeat(INDENT_PER_LEVEL);
const MAX_LIST_DEPTH = 1;

/** Separa dos lineas que se juntan en un mismo bloque. */
const space = (): Inline => ({ kind: 'text', text: ' ' });

/** Fuera comentarios HTML y etiquetas sueltas (GitHub las admite; aqui no se pintan). */
const withoutHtml = (markdown: string): string => markdown.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[a-z][^>]*>/gi, '');

/** Lo que se lleva leido: las lineas, los bloques hechos y el parrafo en curso. */
class MarkdownReader {
  readonly blocks: Block[] = [];
  private paragraph: string[] = [];
  private index = -1;

  constructor(private readonly lines: readonly string[]) {}

  /** Las lineas que quedan, una a una (lo que se lleva `takeUntil` ya no sale). */
  *remainingLines(): Generator<string> {
    for (let line = this.next(); line !== undefined; line = this.next()) yield line;
  }

  /** Las lineas hasta la que cumple `end` (esa se lleva tambien, sin devolverla) o hasta el final. */
  takeUntil(end: RegExp): string[] {
    const taken: string[] = [];
    for (let line = this.next(); line !== undefined && !end.test(line); line = this.next()) taken.push(line);
    return taken;
  }

  previousLine(): string | undefined {
    return this.lines[this.index - 1];
  }

  get hasParagraph(): boolean {
    return this.paragraph.length > 0;
  }

  lastBlock(): Block | undefined {
    return this.blocks.at(-1);
  }

  addToParagraph(line: string): void {
    this.paragraph.push(line.trim());
  }

  endParagraph(): void {
    if (this.hasParagraph) this.blocks.push({ kind: 'paragraph', children: parseInline(this.paragraph.join(' ')) });
    this.paragraph = [];
  }

  /** Un bloque nuevo (cierra el parrafo en curso). */
  add(block: Block): void {
    this.endParagraph();
    this.blocks.push(block);
  }

  private next(): string | undefined {
    this.index++;
    return this.lines[this.index];
  }
}

/** Lee la linea si es de su clase (y las que van con ella); false si no lo es. */
type LineReader = (reader: MarkdownReader, line: string) => boolean;

function readCodeFence(reader: MarkdownReader, line: string): boolean {
  if (!CODE_FENCE.test(line)) return false;
  reader.add({ kind: 'code', text: reader.takeUntil(CODE_FENCE).join('\n') });
  return true;
}

function readBlankLine(reader: MarkdownReader, line: string): boolean {
  if (line.trim()) return false;
  reader.endParagraph();
  return true;
}

function readHeading(reader: MarkdownReader, line: string): boolean {
  const found = HEADING.exec(line);
  if (!found) return false;
  const [, hashes = '', text = ''] = found;
  reader.add({ kind: 'heading', level: hashes.length, children: parseInline(text) });
  return true;
}

function readRule(reader: MarkdownReader, line: string): boolean {
  if (!RULE.test(line)) return false;
  reader.add({ kind: 'rule' });
  return true;
}

/** Una cita; si la linea de antes tambien lo era, sigue la misma. */
function readQuote(reader: MarkdownReader, line: string): boolean {
  const found = QUOTE.exec(line);
  if (!found) return false;
  const [, text = ''] = found;
  reader.endParagraph();
  const last = reader.lastBlock();
  if (last?.kind === 'quote' && QUOTE_START.test(reader.previousLine() ?? '')) last.children.push(space(), ...parseInline(text));
  else reader.add({ kind: 'quote', children: parseInline(text) });
  return true;
}

/** Un elemento de lista: sigue la lista de antes si es del mismo tipo (o va con sangria). */
function readListItem(reader: MarkdownReader, line: string): boolean {
  const found = LIST_ITEM.exec(line);
  if (!found) return false;
  const [, indent = '', marker = '', text = ''] = found;
  reader.endParagraph();
  const ordered = /\d/.test(marker);
  const depth = Math.min(MAX_LIST_DEPTH, Math.floor(indent.replace(/\t/g, TAB_AS_SPACES).length / INDENT_PER_LEVEL));
  const item = { depth, children: parseInline(text) };
  const last = reader.lastBlock();
  if (last?.kind === 'list' && (last.ordered === ordered || depth > 0)) last.items.push(item);
  else reader.add({ kind: 'list', ordered, items: [item] });
  return true;
}

function readListContinuation(reader: MarkdownReader, line: string): boolean {
  const last = reader.lastBlock();
  const lastItem = last?.kind === 'list' ? last.items.at(-1) : undefined;
  if (reader.hasParagraph || !lastItem || !LIST_CONTINUATION.test(line)) return false;
  lastItem.children.push(space(), ...parseInline(line.trim()));
  return true;
}

/** Las clases de linea, por orden; la que no es de ninguna es parte de un parrafo. */
const LINE_READERS: readonly LineReader[] = [
  readCodeFence,
  readBlankLine,
  readHeading,
  readRule,
  readQuote,
  readListItem,
  readListContinuation,
];

export function parseMarkdown(markdown: string): Block[] {
  const reader = new MarkdownReader(withoutHtml(markdown).split(/\r?\n/));
  for (const line of reader.remainingLines()) {
    const isRead = LINE_READERS.some((read) => read(reader, line));
    if (!isRead) reader.addToParagraph(line);
  }
  reader.endParagraph();
  return reader.blocks;
}
