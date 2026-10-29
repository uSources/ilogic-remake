import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '../src/patchNotes/markdown';
import { compareVersions, fromRelease, mergeNotes, parseChangelog, splitLangs } from '../src/patchNotes/notes';

describe('notas de parche', () => {
  it('compara versiones (semver, con v y prereleases)', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('lee el CHANGELOG del juego: la version de package.json tiene notas en los dos idiomas', () => {
    const notes = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const n = notes.find((x) => x.version === pkg.version);
    expect(n).toBeTruthy();
    expect(n!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(n!.body.es).not.toBe(n!.body.en);
    expect(n!.body.es).not.toContain('<!--');
  });

  it('separa los idiomas y ordena de nueva a vieja', () => {
    const md = '# X\n\n## [0.1.0] - 2026-01-01\nuno\n\n## [0.2.0] - 2026-02-01 — Tanques\nhola\n<!-- en -->\nhello\n';
    const [a, b] = parseChangelog(md);
    expect(a!.version).toBe('0.2.0');
    expect(a!.title).toBe('Tanques');
    expect(a!.body).toEqual({ es: 'hola', en: 'hello' });
    expect(b!.body).toEqual({ es: 'uno', en: 'uno' });
    expect(splitLangs('solo')).toEqual({ es: 'solo', en: 'solo' });
  });

  it('convierte Releases de GitHub y se queda con su texto al unir', () => {
    const r = fromRelease({
      tag_name: 'v0.2.0',
      name: 'v0.2.0 — Tanques',
      body: 'nuevo',
      html_url: 'https://github.com/a/b/releases/tag/v0.2.0',
      published_at: '2026-11-02T10:00:00Z',
      draft: false,
      prerelease: false,
      assets: [{ name: 'ilogic.html', browser_download_url: 'https://github.com/a/b/releases/download/v0.2.0/ilogic.html' }],
    })!;
    expect(r).toMatchObject({ version: '0.2.0', title: 'Tanques', date: '2026-11-02', download: expect.stringContaining('ilogic.html') });
    expect(fromRelease({ tag_name: 'v1', draft: true, prerelease: false, name: '', body: '', html_url: '', published_at: null })).toBeNull();
    const local = parseChangelog('## [0.2.0] - 2026-11-01\nlocal\n## [0.1.0] - 2026-10-29\nviejo\n');
    const merged = mergeNotes(local, [r, { ...r, version: '0.3.0', body: { es: '', en: '' } }]);
    expect(merged.map((n) => n.version)).toEqual(['0.3.0', '0.2.0', '0.1.0']);
    expect(merged[1]!.body.es).toBe('nuevo');
    expect(merged[2]!.url).toBeNull();
  });

  it('markdown: bloques, enlaces seguros y nada de HTML', () => {
    const b = parseMarkdown('### Novedades\n- **Campaña** con `6` misiones\n  - sub\n1. uno\n\n<script>alert(1)</script>texto [x](javascript:alert(1)) y https://github.com/a/b.\n\n---\n> cita');
    expect(b.map((x) => x.t)).toEqual(['h', 'list', 'list', 'p', 'hr', 'quote']);
    const list = b[1] as Extract<(typeof b)[number], { t: 'list' }>;
    expect(list.items.map((i) => i.depth)).toEqual([0, 1]);
    const p = JSON.stringify(b[3]);
    expect(p).not.toContain('script');
    expect(p).not.toContain('javascript');
    expect(p).toContain('"href":"https://github.com/a/b"');
    expect(parseInline('a *b* _c_ **d**').map((x) => x.t)).toEqual(['text', 'em', 'text', 'em', 'text', 'strong']);
  });
});
