import { t } from '../../settings';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OptionRowVM, SetupVM } from '../vm/menus';
import { ChoiceEntry } from './ChoiceEntry';
import { MenuScreen } from './MenuScreen';
import { TextEntry } from './TextEntry';

/** Codigo de mapa: hasta 7 letras y numeros (texto badCode). */
const MAP_CODE_MAX = 7;
/** El foco del modo (Normal, Rápida, Personalizada), que se cambia como una opcion mas. */
const MODE_ID = 'mode';

const hover = (id: string) => () => ui.actions.setupHover(id);
const pick = (id: string) => () => ui.actions.setupPick(id);
const step = (id: string) => (delta: number) => ui.actions.setupStep(id, delta);

/** Una opcion con su valor: el rival o una de «Personalizada». */
function OptionEntry({ row, focused }: { row: OptionRowVM; focused: string }) {
  return (
    <ChoiceEntry
      sel={focused === row.id}
      title={row.label}
      value={row.choices[row.index] ?? ''}
      onHover={hover(row.id)}
      onStep={step(row.id)}
    />
  );
}

/** «Modo ◂ Normal ▸», con lo que da el modo elegido debajo. */
function ModeEntry({ setup }: { setup: SetupVM }) {
  const mode = setup.presets.find((preset) => preset.id === setup.preset);
  return (
    <ChoiceEntry
      sel={setup.focus === MODE_ID}
      title={t('mode')}
      value={mode?.label ?? ''}
      note={mode?.note}
      onHover={hover(MODE_ID)}
      onStep={step(MODE_ID)}
    />
  );
}

/** Las nueve opciones de «Personalizada», mas pequeñas y apartadas debajo del modo y el rival. */
function CustomOptions({ setup }: { setup: SetupVM }) {
  return (
    <div class="setup-custom">
      {setup.groups
        .flatMap((group) => group.rows)
        .map((row) => (
          <OptionEntry key={row.id} row={row} focused={setup.focus} />
        ))}
    </div>
  );
}

/** El codigo del mapa, que se puede escribir para jugar otro; si no vale, se avisa al empezar. */
function MapCode({ setup }: { setup: SetupVM }) {
  return (
    <label class="setup-code-row">
      <span class="menu-card-kicker">{t('setupCode')}</span>
      <input
        class={`setup-code ${setup.codeError ? 'bad' : ''} ${setup.focus === 'code' ? 'focus' : ''}`}
        value={setup.code}
        maxLength={MAP_CODE_MAX}
        placeholder={setup.mapCode}
        spellcheck={false}
        autocomplete="off"
        onFocus={hover('code')}
        onMouseEnter={hover('code')}
        onInput={(event) => ui.actions.setupCode(event.currentTarget.value)}
      />
    </label>
  );
}

/** La ficha del mapa que se va a jugar: la vista, de que es, su codigo y «Otro mapa». */
function MapCard({ setup }: { setup: SetupVM }) {
  return (
    <section class="menu-card setup-card" aria-label={t('setupMap')}>
      <span class="menu-card-kicker">{t('setupMap')}</span>
      <img class="setup-map" src={setup.thumb} alt={setup.mapInfo} />
      <span class="setup-map-info">{setup.mapInfo}</span>
      <MapCode setup={setup} />
      {setup.codeError && <span class="setup-bad-code">{t('badCode')}</span>}
      <TextEntry
        sel={setup.focus === 'reroll'}
        cls="setup-reroll"
        title={t('otherMap')}
        keyHint="R"
        onHover={hover('reroll')}
        onPick={pick('reroll')}
      />
    </section>
  );
}

/**
 * Escaramuza, en el menu clasico de texto: «Empezar», el modo y el rival con su valor al lado (y, en
 * «Personalizada», sus nueve opciones debajo) y «Volver»; a la derecha, la ficha del mapa.
 */
export function NewGame({ s }: { s: UIState }) {
  const setup = s.setup;
  return (
    <MenuScreen cls="setup" kicker={t('newGame')} title={t('skirmish')} hint={t('setupHint')} card={<MapCard setup={setup} />}>
      <nav class="text-list setup-list" aria-label={t('skirmish')}>
        <TextEntry sel={setup.focus === 'start'} title={t('start')} onHover={hover('start')} onPick={pick('start')} />
        <ModeEntry setup={setup} />
        <OptionEntry row={setup.rival} focused={setup.focus} />
        {setup.preset === 'custom' && <CustomOptions setup={setup} />}
        <TextEntry
          sel={setup.focus === 'back'}
          cls="setup-back"
          title={t('back')}
          keyHint="Esc"
          sound="ui_back"
          onHover={hover('back')}
          onPick={pick('back')}
        />
      </nav>
    </MenuScreen>
  );
}
