import type { Anchor } from './common';

/** Menus: emergente de la partida (unidad, compra, carga, pausa) y pantallas del menu principal. */

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

export interface MainMenuItemVM {
  id: string;
  label: string;
  value?: string;
  disabled?: boolean;
  primary?: boolean;
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

/** Las filas de la pantalla de opciones: botones de segmento, una tecla o un boton. */
export type OptionsRowVM = ({ kind: 'choices' } & OptionRowVM) | KeyRowVM | ActionRowVM;

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

export interface HomeVM {
  focus: string;
  save: { thumb: string; day: number; funds: number; size: number; mission: string | null; limit: number | null } | null;
  /** Resumen de las ultimas opciones (lo que hara "Rapida"). */
  quick: string;
  /** Hay servidor de partidas por la red: sale «Jugar en línea». */
  online: boolean;
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
  /** General del jugador (siempre a la vista, no solo en "Personalizada") y lo que hace. */
  /** Quien juega el otro equipo: la IA u otra persona en esta pantalla. */
  rival: OptionRowVM;
  general: OptionRowVM | null;
  enemyGeneral: OptionRowVM | null;
  generalNote: string;
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
  /** "Equipo 1" y su general, si lo tiene. */
  label: string;
  general: string | null;
  kind: 'person' | 'ai';
  joined: boolean;
  isMe: boolean;
  /** Su enlace de invitacion (solo los sabe quien creo la sala). */
  invite: string | null;
  /** Quien creo la sala puede darlo a la IA (una persona que no ha entrado, mientras se espera). */
  canHandToAi: boolean;
}

/** Una sala apuntada en «Mis partidas en línea». */
export interface OnlineRoomVM {
  code: string;
  /** "3 equipos · En juego". */
  summary: string;
}

/** La pantalla de «Jugar en línea»: el menu, crear una sala, entrar con un enlace o el vestibulo. */
export interface OnlineVM {
  mode: 'menu' | 'create' | 'join' | 'lobby';
  focus: string;
  rooms: OnlineRoomVM[];
  /** Crear sala: las opciones de la partida, los asientos (quien y con que general) y los relojes. */
  create: {
    groups: { title: string; rows: OptionRowVM[] }[];
    seats: OptionRowVM[][];
    timers: OptionRowVM[];
    thumb: string;
    mapInfo: string;
  };
  join: { text: string; error: string | null };
  lobby: { code: string; status: string; seats: OnlineSeatVM[]; note: string; connection: string } | null;
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
