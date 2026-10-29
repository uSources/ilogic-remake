// Comprueba y enseña las notas de la version de package.json tal como saldran en GitHub.
// Publicar no hace falta hacerlo a mano: al llegar a main un cambio de package.json o CHANGELOG.md,
// la Action .github/workflows/release.yml publica la Release (notas + ilogic.html) si es nueva, o
// pone al dia sus notas si ya existia.
//   npm run release
import { readFileSync } from 'node:fs';
import { releaseNotes } from './release-notes.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const n = releaseNotes(pkg.version);
console.log(`${n.name}\n\n${n.body}\n\nAl hacer push a main, GitHub publicara (o pondra al dia) la Release v${pkg.version}.`);
