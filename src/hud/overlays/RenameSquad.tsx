import { useEffect, useRef, useState } from 'preact/compat';
import { t } from '../../settings';
import { Veil } from '../common/Veil';
import type { UIState } from '../state';
import { ui } from '../store';

/** [CAMBIO] Cambiar el nombre de una escuadra. Las teclas no llegan al juego mientras se escribe. */
export function RenameSquad({ r }: { r: NonNullable<UIState['rename']> }) {
  const [name, setName] = useState(r.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const ok = () => ui.actions.renameSquad(r.id, name);
  return (
    <Veil kind="help-veil" onClose={() => ui.actions.renameClose()}>
      <form
        class="px rename"
        role="dialog"
        aria-label={t('squadName')}
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <span class="label">{t('squadName')}</span>
        <input
          ref={ref}
          type="text"
          value={name}
          maxLength={r.max}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Sin propagacion no llega al guardian de Tab (controls/browserKeys.ts): el foco no sale del cuadro.
            if (e.key === 'Tab') e.preventDefault();
            if (e.key === 'Escape') ui.actions.renameClose();
          }}
          onKeyUp={(e) => e.stopPropagation()}
        />
        {/* Botones normales (con foco y "submit"): aqui si se escribe con el teclado. */}
        <div class="rename-buttons">
          <button type="button" class="px-btn plain" onClick={() => ui.actions.renameClose()}>
            {t('cancel')}
          </button>
          <button type="submit" class="px-btn">
            {t('squadRename')}
          </button>
        </div>
      </form>
    </Veil>
  );
}
