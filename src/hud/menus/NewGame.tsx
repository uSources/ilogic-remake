import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import type { UIState } from '../state';
import { ui } from '../store';

/** Nueva partida: vista previa del mapa con su codigo, modos, generales y opciones de "Personalizada". */
export function NewGame({ s }: { s: UIState }) {
  const g = s.setup;
  const a = ui.actions;
  const f = g.focus;
  const sel = g.presets.find((p) => p.id === g.preset);
  return (
    <div class="px newgame2" role="dialog" aria-label={t('newGame')}>
      <span class="htitle">{t('newGame')}</span>
      <div class="ng-body">
        <div class="ng-preview">
          <div class="ng-map">
            <img src={g.thumb} alt={g.mapInfo} />
          </div>
          <span class="muted small">{g.mapInfo}</span>
          <div class="ng-coderow">
            <input
              class={`ng-code ${g.codeError ? 'bad' : ''} ${f === 'code' ? 'focus' : ''}`}
              value={g.code}
              maxLength={7}
              placeholder={g.mapCode}
              spellcheck={false}
              autocomplete="off"
              aria-label={t('mapCode')}
              onFocus={() => a.setupHover('code')}
              onMouseEnter={() => a.setupHover('code')}
              onInput={(e) => a.setupCode(e.currentTarget.value)}
            />
            <Btn sel={f === 'reroll'} cls="px-btn plain" onHover={() => a.setupHover('reroll')} onPick={() => a.setupPick('reroll')}>
              {t('otherMap')} <span class="key">R</span>
            </Btn>
          </div>
          {g.codeError && <span class="bad-note">{t('badCode')}</span>}
        </div>
        <div class="ng-side">
          <div class="presets">
            {g.presets.map((p) => (
              <Btn
                key={p.id}
                sel={f === `preset-${p.id}`}
                cls={`preset ${g.preset === p.id ? 'on' : ''}`}
                onHover={() => a.setupHover(`preset-${p.id}`)}
                onPick={() => a.setupPick(`preset-${p.id}`)}
              >
                {p.label}
              </Btn>
            ))}
          </div>
          {g.general && (
            <div class="ng-group ng-general">
              <span class="label">{g.general.label}</span>
              <Seg
                row={g.general}
                sel={f === g.general.id}
                onHover={() => a.setupHover('opt-general')}
                onSet={(i) => a.setupSet('opt-general', i)}
              />
              {g.generalNote && <p class="ng-note">{g.generalNote}</p>}
            </div>
          )}
          {g.enemyGeneral && (
            <div class="ng-group ng-general">
              <span class="label">{g.enemyGeneral.label}</span>
              <Seg
                row={g.enemyGeneral}
                sel={f === g.enemyGeneral.id}
                onHover={() => a.setupHover('opt-enemyGeneral')}
                onSet={(i) => a.setupSet('opt-enemyGeneral', i)}
              />
            </div>
          )}
          {g.preset === 'custom' ? (
            <div class="ng-groups">
              {g.groups.map((gr) => (
                <div class="ng-group" key={gr.title}>
                  <span class="label">{gr.title}</span>
                  {gr.rows.map((r) => (
                    <Seg key={r.id} row={r} sel={f === r.id} onHover={() => a.setupHover(r.id)} onSet={(i) => a.setupSet(r.id, i)} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p class="ng-note">{sel?.note}</p>
          )}
        </div>
      </div>
      <div class="ng-foot">
        <Btn sel={f === 'back'} cls="px-btn plain" onHover={() => a.setupHover('back')} onPick={() => a.setupPick('back')}>
          {t('back')} <span class="key">Esc</span>
        </Btn>
        <Btn sel={f === 'start'} cls="px-btn start" onHover={() => a.setupHover('start')} onPick={() => a.setupPick('start')}>
          {t('start')}
        </Btn>
      </div>
    </div>
  );
}
