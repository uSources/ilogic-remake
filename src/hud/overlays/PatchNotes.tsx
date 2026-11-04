import type { ComponentChildren } from 'preact';
import { closeNotes, openLink, selectNote } from '../../patchNotes';
import type { Block, Inline } from '../../patchNotes/markdown';
import { settings, t, type TextKey } from '../../settings';
import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import type { NotesVM } from '../vm/notes';

type NoteVersion = NotesVM['items'][number];

/** Aviso de abajo segun de donde salen las notas (con conexion no hace falta decir nada). */
const STATUS_TEXT: Record<NotesVM['status'], TextKey | null> = {
  loading: 'notesLoading',
  offline: 'notesOffline',
  cached: 'notesCached',
  online: null,
};

/** "3 nov 2026" en el idioma del juego; si la fecha no se entiende, tal cual. */
function formatDate(isoDate: string): string {
  if (!isoDate) return '';
  // A mediodia, para que ningun huso horario la pase al dia de antes o de despues.
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(settings.lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Texto con formato dentro de un parrafo (negrita, cursiva, codigo, enlaces). */
function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part): ComponentChildren => {
        switch (part.t) {
          case 'text':
            return part.v;
          case 'strong':
            return (
              <strong>
                <InlineText parts={part.c} />
              </strong>
            );
          case 'em':
            return (
              <em>
                <InlineText parts={part.c} />
              </em>
            );
          case 'code':
            return <code>{part.v}</code>;
          case 'link':
            return (
              <a href={part.href} target="_blank" rel="noopener noreferrer">
                <InlineText parts={part.c} />
              </a>
            );
        }
      })}
    </>
  );
}

function List({ block }: { block: Extract<Block, { t: 'list' }> }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {block.items.map((item) => (
        <li class={item.depth ? 'sub' : ''}>
          <InlineText parts={item.c} />
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
        switch (block.t) {
          case 'h':
            return block.level <= 2 ? (
              <h3>
                <InlineText parts={block.c} />
              </h3>
            ) : (
              <h4>
                <InlineText parts={block.c} />
              </h4>
            );
          case 'p':
            return (
              <p>
                <InlineText parts={block.c} />
              </p>
            );
          case 'quote':
            return (
              <blockquote>
                <InlineText parts={block.c} />
              </blockquote>
            );
          case 'code':
            return <pre>{block.v}</pre>;
          case 'hr':
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
        <span class="nv-num">v{version.version}</span>
        {version.isNew && <span class="nv-tag new">{t('notesNew')}</span>}
        {version.current && <span class="nv-tag">{t('notesCurrent')}</span>}
        {version.prerelease && <span class="nv-tag">beta</span>}
      </span>
      {version.title && <span class="nv-title">{version.title}</span>}
      {version.date && <span class="nv-date">{formatDate(version.date)}</span>}
    </Button>
  );
}

function VersionHeader({ version }: { version: NoteVersion }) {
  return (
    <div class="nt-head">
      <span class="big">
        v{version.version}
        {version.title ? ` · ${version.title}` : ''}
      </span>
      {version.date && <span class="muted small">{formatDate(version.date)}</span>}
    </div>
  );
}

/** Panel de novedades: lista de versiones a la izquierda y las notas de la elegida. */
export function PatchNotes({ notes }: { notes: NotesVM }) {
  const selected = notes.items[notes.selected];
  const statusKey = STATUS_TEXT[notes.status];
  return (
    <Veil kind="help-veil" onClose={closeNotes}>
      <div class="px notes" role="dialog" aria-label={t('news')}>
        <div class="help-head">
          <span class="htitle">{t('news')}</span>
          <Button class="px-btn plain" onClick={closeNotes}>
            {t('close')} <span class="key">Esc</span>
          </Button>
        </div>
        {notes.update && <UpdateBanner update={notes.update} current={notes.current} />}
        <div class="notes-body">
          <div class="notes-list" role="listbox">
            {notes.items.map((version, i) => (
              <VersionButton key={version.version} version={version} index={i} isSelected={i === notes.selected} />
            ))}
            {!notes.items.length && <p class="muted">{t('notesEmpty')}</p>}
          </div>
          <article class="notes-text">
            {selected && <VersionHeader version={selected} />}
            <Blocks blocks={notes.blocks} />
          </article>
        </div>
        <div class="notes-foot">
          <span class="muted small">{statusKey ? t(statusKey) : ''}</span>
          <Button class="link" onClick={() => openLink(notes.url ?? notes.repoUrl)}>
            {t('notesOnGithub')} ↗
          </Button>
        </div>
      </div>
    </Veil>
  );
}
