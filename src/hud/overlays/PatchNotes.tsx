import type { ComponentChildren } from 'preact';
import { closeNotes, openLink, selectNote } from '../../patchNotes';
import type { Block, Inline } from '../../patchNotes/markdown';
import { settings, t, type TextKey } from '../../settings';
import { Button } from '../common/buttons';
import { MenuPage } from '../menus/MenuPage';
import type { NotesVM } from '../vm/notes';

type NoteVersion = NotesVM['items'][number];

/** Aviso de abajo segun de donde salen las notas (con conexion no hace falta decir nada). */
const STATUS_TEXT: Record<NotesVM['status'], TextKey | null> = {
  loading: 'notesLoading',
  offline: 'notesOffline',
  cached: 'notesCached',
  online: null,
};

/** La fecha en el idioma del juego: corta en la lista («24 nov») y larga arriba de las notas; si no se entiende, tal cual. */
function formatDate(isoDate: string, length: 'short' | 'long'): string {
  if (!isoDate) return '';
  // A mediodia, para que ningun huso horario la pase al dia de antes o de despues.
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const shape: Intl.DateTimeFormatOptions =
    length === 'short' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString(settings.lang === 'es' ? 'es-ES' : 'en-GB', shape);
}

/** Texto con formato dentro de un parrafo (negrita, cursiva, codigo, enlaces). */
function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part): ComponentChildren => {
        switch (part.kind) {
          case 'text':
            return part.text;
          case 'strong':
            return (
              <strong>
                <InlineText parts={part.children} />
              </strong>
            );
          case 'em':
            return (
              <em>
                <InlineText parts={part.children} />
              </em>
            );
          case 'code':
            return <code>{part.text}</code>;
          case 'link':
            return (
              <a href={part.href} target="_blank" rel="noopener noreferrer">
                <InlineText parts={part.children} />
              </a>
            );
        }
      })}
    </>
  );
}

function List({ block }: { block: Extract<Block, { kind: 'list' }> }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {block.items.map((item) => (
        <li class={item.depth ? 'sub' : ''}>
          <InlineText parts={item.children} />
        </li>
      ))}
    </Tag>
  );
}

/** Las notas de una version, ya pasadas de Markdown a bloques (src/patchNotes/markdown.ts). */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block): ComponentChildren => {
        switch (block.kind) {
          case 'heading':
            return block.level <= 2 ? (
              <h3>
                <InlineText parts={block.children} />
              </h3>
            ) : (
              <h4>
                <InlineText parts={block.children} />
              </h4>
            );
          case 'paragraph':
            return (
              <p>
                <InlineText parts={block.children} />
              </p>
            );
          case 'quote':
            return (
              <blockquote>
                <InlineText parts={block.children} />
              </blockquote>
            );
          case 'code':
            return <pre>{block.text}</pre>;
          case 'rule':
            return <hr />;
          case 'list':
            return <List block={block} />;
        }
      })}
    </>
  );
}

/** "Hay una versión nueva: v1.2 (tienes la v1.1)" con su boton de descarga. */
function UpdateBanner({ update, current }: { update: NonNullable<NotesVM['update']>; current: string }) {
  return (
    <div class="notes-update">
      <span>
        {t('notesUpdate')} <b>v{update.version}</b>{' '}
        <span class="muted">
          ({t('notesYouHave')} v{current})
        </span>
      </span>
      <Button class="px-btn" onClick={() => openLink(update.url)}>
        {t('notesDownload')}
      </Button>
    </div>
  );
}

/** Lo que dice de una version: nueva, la que tienes o de prueba. */
function VersionTags({ version }: { version: NoteVersion }) {
  return (
    <>
      {version.isNew && <span class="nv-tag new">{t('notesNew')}</span>}
      {version.current && <span class="nv-tag">{t('notesCurrent')}</span>}
      {version.prerelease && <span class="nv-tag">beta</span>}
    </>
  );
}

/** Una version de la lista de la derecha: su numero y su fecha, y debajo su titulo. */
function VersionButton({ version, index, isSelected }: { version: NoteVersion; index: number; isSelected: boolean }) {
  return (
    <Button
      role="option"
      aria-selected={isSelected}
      class={`notes-ver ${isSelected ? 'sel' : ''}`}
      onClick={() => selectNote(index)}
      scrollTo={isSelected}
    >
      <span class="nv-top">
        <span class="nv-num">{version.version}</span>
        {version.date && <span class="nv-date">· {formatDate(version.date, 'short')}</span>}
        <VersionTags version={version} />
      </span>
      {version.title && <span class="nv-title">{version.title}</span>}
    </Button>
  );
}

/** Arriba de las notas: «Versión 0.17.0 · 24 de noviembre de 2026» y el titulo en grande. */
function VersionHeader({ version }: { version: NoteVersion }) {
  const date = version.date ? ` · ${formatDate(version.date, 'long')}` : '';
  return (
    <header class="nt-head">
      <span class="page-eyebrow">
        {t('notesVersion')} {version.version}
        {date}
      </span>
      <h1 class="nt-title">{version.title || `v${version.version}`}</h1>
    </header>
  );
}

/**
 * Novedades, como texto para leer: las notas de la version elegida en grande y, a la derecha, las
 * otras versiones (en el movil, una fila de chapas encima).
 */
export function PatchNotes({ notes }: { notes: NotesVM }) {
  const selected = notes.items[notes.selected];
  const statusKey = STATUS_TEXT[notes.status];
  return (
    <MenuPage tab="news" title={t('news')} onClose={closeNotes} cls="notes-page">
      <div class="page-body notes-body">
        <article class="page-card notes-text">
          {notes.update && <UpdateBanner update={notes.update} current={notes.current} />}
          {selected && <VersionHeader version={selected} />}
          <Blocks blocks={notes.blocks} />
          {!notes.items.length && <p class="muted">{t('notesEmpty')}</p>}
        </article>
        <nav class="notes-versions" aria-label={t('notesOther')}>
          <span class="page-eyebrow">{t('notesOther')}</span>
          <div class="notes-list" role="listbox">
            {notes.items.map((version, i) => (
              <VersionButton key={version.version} version={version} index={i} isSelected={i === notes.selected} />
            ))}
          </div>
          <Button class="notes-github" onClick={() => openLink(notes.url ?? notes.repoUrl)}>
            {t('notesOnGithub')} ▸
          </Button>
          {statusKey && <span class="page-hint">{t(statusKey)}</span>}
          <span class="page-hint keys-hint">{t('notesHint')}</span>
        </nav>
      </div>
    </MenuPage>
  );
}
