import type { Anchor, StatChipVM } from './common';

/** Menus: emergente de la partida (unidad, compra, carga, pausa) y pantallas del menu principal. */

export interface MenuItemVM {
  id: string;
  label: string;
  /** Texto a la derecha (precio, tecla...). */
  hint?: string;
  /** Clave de imagen del juego (sprite de unidad, icono de la interfaz). */
  icon?: string | null;
  /** Sin dibujo: un simbolo corto en su lugar (fichas y rueda). */
  glyph?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Linea de detalle que se muestra al pie cuando esta seleccionado. */
  detail?: string;
  /** En la compra: lo esencial de la unidad, en iconos (la chapa de la ficha señalada). */
  buy?: BuyFactsVM;
}

/** Lo esencial de una unidad que se compra, en iconos, y cuanto dinero falta si no llega. */
export interface BuyFactsVM {
  /** Mover, alcance y vision (`unitStatChips`). */
  stats: StatChipVM[];
  /** Los retratos de las unidades contra las que es mejor (las que mas acierta). */
  strongAgainst: string[];
  /** Lo que falta para pagarla («−2000»), si es el dinero lo que no llega; null si llega. */
  missing: number | null;
  /** Por que no se puede si no es por el dinero (sin sitio en el ejercito); null si no es eso. */
  why: string | null;
}

export interface MenuVM {
  /** `chips`: las fichas junto a lo elegido; `radial`: su rueda (clic derecho); `prompt`: elegir una casilla. */
  kind: 'chips' | 'radial' | 'prompt' | 'game' | 'buy';
  title?: string;
  subtitle?: string;
  /** Lineas extra (objetivo de la mision) en el panel de pausa. */
  info?: string[];
  items: MenuItemVM[];
  selected: number;
  anchor: Anchor;
}

/** Fila de la pantalla de opciones: un grupo, un nombre y botones de segmento. */
export interface OptionRowVM {
  id: string;
  group: string;
  label: string;
  choices: string[];
  index: number;
}

/** Fila de Opciones con una tecla que el jugador puede cambiar. */
export interface KeyRowVM {
  kind: 'key';
  id: string;
  group: string;
  label: string;
  /** La tecla de ahora, como se lee ("E", "Retroceso"). */
  value: string;
  /** Esperando a que pulse la tecla nueva. */
  capturing: boolean;
  /** Por que no valio la ultima tecla que pulso (null si valio o no ha pulsado). */
  notice: string | null;
}

/** Fila de Opciones que es un boton suelto (volver a las teclas de serie). */
export interface ActionRowVM {
  kind: 'action';
  id: string;
  group: string;
  label: string;
  text: string;
}

/** Fila de Opciones con el volumen de un canal: su boton de silencio y un deslizador. */
export interface VolumeRowVM {
  kind: 'volume';
  id: string;
  group: string;
  label: string;
  /** De 0 a `max`. */
  level: number;
  max: number;
  /** Callado (sin perder `level`). */
  muted: boolean;
  /** Como se lee: «80 %», o que esta callado. */
  text: string;
}

/** Las filas de la pantalla de opciones: botones de segmento, una tecla, un boton o un volumen. */
export type OptionsRowVM = ({ kind: 'choices' } & OptionRowVM) | KeyRowVM | ActionRowVM | VolumeRowVM;

/** Una pestaña de la pantalla de opciones: su titulo y sus filas (cada una con su `group`). */
export interface OptionsTabVM {
  id: string;
  title: string;
  rows: OptionsRowVM[];
}

/** La pantalla de opciones: las pestañas, la abierta y la fila elegida dentro de ella. */
export interface OptionsVM {
  tabs: OptionsTabVM[];
  tab: number;
  focus: number;
}

export type MarkVM = 'done' | 'open' | 'locked';

/** Una entrada de la lista de Inicio: su nombre y, debajo, lo que hay detras (el dia de la guardada, por donde va la campaña). */
export interface HomeEntryVM {
  id: string;
  title: string;
  note: string;
}

export interface HomeVM {
  focus: string;
  entries: HomeEntryVM[];
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
  /** Quien juega el otro equipo: la IA u otra persona en esta pantalla. */
  rival: OptionRowVM;
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

/** Un asiento de una sala por la red, como se ve en el vestibulo. */
export interface OnlineSeatVM {
  seat: number;
  /** "Equipo 1". */
  label: string;
  /** «Tú · dentro», «Persona · sin entrar», «La IA». */
  detail: string;
  /** Si la persona esta dentro, aun no ha entrado, o es la IA. */
  presence: 'in' | 'out' | 'ai';
  /** Quien creo la sala puede darlo a la IA (una persona que no ha entrado, mientras se espera). */
  canHandToAi: boolean;
}

/** En que esta una sala para quien la mira: le toca, le toca a otro, esperan a que entren, acabada, ya no existe, o no se sabe. */
export type OnlineRoomState = 'yourTurn' | 'theirTurn' | 'waiting' | 'ended' | 'gone' | 'unknown';

/** Una sala apuntada en «Mis partidas en línea». */
export interface OnlineRoomVM {
  code: string;
  state: OnlineRoomState;
  /** «Te toca», «Turno del equipo 2», «Esperando jugadores»... */
  title: string;
  /** «Día 4 · quedan 3 h · 2 equipos». */
  detail: string;
  /** El boton para entrar («Jugar» si le toca, «Entrar» si no), o null si la sala ya no existe. */
  enter: string | null;
  /** El de quitarla de la lista: «Quitar», o «Cancelar» si es la propia busqueda de rival (la cierra en el servidor). */
  forget: string;
}

/** El vestibulo de una sala: el codigo y el enlace para invitar, quien hay y la conexion. */
export interface OnlineLobbyVM {
  code: string;
  /** El enlace de la sala (quien lo abre se queda con un asiento libre). */
  link: string;
  /** Se puede invitar (la sala aun espera a alguien). */
  canInvite: boolean;
  /** El sistema sabe compartir (movil): se ofrece ademas de copiar. */
  canShare: boolean;
  /** Si es la propia busqueda de rival, aun esperando: su ritmo («Por turnos · 1 día por turno»); se puede cancelar. Si no, null. */
  searching: string | null;
  seats: OnlineSeatVM[];
  /** El boton de dar un asiento a la IA: «Sustituir por IA», o «Jugar contra la IA» si se busca rival. */
  handToAiLabel: string;
  note: string;
  connection: string;
}

/** Un ritmo de «Buscar rival»: «Por turnos» o «En vivo». */
export interface OnlinePaceVM {
  id: string;
  label: string;
}

/** «Buscar rival»: los ritmos, el elegido y lo que trae («1 día por turno · Juega cuando puedas…»). */
export interface OnlineSearchVM {
  paces: OnlinePaceVM[];
  pace: string;
  note: string;
}

/** La pantalla de «Jugar en línea»: el menu (buscar rival, crear, entrar con el codigo y mis partidas), crear una partida o el vestibulo. */
export interface OnlineVM {
  mode: 'menu' | 'create' | 'lobby';
  focus: string;
  search: OnlineSearchVM;
  rooms: OnlineRoomVM[];
  /** El cuadro del codigo (o el enlace) de una sala, y por que no vale lo escrito. */
  code: { text: string; error: string | null };
  /** Crear partida: quien juega cada asiento, las reglas (ajustes y, en «Personalizada», sus opciones), los relojes y el mapa. */
  create: {
    seats: OptionRowVM[];
    presets: PresetVM[];
    preset: string;
    presetNote: string;
    options: OptionRowVM[];
    timers: OptionRowVM[];
    thumb: string;
    mapInfo: string;
  };
  lobby: OnlineLobbyVM | null;
  /** Algo que ha fallado (se enseña arriba). */
  error: string | null;
  /** Esperando al servidor (crear, entrar). */
  busy: boolean;
}

/** La conexion de una partida por la red, en la partida. */
export interface NetVM {
  status: 'online' | 'reconnecting' | 'offline';
  /** "Esperando al equipo 2…" mientras juega otro (null en el turno propio). */
  waiting: string | null;
}
