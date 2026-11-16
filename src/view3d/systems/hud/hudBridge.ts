/**
 * La interfaz HTML del juego (hud/, Preact) sobre el mundo 3D: se publica en el mismo store (`ui`)
 * y con las piezas puras de ui/hudModels.ts (economyVM, dayInfoVM, weatherVM, tileVM, forecastVM,
 * los menus de la unidad y de compra...), asi la barra de arriba, las fichas, la prevision de combate
 * y los menus son los del juego. Lo que la partida 3D aun no hace (escuadras, ordenes, generales)
 * sigue con sus valores de partida.
 */
import { visibility, buildingsOf, canActNow, commandUsed } from '../../../core/rules';
import type { GameState, Pos, TeamId } from '../../../core/model';
import { unitTypeOf } from '../../../core/gameContent';
import { teamState } from '../../../core/teams';
import { helpRulesOfMatch } from '../../../hud/helpText';
import { ui, type Anchor, type IdleVM, type UIState } from '../../../hud/store';
import { teamIncome } from '../turn/menuItems';
import { nameOf } from '../../../settings';
import { dayInfoVM, economyVM, forecastVM, tileVM, weatherVM } from '../../../ui/hudModels';
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
  /** El rectangulo de una casilla en la pantalla (para colocar bocadillos junto a ella). */
  anchorOf(pos: Pos): Anchor;
}

export interface HudActions {
  endTurn: () => void;
  /** Elegir esa unidad (la bandeja de unidades sin mover). */
  focusUnit: (uid: number) => void;
  menuPick: (index: number) => void;
  menuHover: (index: number) => void;
  menuClose: () => void;
  /** Abrir el menu de pausa (boton de la barra). */
  openGameMenu: () => void;
}

/** Linea de ayuda de abajo: los mandos del 3D (los del juego en 2D son otros). */
const HINT_3D =
  'Clic: elegir, mover y atacar · Arrastrar: elegir varias · Botón central, WASD o el borde: desplazar · Botón derecho: girar · Rueda: acercar';
const NOTHING_HIDDEN: ReadonlySet<number> = new Set();

const idleUnits = (s: GameState, viewer: TeamId) => s.units.filter((unit) => unit.team === viewer && canActNow(unit));

/** La bandeja de unidades sin mover, con su retrato del atlas. */
function idleList(textures: GameImages, s: GameState, viewer: TeamId): IdleVM[] {
  return idleUnits(s, viewer).map((unit) => ({
    uid: unit.uid,
    icon: unitKey(textures, s, unit, viewer),
    name: nameOf(unitTypeOf(s, unit)),
  }));
}

function tileCard(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment) {
  if (!moment.cursor || moment.busy) return null;
  return tileVM(textures, s, moment.cursor, { viewer, vis: visibility(s, viewer), hidden: NOTHING_HIDDEN });
}

function menuOf(moment: HudMoment): UIState['menu'] {
  const menu = moment.menu;
  // La pausa se abre tambien mientras juegan los demas; los menus del tablero, no.
  if (!menu || (moment.busy && menu.kind !== 'game')) return null;
  const { at, ...shown } = menu;
  return { ...shown, anchor: moment.anchorOf(at) };
}

function forecastOf(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment): UIState['forecast'] {
  const plan = moment.forecast;
  if (!plan || moment.busy) return null;
  return forecastVM(textures, s, viewer, plan.attacker, plan.from, plan.target, moment.anchorOf(plan.target));
}

/** Publica el estado de la partida para la interfaz. */
export function publishHud(textures: GameImages, s: GameState, viewer: TeamId, moment: HudMoment): void {
  ui.set({
    screen: 'game',
    funds: teamState(s, viewer).funds,
    income: teamIncome(s, viewer),
    commandPoints: s.settings.commandPoints === null ? null : { used: commandUsed(s, viewer), max: s.settings.commandPoints },
    economy: economyVM(s, viewer),
    dayInfo: dayInfoVM(s, viewer),
    buildings: buildingsOf(s, viewer).length,
    day: s.day,
    dayLimit: s.settings.dayLimit,
    helpRules: helpRulesOfMatch(s),
    weather: weatherVM(s),
    turn: sideOf(s, viewer, s.turn),
    busy: moment.busy,
    watching: false,
    tile: moment.menu ? null : tileCard(textures, s, viewer, moment),
    menu: menuOf(moment),
    forecast: forecastOf(textures, s, viewer, moment),
    idle: idleList(textures, s, viewer),
    endTurn: { pending: idleUnits(s, viewer).length, armed: false },
    hint: moment.busy ? '' : HINT_3D,
  });
}

/** Los botones de la interfaz que la partida 3D atiende (el resto no hace nada). */
export function installHudActions(actions: HudActions): void {
  Object.assign(ui.actions, actions);
}
