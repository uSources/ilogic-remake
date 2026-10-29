// Saca la version de package.json: comprueba el CHANGELOG, crea la etiqueta vX.Y.Z y la sube.
// Al llegar la etiqueta a GitHub, la Action .github/workflows/release.yml compila el juego y publica
// la Release con esas notas y ilogic.html adjunto. El juego lee esas Releases en "Novedades".
//
//   npm run release              etiqueta y sube (la Release la hace GitHub)
//   npm run release -- --dry-run solo enseña lo que publicaria
//
// Antes: subir la version en package.json, escribir su apartado en CHANGELOG.md, commit y push.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { releaseNotes } from './release-notes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dry = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = `v${pkg.version}`;
const notes = releaseNotes(pkg.version);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

console.log(`${notes.name}\n\n${notes.body}\n`);
if (dry) process.exit(0);
if (git('status', '--porcelain')) throw new Error('Hay cambios sin commit: haz commit (y push) antes de publicar');
const branch = git('rev-parse', '--abbrev-ref', '@{upstream}');
git('fetch', '--quiet', ...branch.split('/', 1), branch.split('/').slice(1).join('/'));
if (git('rev-parse', 'HEAD') !== git('rev-parse', branch)) throw new Error(`Haz push primero: ${branch} no tiene este commit`);
if (git('tag', '--list', tag)) throw new Error(`La etiqueta ${tag} ya existe: sube la version en package.json`);
git('tag', '-a', tag, '-m', notes.name);
execFileSync('git', ['push', 'origin', tag], { cwd: root, stdio: 'inherit' });
console.log(`\nEtiqueta ${tag} subida: GitHub publicara la Release en unos minutos (pestaña Actions).`);
