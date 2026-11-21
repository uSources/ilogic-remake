import type { UIActions } from './actions';
import { initialState, type UIState } from './state';

/**
 * Estado de la interfaz (HTML) compartido con la partida 3D y el menu.
 * El menu y la partida escriben con ui.set(...) y registran sus acciones en ui.actions;
 * los componentes de Preact leen con useUI() y llaman a esas acciones.
 *
 * Los tipos viven por partes (state.ts, actions.ts, vm/*) y se reexportan aqui: el resto del juego
 * los sigue importando de '../hud/store'.
 */

export type { UIActions } from './actions';
export type { UIState } from './state';
export type { Anchor, BySide, OwnerSide, Side, StatChipVM } from './vm/common';
export type { EndOutcome, EndStatsVM } from './vm/end';
export type { PickedVM, SelectionVM } from './vm/army';
export type { ForecastVM } from './vm/combat';
export type {
  CampaignItemVM,
  HomeVM,
  MarkVM,
  MenuItemVM,
  MenuVM,
  NetVM,
  OnlineRoomVM,
  OnlineSeatVM,
  OnlineVM,
  OptionRowVM,
  OptionsRowVM,
  OptionsTabVM,
  OptionsVM,
  PresetVM,
  SetupVM,
} from './vm/menus';
export type { MinimapVM } from './vm/minimap';
export type { NotesVM } from './vm/notes';
export type { HandoffVM } from './vm/notices';
export type { AbilityVM, TileVM, UnitVM } from './vm/tile';
export type { BreakdownLineVM, DayInfoVM, EconomyVM, WeatherVM } from './vm/topBar';

const noop = () => {};

/** Acciones por defecto: no hacen nada (salvo cerrar la ayuda). El menu y la partida ponen las suyas al empezar. */
const DEFAULT_ACTIONS: UIActions = {
  menuPick: noop,
  menuHover: noop,
  menuClose: noop,
  endTurn: noop,
  renameSquad: noop,
  renameClose: () => ui.set({ rename: null }),
  handoffReady: noop,
  openGameMenu: noop,
  nextIdle: noop,
  minimapJump: noop,
  pickInSelection: noop,
  endHover: noop,
  endPick: noop,
  closeHelp: () => ui.set({ help: false }),
  homeHover: noop,
  homePick: noop,
  setupHover: noop,
  setupPick: noop,
  setupSet: noop,
  setupCode: noop,
  optionsHover: noop,
  optionsSet: noop,
  optionsPick: noop,
  optionsTab: noop,
  optionsClose: noop,
  campaignHover: noop,
  campaignPick: noop,
  campaignBack: noop,
  onlineHover: noop,
  onlinePick: noop,
  onlineSet: noop,
  onlineText: noop,
};

type Listener = () => void;
let state: UIState = initialState;
const listeners = new Set<Listener>();
let scheduled = false;

export const ui = {
  get: (): UIState => state,
  set(patch: Partial<UIState>): void {
    state = { ...state, ...patch };
    // Agrupar varios cambios del mismo fotograma en un solo repintado.
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        listeners.forEach((listener) => listener());
      });
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  actions: { ...DEFAULT_ACTIONS },
};

/** Un numero nuevo para cada aviso o cartel: con el de `key`, uno nuevo vuelve a empezar su animacion. */
let lastNoticeId = 0;
const nextNoticeId = () => ++lastNoticeId;

export function showToast(text: string): void {
  ui.set({ toast: { text, id: nextNoticeId() } });
}

export function showBanner(small: string, big: string, tone: 'blue' | 'red', weather: string | null = null): void {
  ui.set({ banner: { small, big, tone, weather, id: nextNoticeId() } });
}
