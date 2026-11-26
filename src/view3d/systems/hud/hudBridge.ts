/**
 * La interfaz HTML del juego (hud/, Preact) sobre el mundo 3D: se publica en el mismo store (`ui`)
 * y con las piezas puras de ui/hudModels.ts (economyVM, dayInfoVM, weatherVM, tileVM, forecastVM,
 * los menus de la unidad y de compra...), asi la barra de arriba, las fichas, la prevision de combate
 * y los menus son los del juego: tambien el panel de lo elegido. Lo que la partida 3D aun no hace
 * sigue con sus valores de partida.
 */
import { visibility, canActNow } from '../../../core/rules';
import type { GameState, Pos, TeamId, Unit } from '../../../core/model';
import { unitTypeOf } from '../../../core/gameContent';
import { teamState } from '../../../core/teams';
import { helpRulesOfMatch } from '../../../hud/helpText';
import { ui, type Anchor, type SelectionVM, type UIState } from '../../../hud/store';
import { nameOf } from '../../../settings';
import { dayInfoVM, economyVM, forecastVM, standingVM, tileVM, weatherVM } from '../../../ui/hudModels';
import { sideOf } from '../../../ui/sides';
import { unitKey } from '../../../ui/sprites';
import type { AttackPlan } from '../turn/attackPlan';
import type { GameImages } from '../../../atlas';
import type { MenuView } from '../turn/turnControls';

/** Lo que sabe la vista 3D y no la partida: la casilla señalada, si se anima algo, el menu y el combate a la vista. */
export interface HudMoment {
  cursor: Pos | null;
  busy: boolean;
  menu: MenuView | null;
  forecast: AttackPlan | null;
  /** Lo elegido (el panel de lo elegido sale con dos o mas). */
  selected: readonly Unit[];
  /** El rectangulo de una casilla en la pantalla (para colocar bocadillos junto a ella). */
  anchorOf(pos: Pos): Anchor;
  /** Lo mismo, con su borde de arriba encima de la unidad de esa casilla (para las chapas, que no tapen su barra). */
  overheadOf(pos: Pos): Anchor;
  /** «Acabar turno» espera la segunda pulsacion (dice «¿Terminar?»). */
  endArmed: boolean;
  /** Quien mira mira jugar a los demas: el boton del menu abre la pausa igual (para salir). */
  watching: boolean;
}

export interface HudActions {
  endTurn: () => void;
  menuPick: (index: number) => void;
  menuHover: (index: number) => void;
  menuClose: () => void;
  /** Abrir el menu de pausa (boton de la barra). */
  openGameMenu: () => void;
  renameSquad: (id: number, name: string) => void;
  renameClose: () => void;
  /** La siguiente persona de esta pantalla esta lista para su turno (el aviso de cambio de jugador). */
  handoffReady: () => void;
  /** Un retrato del panel de lo elegido: solo esa, quitarla (Mayusculas) o las de su tipo (Ctrl). */
  pickInSelection: (uid: number, shift: boolean, ctrl: boolean) => void;
  /** La siguiente unidad sin mover (el numero de «Acabar turno»). */
  nextIdle: () => void;
  /** Un clic o arrastre en el minimapa: la camara va a ese punto (en casillas del minimapa). */
  minimapJump: (at: Pos) => void;
}

const NOTHING_HIDDEN: ReadonlySet<number> = new Set();

const idleUnits = (s: GameState, viewer: TeamId) => s.units.filter((unit) => unit.team === viewer && canActNow(unit));

/** El panel de lo elegido (con dos o mas): un retrato por unidad, ordenadas por tipo, y cuantas de cada tipo. */
function selectionOf(textures: GameImages, s: GameState, viewer: TeamId, selected: readonly Unit[]): SelectionVM | null {
  if (selected.length < 2) return null;
  const byType = [...selected].sort((first, second) => first.type.localeCompare(second.type));
  const units = byType.map((unit) => ({
    uid: unit.uid,
    icon: unitKey(textures, s, unit, viewer),
    name: nameOf(unitTypeOf(s, unit)),
    life: unit.life,
    current: false,
  }));
  const names = units.map((unit) => unit.name);
  const types = [...new Set(names)].map((name) => ({ name, count: names.filter((other) => other === name).length }));
  return { units, types };
}

function tileCard(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment) {
  if (!moment.cursor || moment.busy) return null;
  return tileVM(textures, s, moment.cursor, { viewer, vis: visibility(s, viewer), hidden: NOTHING_HIDDEN });
}

/** Un enemigo a tiro y, encima, otro tanto para la cifra de la prevision que sube de el (Forecast.tsx). */
const withRoomAbove = (overhead: Anchor): Anchor => ({ ...overhead, y: overhead.y - overhead.h, h: overhead.h * 2 });

function menuOf(moment: HudMoment): UIState['menu'] {
  const menu = moment.menu;
  // La pausa se abre tambien mientras juegan los demas; los menus del tablero, no.
  if (!menu || (moment.busy && menu.kind !== 'game')) return null;
  return { ...menu, anchor: moment.anchorOf(menu.at), ...(menu.avoid ? { avoid: menu.avoid.map((pos) => withRoomAbove(moment.overheadOf(pos))) } : {}) };
}

function forecastOf(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment): UIState['forecast'] {
  const plan = moment.forecast;
  if (!plan || moment.busy) return null;
  const { attacker, from, target } = plan;
  return forecastVM(textures, s, viewer, attacker, from, target, moment.overheadOf(target), moment.anchorOf(from));
}

/** Publica el estado de la partida para la interfaz. */
export function publishHud(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment): void {
  ui.set({
    screen: 'game',
    funds: teamState(s, viewer).funds,
    economy: economyVM(s, viewer),
    standing: standingVM(s, viewer),
    dayInfo: dayInfoVM(s, viewer),
    day: s.day,
    dayLimit: s.settings.dayLimit,
    helpRules: helpRulesOfMatch(s),
    weather: weatherVM(s),
    turn: sideOf(s, viewer, s.turn),
    busy: moment.busy,
    watching: moment.watching,
    tile: moment.menu ? null : tileCard(textures, s, viewer, moment),
    menu: menuOf(moment),
    forecast: forecastOf(textures, s, viewer, moment),
    selection: selectionOf(textures, s, viewer, moment.selected),
    endTurn: { pending: idleUnits(s, viewer).length, armed: moment.endArmed },
  });
}

/** Los botones de la interfaz que la partida 3D atiende (el resto no hace nada). */
export function installHudActions(actions: HudActions): void {
  Object.assign(ui.actions, actions);
}
