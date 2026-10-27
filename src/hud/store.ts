import { settings } from '../settings';

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
  /** Lineas extra (objetivo de la mision) en el panel de pausa. */
  info?: string[];
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
  /** Contraataque previsto sobre tu unidad (null si no habra). */
  counter: { low: number; high: number; lifeBefore: number; lifeAfter: number; killChance: number } | null;
}

export interface UnitVM {
  /** Rango de veterania 0..3. */
  rank?: number;
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

/** Bocadillo junto al cursor al mover una unidad. */
export interface MoveTipVM {
  anchor: Anchor;
  action: string;
  invalid?: boolean;
  used?: number;
  max?: number;
  stars?: number;
  fuel?: [number, number];
  danger?: boolean;
  warn?: string;
}

export interface TileVM {
  terrain: { key: string; name: string; defense: number; cost?: { foot: number | null; vehicle: number | null } };
  building?: {
    icon: string | null;
    name: string;
    owner: 'you' | 'enemy' | 'neutral' | 'unknown';
    income: number;
    /** Captura a medias: puntos que quedan, total y quien captura. */
    capture?: { left: number; total: number; team: 0 | 1 };
  };
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

export interface ReportLineVM {
  icon: string;
  text: string;
  tone: 'gold' | 'green' | 'red' | 'plain';
}

export interface SetupRowVM {
  id: string;
  label: string;
  kind: 'choice' | 'code' | 'start' | 'back';
  value?: string;
  /** Explicacion corta que sale debajo cuando la fila esta elegida. */
  note?: string;
}

/** Fila de la pantalla de opciones: un grupo, un nombre y botones de segmento. */
export interface OptionRowVM {
  id: string;
  group: string;
  label: string;
  choices: string[];
  index: number;
}

export type MarkVM = 'done' | 'open' | 'locked';

export interface HomeVM {
  focus: string;
  save: { thumb: string; day: number; funds: number; size: number; mission: string | null; limit: number | null } | null;
  /** Resumen de las ultimas opciones (lo que hara "Rapida"). */
  quick: string;
  campaign: { done: number; total: number; next: string | null; thumb: string | null; marks: MarkVM[] };
  credits: boolean;
}

export interface PresetVM {
  id: string;
  label: string;
  note: string;
}

export interface SetupVM {
  focus: string;
  preset: string;
  presets: PresetVM[];
  /** Opciones de "Personalizada", con botones de segmento. */
  groups: { title: string; rows: OptionRowVM[] }[];
  code: string;
  codeError: boolean;
  /** Codigo del mapa que se ve en la vista previa. */
  mapCode: string;
  thumb: string;
  mapInfo: string;
}

export interface CampaignItemVM {
  id: string;
  title: string;
  status: MarkVM;
  thumb: string;
  kind: string;
  best: number | null;
}

export interface UIState {
  home: HomeVM;
  setup: SetupVM;
  options: { focus: number; rows: OptionRowVM[] } | null;
  /** Panel de pausa centrado (menu de partida). */
  pause: { title: string; info: string[]; items: MenuItemVM[]; selected: number } | null;
  screen: 'loading' | 'logo' | 'menu' | 'setup' | 'campaign' | 'game' | 'outro' | 'end';
  campaign: {
    items: CampaignItemVM[];
    selected: number;
    brief: string;
    objective: string;
  };
  /** Panel de la mision en curso (null fuera de la campaña). */
  mission: { title: string; objective: string; status: string | null; tip: string | null; step: string | null } | null;
  newGame: { rows: SetupRowVM[]; selected: number; code: string; codeError: boolean };
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
  moveTip: MoveTipVM | null;
  tile: TileVM | null;
  cursorScreen: { x: number; y: number };
  idle: IdleVM[];
  threat: boolean;
  toast: { text: string; id: number } | null;
  banner: { small: string; big: string; tone: 'blue' | 'red'; id: number } | null;
  hint: string;
  end: {
    won: boolean;
    day: number;
    stats: import('../core/stats').GameStats | null;
    reason: 'hq' | 'wipeout' | 'days' | 'objective' | 'surrender' | null;
    /** Titulo de la mision, si se jugaba una. */
    mission: string | null;
    score: [number, number] | null;
    /** Valor de los ejercitos dia a dia [jugador, IA]. */
    chart: [number, number][] | null;
    /** Mision: mejor marca en dias y si se acaba de batir. */
    best: number | null;
    newBest: boolean;
    buttons: { id: string; label: string }[];
    selected: number;
  } | null;
  /** Limite de dias de la partida (null = sin limite). */
  dayLimit: number | null;
  report: { title: string; lines: ReportLineVM[]; id: number } | null;
  minimap: MinimapVM | null;
  /** Parte del mapa que se ve, en casillas. */
  minimapView: { x: number; y: number; w: number; h: number };
  minimapOn: boolean;
  help: boolean;
}

export interface MinimapVM {
  /** Tamaño del mapa en casillas. */
  w: number;
  h: number;
  /** Color de terreno por casilla, fila a fila (y*w+x). */
  terrain: number[];
  fog: boolean[][];
  buildings: { x: number; y: number; owner: 0 | 1 | null }[];
  units: { x: number; y: number; team: 0 | 1 }[];
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
  toggleMinimap(): void;
  minimapJump(x: number, y: number): void;
  focusUnit(uid: number): void;
  endContinue(): void;
  endHover(i: number): void;
  endPick(i: number): void;
  closeHelp(): void;
  homeHover(id: string): void;
  homePick(id: string): void;
  setupHover(id: string): void;
  setupPick(id: string): void;
  setupSet(id: string, index: number): void;
  setupCode(text: string): void;
  optionsHover(i: number): void;
  optionsSet(i: number, index: number): void;
  optionsClose(): void;
  pauseHover(i: number): void;
  pausePick(i: number): void;
  campaignHover(i: number): void;
  campaignPick(i: number): void;
  campaignBack(): void;
  surrender(): void;
}

const noop = () => {};

const initial: UIState = {
  screen: 'loading',
  loading: 0,
  mainMenu: { items: [], selected: 0 },
  newGame: { rows: [], selected: 0, code: '', codeError: false },
  home: { focus: 'quick', save: null, quick: '', campaign: { done: 0, total: 0, next: null, thumb: null, marks: [] }, credits: false },
  setup: { focus: 'start', preset: 'normal', presets: [], groups: [], code: '', codeError: false, mapCode: '', thumb: '', mapInfo: '' },
  options: null,
  pause: null,
  campaign: { items: [], selected: 0, brief: '', objective: '' },
  mission: null,
  funds: 0,
  income: 0,
  buildings: 0,
  day: 1,
  turn: 'player',
  busy: false,
  menu: null,
  forecast: null,
  moveTip: null,
  tile: null,
  cursorScreen: { x: 0, y: 0 },
  idle: [],
  threat: false,
  toast: null,
  banner: null,
  hint: '',
  end: null,
  dayLimit: null,
  report: null,
  minimap: null,
  minimapView: { x: 0, y: 0, w: 0, h: 0 },
  help: false,
  minimapOn: typeof window !== 'undefined' ? window.innerWidth > 900 : true,
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
    toggleMinimap: noop,
    minimapJump: noop,
    focusUnit: noop,
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
  } as UIActions,
};

let toastId = 0;
export function showToast(text: string): void {
  ui.set({ toast: { text, id: ++toastId } });
}
export function showReport(title: string, lines: ReportLineVM[]): void {
  ui.set({ report: { title, lines, id: ++toastId } });
}

export const fmtNum = (n: number): string => n.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US');

export function showBanner(small: string, big: string, tone: 'blue' | 'red'): void {
  ui.set({ banner: { small, big, tone, id: ++toastId } });
}
