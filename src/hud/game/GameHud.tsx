import { Fragment, type ComponentChild } from 'preact';
import { isPageOpen } from '../menus/MenuPage';
import { Pause } from '../menus/Pause';
import { t } from '../../settings';
import type { UIState } from '../state';
import type { MenuVM, NetVM } from '../vm/menus';
import { BuyFan } from './BuyFan';
import { ChosenUnit } from './ChosenUnit';
import { Forecast } from './Forecast';
import { Minimap } from './Minimap';
import { MissionPanel } from './MissionPanel';
import { TileMenu } from './TileMenu';
import { TileTip } from './TileTip';
import { SelectionPanel } from './SelectionPanel';
import { EndTurn, TopBar } from './TopBar';
import { TurnClockPill } from './TurnClock';
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

/** La linea de la conexion, salvo con el reloj y conectado: entonces el reloj ya dice a quien se espera. */
const showsNetLine = (s: UIState) => !!s.net && !(s.turnClock && s.net.status === 'online');

/** Con dos o mas unidades elegidas, su panel sustituye a las fichas de la casilla. */
const showsSelection = (s: UIState) => !!s.selection && !s.busy;
/** La pausa tapa la partida: ni lo elegido ni lo de bajo el cursor se enseñan a traves de ella. */
const isPaused = (s: UIState) => s.menu?.kind === 'game';
/**
 * La unidad elegida (sola), abajo a la izquierda: sustituye a lo de bajo el cursor, tambien con su
 * bocadillo abierto o la prevision encima (lienzo «Todo en estilo C», tablero 8).
 */
const showsChosen = (s: UIState) => canAct(s) && !!s.chosen && !isPaused(s);
/** La ficha de la casilla señalada: en tu turno y sin otra cosa encima (menu, prevision de combate, lo elegido). */
const showsTileTip = (s: UIState) => canAct(s) && !showsSelection(s) && !showsChosen(s) && !s.menu && !s.forecast;

/**
 * Abajo a la derecha, en fila: «Acabar turno» y el minimapa (lo publica la vista 3D,
 * systems/hud/minimapBridge.ts). La bandeja de antes (sin mover, amenaza, escuadras) ya no esta: lo
 * de «Acabar turno», la pausa y la rueda hacen lo suyo.
 */
const DOCK_PANELS: GamePanel[] = [
  { id: 'endTurn', render: (s) => <EndTurn s={s} /> },
  { id: 'minimap', render: (s) => s.minimap && s.minimapOn && <Minimap minimap={s.minimap} view={s.minimapView} /> },
];

/**
 * Un menu nuevo (otro tipo, u otra casilla: otra unidad aunque sea del mismo tipo) se vuelve a montar,
 * y asi su bocadillo vuelve a salir de la casilla. La casilla del tablero, no su recuadro en pantalla,
 * que cambia con cada movimiento de la camara.
 */
const menuKey = (menu: MenuVM): string => `${menu.kind}|${menu.at.x},${menu.at.y}`;

/** En el orden en que van en la pagina, que es el de apilado. Un panel nuevo es una entrada mas. */
const GAME_PANELS: GamePanel[] = [
  // La sombra de abajo, que deja leer el texto de las esquinas sobre el tablero (la de arriba va en la barra).
  { id: 'shade', render: () => <div class="hud-shade-bottom" aria-hidden="true" /> },
  { id: 'topBar', render: (s) => <TopBar s={s} /> },
  { id: 'turnClock', render: (s) => s.turnClock && <TurnClockPill clock={s.turnClock} /> },
  { id: 'net', render: (s) => showsNetLine(s) && s.net && <NetLine net={s.net} /> },
  { id: 'mission', render: (s) => s.mission && isOwnTurn(s) && <MissionPanel mission={s.mission} /> },
  { id: 'selection', render: (s) => showsSelection(s) && s.selection && <SelectionPanel selection={s.selection} /> },
  {
    id: 'tileTip',
    render: (s) => showsTileTip(s) && s.tile && <TileTip tile={s.tile} />,
  },
  { id: 'chosen', render: (s) => showsChosen(s) && s.chosen && <ChosenUnit chosen={s.chosen} /> },
  { id: 'dock', render: (s) => <div class="dock">{renderPanels(DOCK_PANELS, s)}</div> },

  { id: 'forecast', render: (s) => s.forecast && <Forecast forecast={s.forecast} /> },
  // La pausa no se ve a traves de Opciones o de la ayuda, que se abren desde ella.
  { id: 'menu', render: (s) => s.menu && !isPageOpen(s) && <MatchMenu key={menuKey(s.menu)} menu={s.menu} /> },
];

/**
 * Lo que sale de una casilla o encima de todo: la pausa, la compra (en abanico) y, en el bocadillo
 * con tallo, las fichas de la unidad, su rueda o el aviso de elegir casilla.
 */
function MatchMenu({ menu }: { menu: MenuVM }) {
  if (menu.kind === 'game') return <Pause menu={menu} />;
  if (menu.kind === 'buy') return <BuyFan menu={menu} />;
  return <TileMenu menu={menu} />;
}

function renderPanels(panels: GamePanel[], s: UIState) {
  return panels.map((panel) => <Fragment key={panel.id}>{panel.render(s)}</Fragment>);
}

/**
 * Interfaz de la partida: que panel sale y donde. Cada panel esta en su fichero de game/ y su estilo
 * en styles/ (ver hud.css); un panel nuevo es una entrada en GAME_PANELS, en el orden en que se apila.
 */
export function GameHud({ s }: { s: UIState }) {
  return <>{renderPanels(GAME_PANELS, s)}</>;
}
