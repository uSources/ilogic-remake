import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OptionRowVM, SetupVM } from '../vm/menus';

/** Codigo de mapa: hasta 7 letras y numeros (texto badCode). */
const MAP_CODE_MAX = 7;

const hover = (id: string) => () => ui.actions.setupHover(id);
const pick = (id: string) => () => ui.actions.setupPick(id);

/** Vista previa del mapa, su codigo (que se puede escribir) y "Otro mapa". */
function MapPreview({ setup }: { setup: SetupVM }) {
  return (
    <div class="ng-preview">
      <div class="ng-map">
        <img src={setup.thumb} alt={setup.mapInfo} />
      </div>
      <span class="muted small">{setup.mapInfo}</span>
      <div class="ng-coderow">
        <input
          class={`ng-code ${setup.codeError ? 'bad' : ''} ${setup.focus === 'code' ? 'focus' : ''}`}
          value={setup.code}
          maxLength={MAP_CODE_MAX}
          placeholder={setup.mapCode}
          spellcheck={false}
          autocomplete="off"
          aria-label={t('mapCode')}
          onFocus={hover('code')}
          onMouseEnter={hover('code')}
          onInput={(event) => ui.actions.setupCode(event.currentTarget.value)}
        />
        <Btn sel={setup.focus === 'reroll'} cls="px-btn plain" onHover={hover('reroll')} onPick={pick('reroll')}>
          {t('otherMap')} <span class="key">R</span>
        </Btn>
      </div>
      {setup.codeError && <span class="bad-note">{t('badCode')}</span>}
    </div>
  );
}

/** Normal / Rapida / Personalizada. */
function Presets({ setup }: { setup: SetupVM }) {
  return (
    <div class="presets">
      {setup.presets.map((preset) => {
        const id = `preset-${preset.id}`;
        return (
          <Btn
            key={preset.id}
            sel={setup.focus === id}
            cls={`preset ${setup.preset === preset.id ? 'on' : ''}`}
            onHover={hover(id)}
            onPick={pick(id)}
          >
            {preset.label}
          </Btn>
        );
      })}
    </div>
  );
}

/** Eleccion de general (el tuyo, con lo que hace debajo, o el enemigo). */
function GeneralChoice({ row, focused, actionId, note }: { row: OptionRowVM; focused: string; actionId: string; note?: string }) {
  return (
    <div class="ng-group ng-general">
      <span class="label">{row.label}</span>
      <Seg row={row} sel={focused === row.id} onHover={hover(actionId)} onSet={(i) => ui.actions.setupSet(actionId, i)} />
      {note && <p class="ng-note">{note}</p>}
    </div>
  );
}

/** Opciones de "Personalizada", por grupos. */
function CustomOptions({ setup }: { setup: SetupVM }) {
  return (
    <div class="ng-groups">
      {setup.groups.map((group) => (
        <div class="ng-group" key={group.title}>
          <span class="label">{group.title}</span>
          {group.rows.map((row) => (
            <Seg
              key={row.id}
              row={row}
              sel={setup.focus === row.id}
              onHover={hover(row.id)}
              onSet={(i) => ui.actions.setupSet(row.id, i)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Nueva partida: vista previa del mapa con su codigo, modos, generales y opciones de "Personalizada". */
export function NewGame({ s }: { s: UIState }) {
  const setup = s.setup;
  const preset = setup.presets.find((p) => p.id === setup.preset);
  return (
    <div class="px newgame2" role="dialog" aria-label={t('newGame')}>
      <span class="htitle">{t('newGame')}</span>
      <div class="ng-body">
        <MapPreview setup={setup} />
        <div class="ng-side">
          <Presets setup={setup} />
          {setup.general && <GeneralChoice row={setup.general} focused={setup.focus} actionId="opt-general" note={setup.generalNote} />}
          {setup.enemyGeneral && <GeneralChoice row={setup.enemyGeneral} focused={setup.focus} actionId="opt-enemyGeneral" />}
          {setup.preset === 'custom' ? <CustomOptions setup={setup} /> : <p class="ng-note">{preset?.note}</p>}
        </div>
      </div>
      <div class="ng-foot">
        <Btn sel={setup.focus === 'back'} cls="px-btn plain" onHover={hover('back')} onPick={pick('back')}>
          {t('back')} <span class="key">Esc</span>
        </Btn>
        <Btn sel={setup.focus === 'start'} cls="px-btn start" onHover={hover('start')} onPick={pick('start')}>
          {t('start')}
        </Btn>
      </div>
    </div>
  );
}
