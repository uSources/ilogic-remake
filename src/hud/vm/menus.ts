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
