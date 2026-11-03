import type { ComponentChildren } from 'preact';
import { closeNotes, openLink, selectNote } from '../../patchNotes';
import type { Block, Inline } from '../../patchNotes/markdown';
import { settings, t } from '../../settings';
import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import type { NotesVM } from '../vm/notes';

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(settings.lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Inl({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x): ComponentChildren => {
        switch (x.t) {
          case 'text':
            return x.v;
          case 'strong':
            return (
              <strong>
                <Inl c={x.c} />
              </strong>
            );
          case 'em':
            return (
              <em>
                <Inl c={x.c} />
              </em>
            );
          case 'code':
            return <code>{x.v}</code>;
          case 'link':
            return (
              <a href={x.href} target="_blank" rel="noopener noreferrer">
                <Inl c={x.c} />
              </a>
            );
        }
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b): ComponentChildren => {
        switch (b.t) {
          case 'h':
            return b.level <= 2 ? (
              <h3>
                <Inl c={b.c} />
              </h3>
            ) : (
              <h4>
                <Inl c={b.c} />
              </h4>
            );
          case 'p':
            return (
              <p>
                <Inl c={b.c} />
              </p>
            );
          case 'quote':
            return (
              <blockquote>
                <Inl c={b.c} />
              </blockquote>
            );
          case 'code':
            return <pre>{b.v}</pre>;
          case 'hr':
            return <hr />;
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag>
                {b.items.map((it) => (
                  <li class={it.depth ? 'sub' : ''}>
                    <Inl c={it.c} />
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </>
  );
}

/** Panel de novedades: lista de versiones a la izquierda y las notas de la elegida. */
export function PatchNotes({ n }: { n: NotesVM }) {
  const it = n.items[n.selected];
  const status =
    n.status === 'loading' ? t('notesLoading') : n.status === 'offline' ? t('notesOffline') : n.status === 'cached' ? t('notesCached') : '';
  return (
    <Veil kind="help-veil" onClose={closeNotes}>
      <div class="px notes" role="dialog" aria-label={t('news')}>
        <div class="help-head">
          <span class="htitle">{t('news')}</span>
          <Button class="px-btn plain" onClick={closeNotes}>
            {t('close')} <span class="key">Esc</span>
          </Button>
        </div>
        {n.update && (
          <div class="notes-update">
            <span>
              {t('notesUpdate')} <b>v{n.update.version}</b>{' '}
              <span class="muted">
                ({t('notesYouHave')} v{n.current})
              </span>
            </span>
            <Button class="px-btn" onClick={() => openLink(n.update!.url)}>
              {t('notesDownload')}
            </Button>
          </div>
        )}
        <div class="notes-body">
          <div class="notes-list" role="listbox">
            {n.items.map((x, i) => (
              <Button
                key={x.version}
                role="option"
                aria-selected={i === n.selected}
                class={`notes-ver ${i === n.selected ? 'sel' : ''}`}
                onClick={() => selectNote(i)}
                scrollTo={i === n.selected}
              >
                <span class="nv-top">
                  <span class="nv-num">v{x.version}</span>
                  {x.isNew && <span class="nv-tag new">{t('notesNew')}</span>}
                  {x.current && <span class="nv-tag">{t('notesCurrent')}</span>}
                  {x.prerelease && <span class="nv-tag">beta</span>}
                </span>
                {x.title && <span class="nv-title">{x.title}</span>}
                {x.date && <span class="nv-date">{fmtDate(x.date)}</span>}
              </Button>
            ))}
            {!n.items.length && <p class="muted">{t('notesEmpty')}</p>}
          </div>
          <article class="notes-text">
            {it && (
              <div class="nt-head">
                <span class="big">
                  v{it.version}
                  {it.title ? ` · ${it.title}` : ''}
                </span>
                {it.date && <span class="muted small">{fmtDate(it.date)}</span>}
              </div>
            )}
            <Blocks blocks={n.blocks} />
          </article>
        </div>
        <div class="notes-foot">
          <span class="muted small">{status}</span>
          <Button class="link" onClick={() => openLink(n.url ?? n.repoUrl)}>
            {t('notesOnGithub')} ↗
          </Button>
        </div>
      </div>
    </Veil>
  );
}
