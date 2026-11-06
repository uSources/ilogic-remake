import type { UIActions } from './actions';
import { initialState, type UIState } from './state';
import type { ReportLineVM } from './vm/notices';

/**
 * Estado de la interfaz (HTML) compartido con las escenas de Phaser.
 * Las escenas escriben con ui.set(...) y registran sus acciones en ui.actions;
 * los componentes de Preact leen con useUI() y llaman a esas acciones.
 *
 * Los tipos viven por partes (state.ts, actions.ts, vm/*) y se reexportan aqui: el resto del juego
 * los sigue importando de '../hud/store'.
 */

export type { UIActions } from './actions';
export type { UIState } from './state';
export type { Anchor, BySide, OwnerSide, Side, StatChipVM } from './vm/common';
export type { EndOutcome, EndStatsVM } from './vm/end';
export type { IdleVM, MoveTipVM, PickedVM, SelectionVM, SquadVM } from './vm/army';
export type { CombatSideVM, CombatVM, ForecastVM } from './vm/combat';
export type { GeneralPowerVM, GeneralVM } from './vm/general';
export type { LabVM } from './vm/lab';
export type {
  CampaignItemVM,
  HomeVM,
  MainMenuItemVM,
  MarkVM,
  MenuItemVM,
  MenuVM,
  OptionRowVM,
  PresetVM,
  SetupRowVM,
  SetupVM,
} from './vm/menus';
export type { MinimapVM } from './vm/minimap';
export type { NotesVM } from './vm/notes';
export type { ReportLineVM } from './vm/notices';
export type { AbilityVM, TileVM, UnitVM } from './vm/tile';
export type { BreakdownLineVM, DayInfoVM, EconomyVM, WeatherVM } from './vm/topBar';

const noop = () => {};

/** Acciones sin escena: no hacen nada (salvo cerrar la ayuda). Las escenas ponen las suyas en create(). */
const DEFAULT_ACTIONS: UIActions = {
  labPlay: noop,
  labSet: noop,
  labExit: noop,
  usePower: noop,
  cancelPower: noop,
  mainMenuPick: noop,
  mainMenuHover: noop,
  menuPick: noop,
  menuHover: noop,
  menuClose: noop,
  endTurn: noop,
  multiSelect: noop,
  selectSquad: noop,
  renameSquad: noop,
  renameClose: () => ui.set({ rename: null }),
  openGameMenu: noop,
  toggleThreat: noop,
  toggleIntents: noop,
  toggleMinimap: noop,
  minimapJump: noop,
  focusUnit: noop,
  pickInSelection: noop,
  endContinue: noop,
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
  optionsClose: noop,
  pauseHover: noop,
  pausePick: noop,
  campaignHover: noop,
  campaignPick: noop,
  campaignBack: noop,
  surrender: noop,
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

/** Un numero nuevo para cada aviso, resumen o cartel: con el de `key`, uno nuevo vuelve a empezar su animacion. */
let lastNoticeId = 0;
const nextNoticeId = () => ++lastNoticeId;

export function showToast(text: string): void {
  ui.set({ toast: { text, id: nextNoticeId() } });
}
export function showReport(title: string, lines: ReportLineVM[]): void {
  ui.set({ report: { title, lines, id: nextNoticeId() } });
}

export function showBanner(small: string, big: string, tone: 'blue' | 'red'): void {
  ui.set({ banner: { small, big, tone, id: nextNoticeId() } });
}

/** Quita las acciones que registro una escena (se llama al cerrarla: nada de botones que actuen sobre una escena cerrada). */
export function resetActions(): void {
  Object.assign(ui.actions, DEFAULT_ACTIONS);
}
