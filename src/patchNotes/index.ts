import changelog from '../../CHANGELOG.md?raw';
import { ui } from '../hud/store';
import type { MenuCommand } from '../controls/menu';
import { settings } from '../settings';
import { fetchReleases, type FetchStatus } from './github';
import { parseMarkdown } from './markdown';
import { compareVersions, mergeNotes, parseChangelog, type PatchNote } from './notes';

/**
 * Panel de "Novedades": notas de parche de GitHub (Releases) con las del CHANGELOG del juego
 * como respaldo sin conexion. Avisa con una marca en el menu si hay notas sin leer y si hay una
 * version del juego mas nueva que la que se esta jugando.
 */

export const APP_VERSION = __APP_VERSION__;
export const NOTES_REPO = __NOTES_REPO__;
const SEEN_KEY = 'ilogic.notesSeen';

const local = parseChangelog(changelog);
let notes: PatchNote[] = local;
let status: FetchStatus | 'loading' = 'loading';
let selected = 0;
/** Ultima version vista al abrir el panel (para marcar las nuevas). */
let seenBefore: string | null = null;
let checking: Promise<void> | null = null;

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** Apunta esa version como la ultima vista (sin almacenamiento, no se apunta). */
function rememberSeen(version: string | null): void {
  try {
    if (version) localStorage.setItem(SEEN_KEY, version);
  } catch {
    // sin almacenamiento
  }
}

function newest(): string | null {
  return notes.find((note) => !note.prerelease)?.version ?? notes[0]?.version ?? null;
}

/** Version publicada mas nueva que la que se juega, con su pagina en GitHub (o null). */
function newerRelease(): (PatchNote & { url: string }) | null {
  const release = notes.find((note): note is PatchNote & { url: string } => !note.prerelease && !!note.url);
  return release && compareVersions(release.version, APP_VERSION) > 0 ? release : null;
}

function publishBadge(): void {
  const top = newest();
  const seen = readSeen();
  const newer = newerRelease();
  ui.set({
    newsBadge: !!top && (!seen || compareVersions(top, seen) > 0),
    updateAvailable: newer ? newer.version : null,
  });
}

/** Mira en GitHub si hay notas nuevas (una vez; se puede volver a llamar sin gastar). */
export function checkNotes(force = false): Promise<void> {
  if (checking && !force) return checking;
  checking = fetchReleases(NOTES_REPO, force).then((fetched) => {
    notes = mergeNotes(local, fetched.notes);
    status = fetched.status;
    publishBadge();
    if (ui.get().notes) publish();
  });
  return checking;
}

function publish(): void {
  const lang = settings.lang;
  const note = notes[selected];
  const newer = newerRelease();
  ui.set({
    notes: {
      status,
      current: APP_VERSION,
      repoUrl: `https://github.com/${NOTES_REPO}/releases`,
      update: newer ? { version: newer.version, url: newer.download ?? newer.url } : null,
      items: notes.map((item) => ({
        version: item.version,
        title: item.title,
        date: item.date,
        isNew: !seenBefore || compareVersions(item.version, seenBefore) > 0,
        current: item.version === APP_VERSION,
        prerelease: item.prerelease,
      })),
      selected,
      blocks: note ? parseMarkdown(note.body[lang]) : [],
      url: note?.url ?? null,
    },
  });
}

export function openNotes(): void {
  seenBefore = readSeen();
  selected = 0;
  rememberSeen(newest());
  publish();
  publishBadge();
  void checkNotes().then(() => {
    // Lo que llega de GitHub tambien cuenta como visto (si el panel sigue abierto).
    if (ui.get().notes) rememberSeen(newest());
    publishBadge();
  });
}

export function closeNotes(): void {
  ui.set({ notes: null });
}

export function selectNote(index: number): void {
  if (index < 0 || index >= notes.length) return;
  selected = index;
  publish();
}

export function openLink(url: string | null): void {
  if (url) window.open(url, '_blank', 'noopener');
}

/** El panel esta abierto (entonces se queda con todas las ordenes de menu). */
export function notesOpen(): boolean {
  return !!ui.get().notes;
}

/** Ordenes de menu con el panel abierto (teclas en MENU_BINDINGS.notes, src/controls/menu.ts). */
export function notesCommand(cmd: MenuCommand): void {
  if (cmd.kind === 'back' || cmd.kind === 'notes') closeNotes();
  else if (cmd.kind === 'move' && cmd.dy) selectNote(selected + cmd.dy);
  else if (cmd.kind === 'ok' && !cmd.repeat) openLink(notes[selected]?.url ?? null);
}
