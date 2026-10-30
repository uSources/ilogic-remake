import { describe, expect, it } from 'vitest';
import commitlintConfig, { leadingEmoji } from '../commitlint.config.mjs';
import { buildDraft, DRAFT_END, DRAFT_START, GITMOJI, insertDraft, parseSubject, renderDraft } from '../tools/notes/draft';

const c = (subject: string) => ({ hash: subject, subject });

describe('commits con gitmoji', () => {
  it('reconoce el emoji (tambien los que llevan selector de variante)', () => {
    expect(parseSubject('⚖️ Tanque más barato')?.gitmoji.emoji).toBe('⚖️');
    expect(parseSubject('⚡️ Atlas mas pequeño')?.text).toBe('Atlas mas pequeño');
    expect(parseSubject('Sin emoji')).toBeNull();
    expect(parseSubject('🦄 Emoji que no esta')).toBeNull();
    expect(leadingEmoji('✨ Campaña')).toBe('✨');
  });

  it('commitlint y las notas usan la misma lista sin repetidos', () => {
    const list = GITMOJI.map((g) => g.emoji);
    expect(new Set(list).size).toBe(list.length);
    expect(Object.keys(commitlintConfig.rules)).toContain('gitmoji-start');
  });
});

describe('borrador de notas de parche', () => {
  const draft = buildDraft([
    c('✨ Campaña nueva'),
    c('📝 Docs'),
    c('🐛 La captura a medias se perdia'),
    c('⚖️ Tanque a 10000'),
    c('✨ Mapas de 48'),
    c('Viejo sin emoji'),
    c('👷 CI'),
  ]);

  it('agrupa por apartado en el orden de la lista y deja fuera lo interno', () => {
    expect(draft.sections.map((s) => s.title.es)).toEqual(['Novedades', 'Equilibrio', 'Arreglos']);
    expect(draft.sections[0]!.items).toEqual(['Campaña nueva', 'Mapas de 48']);
    expect(draft.internal).toBe(2);
    expect(draft.unknown).toEqual(['Viejo sin emoji']);
  });

  it('en ingles marca lo que hay que traducir', () => {
    expect(renderDraft(draft, 'en')).toContain('### New\n- (traducir) Campaña nueva');
    expect(renderDraft(buildDraft([c('📝 Docs')]), 'es')).toBe('');
  });

  it('lo mete en [Sin publicar] sin tocar lo escrito a mano, y sustituye el borrador anterior', () => {
    const md =
      '# Notas\n\n## [Sin publicar]\n\n### Equilibrio\n- A mano\n\n<!-- en -->\n\n### Balance\n- By hand\n\n## [0.1.0] - 2026-10-29\n\nViejo\n';
    const once = insertDraft(md, draft);
    const twice = insertDraft(once, draft);
    expect(twice).toBe(once);
    expect(once.split(DRAFT_START)).toHaveLength(3); // uno en cada idioma
    expect(once).toContain('- A mano');
    expect(once).toContain('- By hand');
    expect(once.indexOf(DRAFT_END)).toBeLessThan(once.indexOf('<!-- en -->'));
    expect(once).toContain('## [0.1.0] - 2026-10-29\n\nViejo\n');
  });

  it('crea [Sin publicar] si no esta', () => {
    const out = insertDraft('# Notas\n\n## [0.1.0] - 2026-10-29\n\nViejo\n', draft);
    expect(out.indexOf('## [Sin publicar]')).toBeLessThan(out.indexOf('## [0.1.0]'));
    expect(out).toContain('### Novedades\n- Campaña nueva\n- Mapas de 48');
  });
});
