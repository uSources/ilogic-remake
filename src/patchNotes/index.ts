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

function newest(): string | null {
  return notes.find((n) => !n.prerelease)?.version ?? notes[0]?.version ?? null;
}

/** Version publicada mas nueva que la que se juega (o null). */
function update(): PatchNote | null {
  const n = notes.find((x) => !x.prerelease && x.url);
  return n && compareVersions(n.version, APP_VERSION) > 0 ? n : null;
}

function publishBadge(): void {
  const top = newest();
  const seen = readSeen();
  const up = update();
  ui.set({
    newsBadge: !!top && (!seen || compareVersions(top, seen) > 0),
    updateAvailable: up ? up.version : null,
  });
}

/** Mira en GitHub si hay notas nuevas (una vez; se puede volver a llamar sin gastar). */
export function checkNotes(force = false): Promise<void> {
  if (checking && !force) return checking;
  checking = fetchReleases(NOTES_REPO, force).then((r) => {
    notes = mergeNotes(local, r.notes);
    status = r.status;
    publishBadge();
    if (ui.get().notes) publish();
  });
  return checking;
}

function publish(): void {
  const lang = settings.lang;
  const n = notes[selected];
  const up = update();
  ui.set({
    notes: {
      status,
      current: APP_VERSION,
      repoUrl: `https://github.com/${NOTES_REPO}/releases`,
      update: up ? { version: up.version, url: up.download ?? up.url! } : null,
      items: notes.map((x) => ({
        version: x.version,
        title: x.title,
        date: x.date,
        isNew: !seenBefore || compareVersions(x.version, seenBefore) > 0,
        current: x.version === APP_VERSION,
        prerelease: x.prerelease,
      })),
      selected,
      blocks: n ? parseMarkdown(n.body[lang]) : [],
      url: n?.url ?? null,
    },
  });
}

export function openNotes(): void {
  seenBefore = readSeen();
  selected = 0;
  const top = newest();
  try {
    if (top) localStorage.setItem(SEEN_KEY, top);
  } catch {
    // sin almacenamiento
  }
  publish();
  publishBadge();
  void checkNotes().then(() => {
    // Lo que llega de GitHub tambien cuenta como visto.
    const t = newest();
    try {
      if (t && ui.get().notes) localStorage.setItem(SEEN_KEY, t);
    } catch {
      // sin almacenamiento
    }
    publishBadge();
  });
}

export function closeNotes(): void {
  ui.set({ notes: null });
}

export function selectNote(i: number): void {
  if (i < 0 || i >= notes.length) return;
  selected = i;
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
