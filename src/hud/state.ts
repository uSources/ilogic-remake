import type { HelpRules } from '../i18n/help';
import type { TextKey } from '../settings';
import type { EndOutcome, EndStatsVM } from './vm/end';
import type { Anchor, BySide, Side } from './vm/common';
import type { ForecastVM } from './vm/combat';
import type { SelectionVM } from './vm/army';
import type { CampaignItemVM, HomeVM, MenuVM, NetVM, OnlineVM, OptionsVM, SetupVM } from './vm/menus';
import type { MinimapVM } from './vm/minimap';
import type { NotesVM } from './vm/notes';
import type { HandoffVM } from './vm/notices';
import type { TileVM } from './vm/tile';
import type { DayInfoVM, EconomyVM, WeatherVM } from './vm/topBar';

/**
 * Forma del estado de la interfaz y su valor al arrancar. Cada campo es lo que enseña una pantalla o
 * un panel (null = no se enseña); los tipos de cada panel estan en vm/ (agrupados por pantalla).
 */

export interface UIState {
  home: HomeVM;
  setup: SetupVM;
  options: OptionsVM | null;
  screen: 'loading' | 'menu' | 'setup' | 'campaign' | 'online' | 'game' | 'end';
  /** Jugar en línea (la pantalla del menu). */
  online: OnlineVM;
  /** La conexion con el servidor en una partida por la red (null en una partida de esta pantalla). */
  net: NetVM | null;
  campaign: {
    items: CampaignItemVM[];
    selected: number;
    brief: string;
    objective: string;
  };
  /** Panel de la mision en curso (null fuera de la campaña). */
  mission: { title: string; objective: string; status: string | null; tip: string | null; step: string | null } | null;
  loading: number;
  // Partida
  funds: number;
  /** Desglose de dinero y mando (al pasar por encima del dinero). */
  economy: EconomyVM | null;
  /** Desglose del dia (al pasar por encima del dia). */
  dayInfo: DayInfoVM | null;
  day: number;
  /** De quien es el turno, visto por quien mira: suyo, de un aliado o de un enemigo. */
  turn: Side;
  busy: boolean;
  /** Se mira jugar a los demas (lo dice la escena: watchesOthers): el boton del menu deja salir. */
  watching: boolean;
  menu: MenuVM | null;
  forecast: ForecastVM | null;
  /** Clima (null si la partida no tiene). */
  weather: WeatherVM | null;
  tile: TileVM | null;
  /** Donde esta en la pantalla la casilla de `tile` (su ficha sale al lado); null: no se sabe (2D). */
  tileAt: Anchor | null;
  /** [CAMBIO] Panel de lo elegido (con dos o mas unidades; null = no se enseña). */
  selection: SelectionVM | null;
  /**
   * [CAMBIO] Boton de fin de turno: unidades que quedan sin mover (las que capturan solas no cuentan)
   * y si esta esperando la confirmacion (primer clic con unidades sin mover y el aviso activado).
   */
  endTurn: { pending: number; armed: boolean };
  /** La escuadra que se esta renombrando (null = ninguna). */
  rename: { id: number; name: string; max: number } | null;
  toast: { text: string; id: number } | null;
  /** El cartel que cae: lo grande («Día 4»), lo pequeño («Tu turno»), su color y el clima si ha cambiado (su id). */
  banner: { small: string; big: string; tone: 'blue' | 'red'; weather: string | null; id: number } | null;
  end: {
    /** Como ha acabado para quien mira. */
    outcome: EndOutcome;
    day: number;
    /** Lo de la alianza de quien mira y lo de todos sus enemigos juntos. */
    stats: EndStatsVM | null;
    /** Por que ha acabado, ya visto por quien mira (endOfMatch.ts: reasonText), o null. */
    reasonText: TextKey | null;
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
  helpRules: HelpRules | null;
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
  home: {
    focus: 'quick',
    save: null,
    quick: '',
    online: false,
    campaign: { done: 0, total: 0, next: null, thumb: null, marks: [] },
    credits: false,
  },
  setup: {
    focus: 'start',
    preset: 'normal',
    presets: [],
    groups: [],
    rival: { id: 'opt-rival', group: '', label: '', choices: [], index: 0 },
    code: '',
    codeError: false,
    mapCode: '',
    thumb: '',
    mapInfo: '',
  },
  online: {
    mode: 'menu',
    focus: 'create',
    rooms: [],
    create: { groups: [], seats: [], timers: [], thumb: '', mapInfo: '' },
    join: { text: '', error: null },
    lobby: null,
    error: null,
    busy: false,
  },
  net: null,
  options: null,
  campaign: { items: [], selected: 0, brief: '', objective: '' },
  mission: null,
  funds: 0,
  economy: null,
  dayInfo: null,
  day: 1,
  turn: 'own',
  busy: false,
  watching: false,
  menu: null,
  forecast: null,
  tile: null,
  tileAt: null,
  selection: null,
  endTurn: { pending: 0, armed: false },
  rename: null,
  toast: null,
  banner: null,
  weather: null,
  end: null,
  dayLimit: null,
  helpRules: null,
  handoff: null,
  minimap: null,
  minimapView: { x: 0, y: 0, w: 0, h: 0 },
  help: false,
  notes: null,
  newsBadge: false,
  updateAvailable: null,
  // Siempre abierto (tambien en el movil, mas pequeño); la M lo cierra.
  minimapOn: true,
};
