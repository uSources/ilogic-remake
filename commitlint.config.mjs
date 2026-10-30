// Commits con gitmoji: "✨ Asunto". La lista de emojis (y que apartado de las notas de parche le toca a
// cada uno) esta en tools/git/gitmoji.json. Lo comprueba el hook .githooks/commit-msg y, en los PR,
// .github/workflows/commits.yml. Guia: docs/COMMITS.md.
import { readFileSync } from 'node:fs';

const { emojis } = JSON.parse(readFileSync(new URL('./tools/git/gitmoji.json', import.meta.url), 'utf8'));
const allowed = emojis.map((e) => e.emoji);
// Mas largos primero: "⚖️" (con selector de variante) antes que un prefijo suyo.
const byLength = [...allowed].sort((a, b) => b.length - a.length);

/** Emoji del principio del asunto (de la lista) o null. */
export function leadingEmoji(header) {
  return byLength.find((e) => header.startsWith(`${e} `)) ?? null;
}

export default {
  helpUrl: 'docs/COMMITS.md',
  ignores: [(msg) => /^(Merge|Revert|fixup!|squash!) /.test(msg)],
  plugins: [
    {
      rules: {
        'gitmoji-start': ({ header }) => {
          if (leadingEmoji(header ?? '')) return [true];
          return [
            false,
            `el asunto empieza por un emoji de la lista y un espacio, p. ej. "✨ Campaña nueva". Permitidos: ${allowed.join(' ')}`,
          ];
        },
        'gitmoji-subject': ({ header }) => {
          const e = leadingEmoji(header ?? '');
          const rest = e ? header.slice(e.length + 1) : '';
          if (!e || (rest.trim().length >= 3 && !rest.endsWith('.'))) return [true];
          return [false, 'despues del emoji va un asunto de al menos 3 letras, sin punto al final'];
        },
      },
    },
  ],
  rules: {
    'gitmoji-start': [2, 'always'],
    'gitmoji-subject': [2, 'always'],
    'header-max-length': [2, 'always', 120],
    'body-leading-blank': [2, 'always'],
  },
};
