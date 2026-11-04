/**
 * Una fase del turno del jugador (mapa, mover, menu de la unidad, compra...) es una entrada de
 * PHASES (phases/index.ts) con lo que hace en ella cada mando: aceptar, atras y, si tiene, lo que
 * pasa al entrar, su menu de bocadillo y las casillas que marca. Una fase nueva es una entrada nueva;
 * la escena no cambia.
 */
import { posKey } from '../../../core/geom';
import { unitById, type BuyOption } from '../../../core/rules';
import type { Building, GameEvent, GameState, Pos, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import type { HighlightKind, MapView } from '../../../ui/mapView';
import type { GeneralAbilities } from '../abilities';
import type { GroupSelection } from '../groupSelection';
import type { HighlightInput, Highlights } from '../highlights';
import type { MenuInput, MenuModel } from '../menuModel';
import type { Orders } from '../orders';
import { type ActionKey, type Phase } from '../types';
import type { UnitMoves } from '../unitMoves';
import type { GameMenuChoices } from './gameMenu';

/** Lo que las fases necesitan de la escena. */
export interface PhaseHost {
  readonly state: GameState;
  readonly view: MapView;
  phase: Phase;
  /** Opcion señalada del menu de bocadillo, y las opciones que se enseñan. */
  menuSel: number;
  readonly menuItems: readonly MenuItemVM[];
  /** Unidad cuyo alcance se esta mostrando (Enter o clic derecho sobre ella). */
  inspectUid: number | null;
  /** Opciones del menu de la unidad, ya ordenadas. */
  unitOptions: ActionKey[];
  /** «Eliminar» pulsado una vez: la segunda lo confirma. */
  deleteArmed: boolean;
  /** Fabrica de la compra y lo que se puede comprar en ella. */
  buyAt: Building | null;
  buyOptions: BuyOption[];
  readonly moves: UnitMoves;
  readonly selection: GroupSelection;
  readonly orders: Orders;
  readonly abilities: GeneralAbilities;
  readonly gameMenu: GameMenuChoices;
  /** Entrar en una fase que prepara algo al entrar (su `enter`: abrir su menu...). */
  enter(phase: Phase): void;
  toMap(): void;
  refresh(): void;
  /** Tras una accion que gasta la unidad: fin de la partida o vuelta al mapa. */
  afterAction(): void;
  /** Si hay una unidad movida a medio decidir, deshacer su movimiento antes de salir. */
  abandonSelection(): void;
  /** Enseñar el alcance de una unidad (enemiga, o propia ya usada). */
  inspect(unit: Unit): void;
  visible(p: Pos): boolean;
  play(events: GameEvent[]): Promise<void>;
}

export interface PhaseHandler {
  /** Al entrar en la fase: prepara lo que enseña (su menu...) y la pone. */
  enter?(h: PhaseHost): void;
  /** Aceptar (Enter, clic, toque) en la casilla del cursor o la opcion señalada. */
  accept(h: PhaseHost): void;
  /** Atras (Esc, clic derecho, clic fuera del menu). */
  back(h: PhaseHost): void;
  /** Su menu de bocadillo, si tiene. Puro: sale de lo elegido. */
  menu?(input: MenuInput): MenuModel;
  /** Casillas que marca en el mapa. Puro. */
  highlights?(input: HighlightInput): Highlights;
}

/** Sin casillas marcadas. */
export const noHighlights = (): Highlights => ({ tiles: new Map(), inspectGone: false });

/** Marcar estas casillas ("x,y") con la misma marca. */
export function markTiles(tiles: Iterable<string>, kind: HighlightKind): Highlights {
  const marks = noHighlights();
  for (const tile of tiles) marks.tiles.set(tile, kind);
  return marks;
}

/** Aro a los pies de estas unidades (un grupo, o a las que se esta dando una orden). */
export function markUnits(s: GameState, uids: Iterable<number>): Highlights {
  const marks = noHighlights();
  for (const uid of uids) {
    const unit = unitById(s, uid);
    if (unit) marks.tiles.set(posKey(unit), 'group');
  }
  return marks;
}
