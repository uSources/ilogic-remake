import { HELP_TOPICS, type HelpRules, type HelpTopic } from '../../i18n/help';
import { t } from '../../settings';
import { unitCatalog } from '../../ui/hudModels';
import { Btn } from '../common/buttons';
import { Icon } from '../common/Icon';
import { helpText } from '../helpText';
import { MenuPage } from '../menus/MenuPage';
import { ui } from '../store';

type HelpContent = ReturnType<typeof helpText>;

/** Columna de las teclas: va en letra de teclado. */
const KEYBOARD_COLUMN = 1;

/** El titulo de cada tema en la lista y encima de lo que cuenta. */
const topicTitle = (help: HelpContent, topic: HelpTopic): string =>
  ({ goal: help.goalTitle, colors: help.colorsTitle, controls: help.controlsTitle, units: help.unitsTitle })[topic];

/** Un tema de la lista: su numero, su nombre y lo que hay en el; el elegido, con borde azul. */
function TopicEntry({ help, topic, index, isCurrent }: { help: HelpContent; topic: HelpTopic; index: number; isCurrent: boolean }) {
  return (
    <Btn cls="help-topic" sel={isCurrent} onPick={() => ui.actions.helpTopic(topic)}>
      <span class="help-topic-number">{index + 1}</span>
      <span class="help-topic-text">
        <span class="help-topic-title">{topicTitle(help, topic)}</span>
        <span class="help-topic-note">{help.topicNotes[topic]}</span>
      </span>
      <span class="help-topic-arrow" aria-hidden="true">
        ▸
      </span>
    </Btn>
  );
}

function GoalTopic({ help }: { help: HelpContent }) {
  return (
    <>
      {help.goal.map((sentence) => (
        <p>{sentence}</p>
      ))}
    </>
  );
}

function ColorsTopic({ help }: { help: HelpContent }) {
  return (
    <ul class="legend">
      {help.colors.map(([color, meaning]) => (
        <li>
          <i style={{ background: color }} />
          {meaning}
        </li>
      ))}
    </ul>
  );
}

function ControlsTopic({ help }: { help: HelpContent }) {
  return (
    <table>
      <thead>
        <tr>
          {help.head.map((heading) => (
            <th>{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {help.controls.map((row) => (
          <tr>{row.map((cell, column) => (column === KEYBOARD_COLUMN ? <td class="kbd">{cell}</td> : <td>{cell}</td>))}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Las unidades que se compran: retrato, nombre, precio y como se mueven, alcanzan y ven. */
function UnitsTopic({ rules }: { rules: HelpRules }) {
  return (
    <div class="help-units">
      {unitCatalog(rules.units).map((unit) => (
        <div class="help-unit" key={unit.id}>
          <span class="help-unit-portrait">
            <Icon k={unit.icon} cls="px-icon" />
          </span>
          <span class="help-unit-name">{unit.name}</span>
          <span class="help-unit-cost">{unit.cost}</span>
          <span class="help-unit-stats">
            {unit.stats.map((stat) => (
              <span class="help-unit-stat" title={stat.title}>
                <Icon k={stat.icon} cls="px-icon" />
                {stat.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Lo que cuenta el tema elegido. */
function TopicBody({ help, rules, topic }: { help: HelpContent; rules: HelpRules; topic: HelpTopic }) {
  switch (topic) {
    case 'goal':
      return <GoalTopic help={help} />;
    case 'colors':
      return <ColorsTopic help={help} />;
    case 'controls':
      return <ControlsTopic help={help} />;
    case 'units':
      return <UnitsTopic rules={rules} />;
    default:
      return topic satisfies never;
  }
}

/**
 * Aprender («Cómo se juega»): a la izquierda los temas (el objetivo y las reglas, los colores del mapa,
 * los controles y las unidades) y a la derecha lo que cuenta el elegido. Textos en src/i18n/<idioma>/help.ts.
 */
export function Help({ rules, topic }: { rules: HelpRules; topic: HelpTopic }) {
  const help = helpText(rules);
  const close = () => ui.actions.closeHelp();
  return (
    <MenuPage tab="help" title={help.title} onClose={close} cls="help-page">
      <div class="page-body help-body">
        <nav class="page-card help-topics" aria-label={help.title}>
          <span class="page-eyebrow">{help.title}</span>
          {HELP_TOPICS.map((entry, index) => (
            <TopicEntry key={entry} help={help} topic={entry} index={index} isCurrent={entry === topic} />
          ))}
          <span class="page-hint">{t('helpHint')}</span>
        </nav>
        <article class={`page-card help-text topic-${topic}`}>
          <span class="page-eyebrow">{topicTitle(help, topic)}</span>
          <TopicBody help={help} rules={rules} topic={topic} />
        </article>
      </div>
    </MenuPage>
  );
}
