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
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: { depth: number; c: Inline[] }[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'hr' };

export function safeHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Patrones de linea, por orden de prioridad. */
const INLINE = /(`+)([^`]+?)\1|!\[([^\]]*)\]\([^)\s]*\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const text = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
  };
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      text(rest);
      break;
    }
    text(rest.slice(0, m.index));
    if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined) text(m[3]);
    else if (m[4] !== undefined) {
      const href = safeHref(m[5]!);
      if (href) out.push({ t: 'link', href, c: parseInline(m[4]) });
      else out.push(...parseInline(m[4]));
    } else if (m[6] !== undefined || m[7] !== undefined) out.push({ t: 'strong', c: parseInline(m[6] ?? m[7]!) });
    else if (m[8] !== undefined || m[9] !== undefined) out.push({ t: 'em', c: parseInline(m[8] ?? m[9]!) });
    else if (m[10] !== undefined) {
      const href = safeHref(m[10]);
      if (href) out.push({ t: 'link', href, c: [{ t: 'text', v: m[10] }] });
      else text(m[10]);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

export function parseMarkdown(md: string): Block[] {
  // Fuera comentarios HTML y etiquetas sueltas (GitHub las admite; aqui no se pintan).
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[a-z][^>]*>/gi, '').split(/\r?\n/);
  const out: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) out.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      endPara();
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i]!);
      out.push({ t: 'code', v: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      endPara();
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      endPara();
      out.push({ t: 'h', level: h[1]!.length, c: parseInline(h[2]!) });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      endPara();
      out.push({ t: 'hr' });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      endPara();
      const prev = out[out.length - 1];
      if (prev?.t === 'quote' && i > 0 && /^\s*>/.test(lines[i - 1]!)) prev.c.push({ t: 'text', v: ' ' }, ...parseInline(q[1]!));
      else out.push({ t: 'quote', c: parseInline(q[1]!) });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      endPara();
      const ordered = /\d/.test(li[2]!);
      const depth = Math.min(1, Math.floor(li[1]!.replace(/\t/g, '  ').length / 2));
      const prev = out[out.length - 1];
      const item = { depth, c: parseInline(li[3]!) };
      if (prev?.t === 'list' && (prev.ordered === ordered || depth > 0)) prev.items.push(item);
      else out.push({ t: 'list', ordered, items: [item] });
      continue;
    }
    // Linea que sigue a un elemento de lista con sangria: es parte de el.
    const prev = out[out.length - 1];
    if (!para.length && prev?.t === 'list' && /^\s{2,}\S/.test(line)) {
      prev.items[prev.items.length - 1]!.c.push({ t: 'text', v: ' ' }, ...parseInline(line.trim()));
      continue;
    }
    para.push(line.trim());
  }
  endPara();
  return out;
}
