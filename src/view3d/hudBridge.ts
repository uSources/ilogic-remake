/**
 * La interfaz HTML del juego (hud/, Preact) sobre el mundo 3D: se publica en el mismo store (`ui`)
 * y con las mismas piezas que usa la escena 2D (economyVM, dayInfoVM, weatherVM, tileVM...), asi la
 * barra de arriba, las fichas y la ayuda son las del juego. Aqui solo va lo que el prototipo ya sabe
 * hacer: lo que no (combate, menus de unidad, escuadras), sigue con sus valores de partida.
 */
import { visibility, buildingsOf, canActNow, commandUsed } from '../core/rules';
import type { GameState, Pos, TeamId } from '../core/model';
import { teamState } from '../core/teams';
import { helpRulesOfMatch } from '../hud/helpText';
import { ui, type IdleVM } from '../hud/store';
import { unitTypeOf } from '../core/gameContent';
import { nameOf } from '../settings';
import { unitKey } from '../ui/sprites';
import { teamIncome } from '../scenes/game/hudParts';
import { dayInfoVM, economyVM, tileVM, weatherVM } from '../ui/hudModels';
import { sideOf } from '../ui/sides';
import type { GameTextures } from './gameAtlas';

/** Lo que sabe la vista 3D y no la partida: la casilla señalada y si se esta animando algo. */
export interface HudMoment {
  cursor: Pos | null;
  busy: boolean;
}

export interface HudActions {
  endTurn: () => void;
  /** Elegir esa unidad (la bandeja de unidades sin mover). */
  focusUnit: (uid: number) => void;
}

/** Linea de ayuda de abajo: los mandos del 3D (los del juego en 2D son otros). */
const HINT_3D = 'Clic: elegir y mover · Arrastrar o WASD: desplazar · Botón derecho: girar · Rueda: acercar';
const NOTHING_HIDDEN: ReadonlySet<number> = new Set();

const idleUnits = (s: GameState, viewer: TeamId) => s.units.filter((unit) => unit.team === viewer && canActNow(unit));

/** La bandeja de unidades sin mover, con su retrato del atlas (como GameScene.idleList). */
function idleList(textures: GameTextures, s: GameState, viewer: TeamId): IdleVM[] {
  return idleUnits(s, viewer).map((unit) => ({
    uid: unit.uid,
    icon: unitKey(textures, s, unit, viewer),
    name: nameOf(unitTypeOf(s, unit)),
  }));
}

function tileCard(textures: GameTextures, s: GameState, viewer: TeamId, moment: HudMoment) {
  if (!moment.cursor || moment.busy) return null;
  return tileVM(textures, s, moment.cursor, { viewer, vis: visibility(s, viewer), hidden: NOTHING_HIDDEN });
}

/** Publica el estado de la partida para la interfaz (como GameScene.refreshHud). */
export function publishHud(textures: GameTextures, s: GameState, viewer: TeamId, moment: HudMoment): void {
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
    tile: tileCard(textures, s, viewer, moment),
    idle: idleList(textures, s, viewer),
    endTurn: { pending: idleUnits(s, viewer).length, armed: false },
    hint: moment.busy ? '' : HINT_3D,
  });
}

/** Los botones de la interfaz que el prototipo atiende (el resto no hace nada). */
export function installHudActions(actions: HudActions): void {
  ui.actions.endTurn = actions.endTurn;
  ui.actions.focusUnit = actions.focusUnit;
}
