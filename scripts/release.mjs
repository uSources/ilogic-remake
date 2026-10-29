// Publica la version de package.json como Release de GitHub, con las notas de CHANGELOG.md y el
// juego en un solo fichero (ilogic.html) adjunto. El juego lee estas Releases en "Novedades".
//
//   npm run release              compila y publica (o actualiza la Release si ya existia)
//   npm run release -- --dry-run solo enseña lo que publicaria
//
// Antes: subir la version en package.json, escribir su apartado en CHANGELOG.md, hacer commit
// y push. Necesita la CLI de GitHub (gh) con sesion iniciada y permiso de escritura en el repo.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dry = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const repo = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(pkg.repository?.url ?? '')?.[1];
if (!repo) throw new Error('Falta "repository" con la URL de GitHub en package.json');
const version = pkg.version;
const tag = `v${version}`;

// Apartado de esta version en el CHANGELOG (misma cabecera que lee el juego).
const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = md.split(/\r?\n/);
const head = new RegExp(`^##\\s+\\[?v?${version.replace(/\./g, '\\.')}\\]?(?:\\s*[-–(]\\s*(\\d{4}-\\d{2}-\\d{2})\\)?)?(?:\\s*[—–-]\\s*(.+?))?\\s*$`);
const start = lines.findIndex((l) => head.test(l));
if (start < 0) throw new Error(`CHANGELOG.md no tiene el apartado "## [${version}]"`);
const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
const [, , title] = head.exec(lines[start]);
const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
if (!body) throw new Error(`El apartado ${version} del CHANGELOG esta vacio`);
const name = title ? `${tag} — ${title}` : tag;

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Hay cambios sin commit: haz commit (y push) antes de publicar');
const sha = git('rev-parse', 'HEAD');

console.log(`Release ${name} en ${repo} (commit ${sha.slice(0, 7)})\n\n${body}\n`);
if (dry) process.exit(0);

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'build:single']);

const gh = (args, input) =>
  JSON.parse(execFileSync('gh', ['api', ...args], { cwd: root, encoding: 'utf8', input, maxBuffer: 64 << 20 }) || 'null');
const payload = JSON.stringify({ tag_name: tag, target_commitish: sha, name, body, prerelease: /-/.test(version) });
let rel = null;
try {
  rel = gh([`repos/${repo}/releases/tags/${tag}`]);
} catch {
  // no existe todavia
}
rel = rel
  ? gh(['--method', 'PATCH', `repos/${repo}/releases/${rel.id}`, '--input', '-'], payload)
  : gh(['--method', 'POST', `repos/${repo}/releases`, '--input', '-'], payload);

// Adjuntar el juego (sustituye al anterior si se vuelve a publicar).
const file = new URL('../dist-single/ilogic.html', import.meta.url);
for (const a of rel.assets ?? []) if (a.name === 'ilogic.html') gh(['--method', 'DELETE', `repos/${repo}/releases/assets/${a.id}`]);
execFileSync(
  'gh',
  ['api', '--method', 'POST', '-H', 'Content-Type: text/html', `https://uploads.github.com/repos/${repo}/releases/${rel.id}/assets?name=ilogic.html`, '--input', fileURLToPath(file)],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log(`\nPublicada: ${rel.html_url} (ilogic.html, ${(statSync(file).size / 1048576).toFixed(1)} MB)`);
