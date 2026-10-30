/**
 * Borrador de notas de parche desde los commits de la version en curso.
 *
 *   npm run notes            enseña el borrador (y cuantos commits son internos)
 *   npm run notes -- --write  lo mete en CHANGELOG.md, apartado [Sin publicar] (es y en)
 *
 * "Version en curso" = commits despues de la ultima version del CHANGELOG ("## [x.y.z]"): su etiqueta
 * vx.y.z si esta (o el commit equivalente si la historia se reescribio); si no, el commit que añadio esa
 * cabecera al CHANGELOG. El borrador hay que reescribirlo para el
 * jugador y traducirlo: la Release no sale mientras queden sus marcas (scripts/release-notes.mjs).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDraft, insertDraft, renderDraft, type Commit } from './draft';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHANGELOG = `${ROOT}CHANGELOG.md`;
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function lastRelease(changelog: string): { version: string; commit: string } | null {
  const version = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1];
  if (!version) return null;
  const commit = tagCommit(`v${version}`) ?? addedHeading(version);
  return commit ? { version, commit } : null;
}

/** Commit de la etiqueta en esta historia (si la historia se reescribio, el equivalente por autor y fecha). */
function tagCommit(tag: string): string | null {
  let c: string;
  try {
    c = git('rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`).trim();
  } catch {
    return null;
  }
  try {
    git('merge-base', '--is-ancestor', c, 'HEAD');
    return c;
  } catch {
    const id = git('log', '-1', '--format=%at %ae', c).trim();
    const match = git('log', '--format=%H %at %ae', 'HEAD')
      .split('\n')
      .find((l) => l.slice(41) === id);
    return match?.slice(0, 40) ?? null;
  }
}

/** El commit mas antiguo que añadio la cabecera de esa version al CHANGELOG. */
function addedHeading(version: string): string | null {
  const added = git('log', '--format=%H', '-S', `## [${version}]`, '--', 'CHANGELOG.md').trim().split('\n').filter(Boolean);
  return added.at(-1) ?? null;
}

function commitsSince(from: string | null): Commit[] {
  const range = from ? [`${from}..HEAD`] : ['HEAD'];
  const out = git('log', '--reverse', '--format=%H%x1f%s%x1f%b%x1e', ...range);
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash = '', subject = '', body = ''] = r.split('\x1f');
      return { hash, subject, body };
    });
}

function main(): void {
  const md = readFileSync(CHANGELOG, 'utf8');
  const rel = lastRelease(md);
  const commits = commitsSince(rel?.commit ?? null);
  const draft = buildDraft(commits);
  const since = rel ? `desde la ${rel.version} (${rel.commit.slice(0, 7)})` : 'desde el principio';
  console.log(
    `${commits.length} commits ${since}: ${commits.length - draft.internal - draft.unknown.length} para el jugador, ${draft.internal} internos.`,
  );
  if (draft.unknown.length) console.log(`Sin emoji de la lista (no salen): ${draft.unknown.join(' | ')}`);
  if (process.argv.includes('--write')) {
    writeFileSync(CHANGELOG, insertDraft(md, draft));
    console.log('Borrador escrito en CHANGELOG.md, [Sin publicar]. Reescribirlo para el jugador, traducirlo y borrar las marcas.');
  } else console.log(`\n${renderDraft(draft, 'es') || '(nada para el jugador)'}`);
}

main();
