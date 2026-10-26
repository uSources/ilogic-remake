/**
 * Estado de la interfaz (HTML) compartido con las escenas de Phaser.
 * Las escenas escriben con ui.set(...) y registran sus acciones en ui.actions;
 * los componentes de Preact leen con useUI() y llaman a esas acciones.
 */

export interface MenuItemVM {
  id: string;
  label: string;
  /** Texto a la derecha (precio, tecla...). */
  hint?: string;
  /** Clave de imagen del juego (sprite de unidad). */
  icon?: string | null;
  disabled?: boolean;
  danger?: boolean;
  /** Linea de detalle que se muestra al pie cuando esta seleccionado. */
  detail?: string;
}

export interface Anchor {
  /** Rectangulo de la casilla en pixeles CSS de la ventana. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MenuVM {
  kind: 'unit' | 'game' | 'buy' | 'cargo';
  title?: string;
  subtitle?: string;
  items: MenuItemVM[];
  selected: number;
  anchor: Anchor;
}

export interface ForecastVM {
  attackerIcon: string | null;
  defenderIcon: string | null;
  low: number;
  high: number;
  expected: number;
  lifeBefore: number;
  lifeAfter: number;
  killChance: number;
  anchor: Anchor;
}

export interface UnitVM {
  icon: string | null;
  name: string;
  team: 0 | 1;
  life: number;
  fuel?: { now: number; max: number };
  ammo?: { now: number; max: number };
  stats: string;
  status?: string;
  cargo?: string;
}

export interface TileVM {
  terrain: { key: string; name: string; defense: number };
  building?: { icon: string | null; name: string; owner: 'you' | 'enemy' | 'neutral' | 'unknown'; income: number };
  unit?: UnitVM;
}

export interface IdleVM {
  uid: number;
  icon: string | null;
  name: string;
}

export interface MainMenuItemVM {
  id: string;
  label: string;
  value?: string;
  disabled?: boolean;
  primary?: boolean;
}

export interface UIState {
  screen: 'loading' | 'logo' | 'menu' | 'game' | 'end';
  loading: number;
  mainMenu: { items: MainMenuItemVM[]; selected: number };
  // Partida
  funds: number;
  income: number;
  buildings: number;
  day: number;
  turn: 'player' | 'enemy';
  busy: boolean;
  menu: MenuVM | null;
  forecast: ForecastVM | null;
  tile: TileVM | null;
  cursorScreen: { x: number; y: number };
  idle: IdleVM[];
  threat: boolean;
  toast: { text: string; id: number } | null;
  banner: { small: string; big: string; tone: 'blue' | 'red'; id: number } | null;
  hint: string;
  end: { won: boolean } | null;
}

export interface UIActions {
  mainMenuPick(i: number): void;
  mainMenuHover(i: number): void;
  menuPick(i: number): void;
  menuHover(i: number): void;
  menuClose(): void;
  endTurn(): void;
  openGameMenu(): void;
  toggleThreat(): void;
  focusUnit(uid: number): void;
  endContinue(): void;
}

const noop = () => {};

const initial: UIState = {
  screen: 'loading',
  loading: 0,
  mainMenu: { items: [], selected: 0 },
  funds: 0,
  income: 0,
  buildings: 0,
  day: 1,
  turn: 'player',
  busy: false,
  menu: null,
  forecast: null,
  tile: null,
  cursorScreen: { x: 0, y: 0 },
  idle: [],
  threat: false,
  toast: null,
  banner: null,
  hint: '',
  end: null,
};

type Listener = () => void;
let state: UIState = initial;
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
        listeners.forEach((l) => l());
      });
    }
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  actions: {
    mainMenuPick: noop,
    mainMenuHover: noop,
    menuPick: noop,
    menuHover: noop,
    menuClose: noop,
    endTurn: noop,
    openGameMenu: noop,
    toggleThreat: noop,
    focusUnit: noop,
    endContinue: noop,
  } as UIActions,
};

let toastId = 0;
export function showToast(text: string): void {
  ui.set({ toast: { text, id: ++toastId } });
}
export function showBanner(small: string, big: string, tone: 'blue' | 'red'): void {
  ui.set({ banner: { small, big, tone, id: ++toastId } });
}
