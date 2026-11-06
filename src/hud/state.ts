import type { EndReason, RulesConfig } from '../core/model';
import type { EndOutcome, EndStatsVM } from './vm/end';
import type { BySide, Side } from './vm/common';
import type { CombatVM, ForecastVM } from './vm/combat';
import type { MoveTipVM, IdleVM, SelectionVM, SquadVM } from './vm/army';
import type { GeneralVM } from './vm/general';
import type { LabVM } from './vm/lab';
import type { CampaignItemVM, HomeVM, MainMenuItemVM, MenuItemVM, MenuVM, OptionRowVM, SetupRowVM, SetupVM } from './vm/menus';
import type { MinimapVM } from './vm/minimap';
import type { NotesVM } from './vm/notes';
import type { HandoffVM, ReportLineVM } from './vm/notices';
import type { TileVM } from './vm/tile';
import type { DayInfoVM, EconomyVM, WeatherVM } from './vm/topBar';

/**
 * Forma del estado de la interfaz y su valor al arrancar. Cada campo es lo que enseña una pantalla o
 * un panel (null = no se enseña); los tipos de cada panel estan en vm/ (agrupados por pantalla).
 */

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
  /** Ingresos por dia ya restado el mantenimiento (puede ser negativo). */
  income: number;
  /** Puntos de mando usados y maximos (null = regla desactivada). */
  commandPoints: { used: number; max: number } | null;
  /** Desglose de dinero y mando (al pasar por encima del dinero). */
  economy: EconomyVM | null;
  /** Desglose del dia (al pasar por encima del dia). */
  dayInfo: DayInfoVM | null;
  /** Laboratorio de animaciones (null en una partida normal). */
  lab: LabVM | null;
  /** General del equipo que mira. */
  general: GeneralVM | null;
  /** General del primer enemigo que tenga uno (solo para verlo). */
  enemyGeneral: GeneralVM | null;
  buildings: number;
  day: number;
  /** De quien es el turno, visto por quien mira: suyo, de un aliado o de un enemigo. */
  turn: Side;
  busy: boolean;
  menu: MenuVM | null;
  forecast: ForecastVM | null;
  /** Clima (null si la partida no tiene). */
  weather: WeatherVM | null;
  combat: CombatVM | null;
  moveTip: MoveTipVM | null;
  tile: TileVM | null;
  cursorScreen: { x: number; y: number };
  idle: IdleVM[];
  /** [CAMBIO] Escuadras del jugador y la que se esta renombrando (null = ninguna). */
  squads: SquadVM[];
  /** [CAMBIO] Modo "Elegir varias": cuantas hay elegidas (null = modo apagado). */
  multi: number | null;
  /** [CAMBIO] Panel de lo elegido (con dos o mas unidades; null = no se enseña). */
  selection: SelectionVM | null;
  /**
   * [CAMBIO] Boton de fin de turno: unidades que quedan sin mover (las que capturan solas no cuentan)
   * y si esta esperando la confirmacion (primer clic con unidades sin mover y el aviso activado).
   */
  endTurn: { pending: number; armed: boolean };
  rename: { id: number; name: string; max: number } | null;
  threat: boolean;
  /** [CAMBIO] Se ven las intenciones de todas las unidades con orden (tecla V) y si hay alguna con orden. */
  intents: boolean;
  anyStandingOrder: boolean;
  toast: { text: string; id: number } | null;
  banner: { small: string; big: string; tone: 'blue' | 'red'; id: number } | null;
  hint: string;
  end: {
    /** Como ha acabado para quien mira. */
    outcome: EndOutcome;
    day: number;
    /** Lo de la alianza de quien mira y lo de todos sus enemigos juntos. */
    stats: EndStatsVM | null;
    reason: EndReason | null;
    /** Titulo de la mision, si se jugaba una. */
    mission: string | null;
    /** Puntos de su alianza y de la mejor enemiga. */
    score: BySide | null;
    /** Valor de los ejercitos dia a dia (su alianza y sus enemigos). */
    chart: BySide[] | null;
    /** Mision: mejor marca en dias y si se acaba de batir. */
    best: number | null;
    newBest: boolean;
    buttons: { id: string; label: string }[];
    selected: number;
  } | null;
  /** Limite de dias de la partida (null = sin limite). */
  dayLimit: number | null;
  /** Reglas que cuenta la ayuda: las de la partida en curso, o en el menu las de una partida nueva (null hasta que la escena las pone). */
  helpRules: RulesConfig | null;
  report: { title: string; lines: ReportLineVM[]; id: number } | null;
  /** Cambio de persona en la misma pantalla (null: no hay que cambiar). */
  handoff: HandoffVM | null;
  minimap: MinimapVM | null;
  /** Parte del mapa que se ve, en casillas. */
  minimapView: { x: number; y: number; w: number; h: number };
  minimapOn: boolean;
  help: boolean;
  notes: NotesVM | null;
  /** Hay notas de parche sin leer. */
  newsBadge: boolean;
  /** Version nueva publicada (null si se juega la ultima). */
  updateAvailable: string | null;
}

export const initialState: UIState = {
  screen: 'loading',
  loading: 0,
  mainMenu: { items: [], selected: 0 },
  newGame: { rows: [], selected: 0, code: '', codeError: false },
  home: { focus: 'quick', save: null, quick: '', campaign: { done: 0, total: 0, next: null, thumb: null, marks: [] }, credits: false },
  setup: {
    focus: 'start',
    preset: 'normal',
    presets: [],
    groups: [],
    rival: { id: 'opt-rival', group: '', label: '', choices: [], index: 0 },
    general: null,
    enemyGeneral: null,
    generalNote: '',
    code: '',
    codeError: false,
    mapCode: '',
    thumb: '',
    mapInfo: '',
  },
  options: null,
  pause: null,
  campaign: { items: [], selected: 0, brief: '', objective: '' },
  mission: null,
  funds: 0,
  economy: null,
  lab: null,
  general: null,
  enemyGeneral: null,
  dayInfo: null,
  income: 0,
  commandPoints: null,
  buildings: 0,
  day: 1,
  turn: 'own',
  busy: false,
  menu: null,
  forecast: null,
  combat: null,
  moveTip: null,
  tile: null,
  cursorScreen: { x: 0, y: 0 },
  idle: [],
  squads: [],
  multi: null,
  selection: null,
  endTurn: { pending: 0, armed: false },
  rename: null,
  threat: false,
  intents: false,
  anyStandingOrder: false,
  toast: null,
  banner: null,
  weather: null,
  hint: '',
  end: null,
  dayLimit: null,
  helpRules: null,
  report: null,
  handoff: null,
  minimap: null,
  minimapView: { x: 0, y: 0, w: 0, h: 0 },
  help: false,
  notes: null,
  newsBadge: false,
  updateAvailable: null,
  minimapOn: typeof window !== 'undefined' ? window.innerWidth > 900 : true,
};
