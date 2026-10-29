// Saca de CHANGELOG.md las notas de una version (por defecto la de package.json).
//   node scripts/release-notes.mjs [version]  → escribe el texto; con --title escribe el titulo
import { readFileSync } from 'node:fs';

export function releaseNotes(version) {
  const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const lines = md.split(/\r?\n/);
  const head = new RegExp(`^##\\s+\\[?v?${version.replace(/\./g, '\\.')}\\]?(?:\\s*[-–(]\\s*(\\d{4}-\\d{2}-\\d{2})\\)?)?(?:\\s*[—–-]\\s*(.+?))?\\s*$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) throw new Error(`CHANGELOG.md no tiene el apartado "## [${version}]"`);
  const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  const title = head.exec(lines[start])[2] ?? '';
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  if (!body) throw new Error(`El apartado ${version} del CHANGELOG esta vacio`);
  return { title, body, name: title ? `v${version} — ${title}` : `v${version}` };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('release-notes.mjs')) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const args = process.argv.slice(2);
  const version = (args.find((a) => !a.startsWith('--')) ?? pkg.version).replace(/^v/, '');
  const n = releaseNotes(version);
  process.stdout.write(args.includes('--title') ? n.name : `${n.body}\n`);
}
