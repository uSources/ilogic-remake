import { useEffect, useRef, useState } from 'preact/compat';
import { t } from '../../settings';
import { Veil } from '../common/Veil';
import type { UIState } from '../state';
import { ui } from '../store';

/** Mientras se escribe, las teclas se quedan en el cuadro y no llegan al juego. */
function keepKeyInInput(event: KeyboardEvent) {
  event.stopPropagation();
  // Sin propagacion no llega al guardian de Tab (controls/browserKeys.ts): el foco no sale del cuadro.
  if (event.key === 'Tab') event.preventDefault();
  if (event.key === 'Escape') ui.actions.renameClose();
}

/** [CAMBIO] Cambiar el nombre de una escuadra. Las teclas no llegan al juego mientras se escribe. */
export function RenameSquad({ rename }: { rename: NonNullable<UIState['rename']> }) {
  const [name, setName] = useState(rename.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Veil kind="help-veil" onClose={() => ui.actions.renameClose()}>
      <form
        class="px rename"
        role="dialog"
        aria-label={t('squadName')}
        onSubmit={(event) => {
          event.preventDefault();
          ui.actions.renameSquad(rename.id, name);
        }}
      >
        <span class="label">{t('squadName')}</span>
        <input
          ref={input}
          type="text"
          value={name}
          maxLength={rename.max}
          onInput={(event) => setName((event.target as HTMLInputElement).value)}
          onKeyDown={keepKeyInInput}
          onKeyUp={(event) => event.stopPropagation()}
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
