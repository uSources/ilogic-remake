import { Fragment, type ComponentChild } from 'preact';
import { Pause } from '../menus/Pause';
import type { UIState } from '../state';
import { Cards } from './Cards';
import { CombatPanel } from './Combat';
import { Forecast } from './Forecast';
import { EnemyGeneral, GeneralPanel } from './GeneralPanel';
import { LabPanel } from './LabPanel';
import { Minimap } from './Minimap';
import { MissionPanel } from './MissionPanel';
import { MoveTip } from './MoveTip';
import { PopMenu } from './PopMenu';
import { SelectionPanel } from './SelectionPanel';
import { TopBar } from './TopBar';
import { Tray } from './Tray';
import { canAct, isOwnTurn } from './turn';

/**
 * Un panel de la partida: lo que pinta segun el estado, o nada (null/false) si no le toca salir.
 * Cada uno decide si sale con los campos que lee, para que TypeScript sepa que no son null.
 */
interface GamePanel {
  id: string;
  render: (s: UIState) => ComponentChild;
}

/** Con dos o mas unidades elegidas, su panel sustituye a las fichas de la casilla. */
const showsSelection = (s: UIState) => !!s.selection && !s.busy;

/** Columna de la derecha: minimapa y bandeja (sin mover, amenaza, escuadras...). */
const SIDE_PANELS: GamePanel[] = [
  { id: 'minimap', render: (s) => s.minimap && s.minimapOn && <Minimap minimap={s.minimap} view={s.minimapView} /> },
  {
    id: 'tray',
    render: (s) =>
      canAct(s) && (
        <Tray idle={s.idle} threat={s.threat} intents={s.intents} anyStandingOrder={s.anyStandingOrder} squads={s.squads} multi={s.multi} />
      ),
  },
];

/** En el orden en que van en la pagina, que es el de apilado. Un panel nuevo es una entrada mas. */
const GAME_PANELS: GamePanel[] = [
  { id: 'topBar', render: (s) => <TopBar s={s} /> },
  { id: 'general', render: (s) => s.general && <GeneralPanel general={s.general} mine={isOwnTurn(s)} /> },
  { id: 'enemyGeneral', render: (s) => s.enemyGeneral && <EnemyGeneral general={s.enemyGeneral} /> },
  { id: 'mission', render: (s) => s.mission && isOwnTurn(s) && <MissionPanel mission={s.mission} /> },
  { id: 'hint', render: (s) => s.hint && <div class="hintline">{s.hint}</div> },
  { id: 'selection', render: (s) => showsSelection(s) && s.selection && <SelectionPanel selection={s.selection} /> },
  { id: 'cards', render: (s) => !showsSelection(s) && canAct(s) && s.tile && <Cards tile={s.tile} /> },
  { id: 'side', render: (s) => <div class="side">{renderPanels(SIDE_PANELS, s)}</div> },
  { id: 'moveTip', render: (s) => s.moveTip && <MoveTip moveTip={s.moveTip} /> },
  { id: 'forecast', render: (s) => s.forecast && <Forecast forecast={s.forecast} /> },
  { id: 'combat', render: (s) => s.combat && <CombatPanel combat={s.combat} /> },
  { id: 'menu', render: (s) => s.menu && (s.menu.kind === 'game' ? <Pause menu={s.menu} /> : <PopMenu menu={s.menu} />) },
];

/** Laboratorio de animaciones: solo su panel y lo que enseña un combate (el resto estorba). */
const LAB_PANELS: GamePanel[] = [
  { id: 'lab', render: (s) => s.lab && <LabPanel lab={s.lab} busy={s.busy} /> },
  { id: 'combat', render: (s) => s.combat && <CombatPanel combat={s.combat} /> },
];

function renderPanels(panels: GamePanel[], s: UIState) {
  return panels.map((panel) => <Fragment key={panel.id}>{panel.render(s)}</Fragment>);
}

/**
 * Interfaz de la partida: que panel sale y donde. Cada panel esta en su fichero de game/ y su estilo
 * en styles/ (ver hud.css); un panel nuevo es una entrada en GAME_PANELS, en el orden en que se apila.
 */
export function GameHud({ s }: { s: UIState }) {
  return <>{renderPanels(s.lab ? LAB_PANELS : GAME_PANELS, s)}</>;
}
