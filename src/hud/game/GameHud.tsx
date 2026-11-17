import { Fragment, type ComponentChild } from 'preact';
import { Pause } from '../menus/Pause';
import { t } from '../../settings';
import type { UIState } from '../state';
import type { MenuVM, NetVM } from '../vm/menus';
import { ActionChips } from './ActionChips';
import { BuyFan } from './BuyFan';
import { CombatPanel } from './Combat';
import { Forecast } from './Forecast';
import { EnemyGeneral, GeneralPanel } from './GeneralPanel';
import { LabPanel } from './LabPanel';
import { Minimap } from './Minimap';
import { MissionPanel } from './MissionPanel';
import { MoveTip } from './MoveTip';
import { PopMenu } from './PopMenu';
import { RadialMenu } from './RadialMenu';
import { TileTip, tileTipKey } from './TileTip';
import { SelectionPanel } from './SelectionPanel';
import { EndTurnChip, TopBar } from './TopBar';
import { canAct, isOwnTurn } from './turn';

/**
 * Un panel de la partida: lo que pinta segun el estado, o nada (null/false) si no le toca salir.
 * Cada uno decide si sale con los campos que lee, para que TypeScript sepa que no son null.
 */
interface GamePanel {
  id: string;
  render: (s: UIState) => ComponentChild;
}

/** Por la red: como va la conexion y a quien se espera. */
function NetLine({ net }: { net: NetVM }) {
  const status = t(net.status === 'online' ? 'onlineOnline' : net.status === 'reconnecting' ? 'onlineReconnecting' : 'onlineOffline');
  return (
    <div class={`netline ${net.status}`} role="status">
      <i aria-hidden="true" />
      <span>{net.waiting ?? status}</span>
    </div>
  );
}

/** Con dos o mas unidades elegidas, su panel sustituye a las fichas de la casilla. */
const showsSelection = (s: UIState) => !!s.selection && !s.busy;
/** La ficha de la casilla señalada: en tu turno y sin otra cosa encima (menu, prevision de combate, lo elegido). */
const showsTileTip = (s: UIState) => canAct(s) && !showsSelection(s) && !s.menu && !s.forecast;

/**
 * Columna de la derecha: el minimapa (cuando la vista lo publique). La bandeja de antes (sin mover,
 * amenaza, escuadras) ya no esta: el numero de «Fin del turno», la pausa y la rueda hacen lo suyo.
 */
const SIDE_PANELS: GamePanel[] = [
  { id: 'minimap', render: (s) => s.minimap && s.minimapOn && <Minimap minimap={s.minimap} view={s.minimapView} /> },
];

/** En el orden en que van en la pagina, que es el de apilado. Un panel nuevo es una entrada mas. */
const GAME_PANELS: GamePanel[] = [
  { id: 'topBar', render: (s) => <TopBar s={s} /> },
  { id: 'net', render: (s) => s.net && <NetLine net={s.net} /> },
  { id: 'general', render: (s) => s.general && <GeneralPanel general={s.general} mine={isOwnTurn(s)} /> },
  { id: 'enemyGeneral', render: (s) => s.enemyGeneral && <EnemyGeneral general={s.enemyGeneral} /> },
  { id: 'mission', render: (s) => s.mission && isOwnTurn(s) && <MissionPanel mission={s.mission} /> },
  { id: 'selection', render: (s) => showsSelection(s) && s.selection && <SelectionPanel selection={s.selection} /> },
  {
    id: 'tileTip',
    render: (s) => showsTileTip(s) && s.tile && s.tileAt && <TileTip key={tileTipKey(s.tile)} tile={s.tile} at={s.tileAt} />,
  },
  { id: 'side', render: (s) => <div class="side">{renderPanels(SIDE_PANELS, s)}</div> },
  { id: 'endTurn', render: (s) => <EndTurnChip s={s} /> },
  { id: 'moveTip', render: (s) => s.moveTip && <MoveTip moveTip={s.moveTip} /> },
  { id: 'forecast', render: (s) => s.forecast && <Forecast forecast={s.forecast} /> },
  { id: 'combat', render: (s) => s.combat && <CombatPanel combat={s.combat} /> },
  { id: 'menu', render: (s) => s.menu && <MatchMenu menu={s.menu} /> },
];

/** Lo que sale junto a lo elegido o encima de todo: fichas, rueda, compra, pausa o el aviso de elegir casilla. */
function MatchMenu({ menu }: { menu: MenuVM }) {
  if (menu.kind === 'game') return <Pause menu={menu} />;
  if (menu.kind === 'chips') return <ActionChips menu={menu} />;
  if (menu.kind === 'radial') return <RadialMenu menu={menu} />;
  if (menu.kind === 'buy') return <BuyFan menu={menu} />;
  return <PopMenu menu={menu} />;
}

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
