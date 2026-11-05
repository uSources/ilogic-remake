/**
 * Configuracion del jugador (idioma, autoguardado, musica).
 * En el original se guardaba en data/config al cerrar la ventana;
 * aqui se guarda en localStorage en cada cambio.
 */
import type { GameContent } from './core/content';
import { TEXTS, type TextKey } from './i18n';

export type { TextKey };

export type Lang = 'es' | 'en';

export type Speed = 'normal' | 'fast' | 'instant';

export interface Settings {
  lang: Lang;
  autosave: boolean;
  music: boolean;
  /** Al soltar una unidad donde no tiene nada mas que hacer, espera sola. */
  autoWait: boolean;
  /** Tras terminar con una unidad, el cursor salta a la siguiente sin mover. */
  autoNext: boolean;
  /** Velocidad de las animaciones de tus unidades y de las del enemigo. */
  speedOwn: Speed;
  speedEnemy: Speed;
  /** Tamaño de la interfaz HTML (0.9, 1 o 1.25). */
  uiScale: number;
  /** Reducir el movimiento aunque el sistema no lo pida. */
  reduceMotion: boolean;
  /** Empezar cada partida con la zona de amenaza enemiga a la vista. */
  alwaysThreat: boolean;
  /** [CAMBIO] Al terminar el turno con unidades sin mover, el boton pide confirmarlo. */
  warnIdle: boolean;
  /** Fondo del menu principal: partida en directo o la imagen original de 2013. */
  menuBg: 'live' | 'classic';
  /** Dibujo del terreno: el nuevo (piezas con orillas) o el de 2013. */
  terrainArt: 'new' | 'classic';
}

const STORAGE_KEY = 'ilogic.settings';

const DEFAULTS: Settings = {
  lang: 'es',
  autosave: false,
  music: false,
  autoWait: true,
  autoNext: false,
  speedOwn: 'normal',
  speedEnemy: 'normal',
  uiScale: 1,
  reduceMotion: false,
  alwaysThreat: false,
  warnIdle: true,
  menuBg: 'live',
  terrainArt: 'new',
};
export const UI_SCALES = [0.9, 1, 1.25];
const LANGS: Lang[] = ['es', 'en'];
const SPEEDS: Speed[] = ['normal', 'fast', 'instant'];
const MENU_BACKGROUNDS: Settings['menuBg'][] = ['live', 'classic'];
const TERRAIN_ARTS: Settings['terrainArt'][] = ['new', 'classic'];

/** Lo guardado si es uno de los valores validos; si no (o no estaba, o es de otra version), `fallback`. */
const oneOf = <T>(saved: unknown, valid: readonly T[], fallback: T): T => (valid.includes(saved as T) ? (saved as T) : fallback);

/**
 * Las opciones guardadas, sin fiarse de lo que haya: cada campo se comprueba y, si no vale, se queda
 * el de por defecto. Las que empiezan encendidas solo se apagan con un `false` guardado.
 */
function parseSaved(saved: Partial<Settings>): Settings {
  return {
    lang: oneOf(saved.lang, LANGS, DEFAULTS.lang),
    autosave: !!saved.autosave,
    music: !!saved.music,
    autoWait: saved.autoWait !== false,
    autoNext: !!saved.autoNext,
    speedOwn: oneOf(saved.speedOwn, SPEEDS, DEFAULTS.speedOwn),
    speedEnemy: oneOf(saved.speedEnemy, SPEEDS, DEFAULTS.speedEnemy),
    uiScale: oneOf(saved.uiScale, UI_SCALES, DEFAULTS.uiScale),
    reduceMotion: !!saved.reduceMotion,
    alwaysThreat: !!saved.alwaysThreat,
    warnIdle: saved.warnIdle !== false,
    menuBg: oneOf(saved.menuBg, MENU_BACKGROUNDS, DEFAULTS.menuBg),
    terrainArt: oneOf(saved.terrainArt, TERRAIN_ARTS, DEFAULTS.terrainArt),
  };
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return parseSaved(JSON.parse(raw) as Partial<Settings>);
  } catch {
    // Sin almacenamiento (modo privado...) o con algo que no es JSON: las de por defecto.
    return { ...DEFAULTS };
  }
}

export const settings: Settings = loadSettings();

/** Aplica a la pagina lo que depende de las opciones (tamaño de la interfaz, menos movimiento, idioma). */
export function applySettings(): void {
  const hud = document.getElementById('hud');
  if (hud) (hud.style as CSSStyleDeclaration & { zoom: string }).zoom = String(settings.uiScale);
  document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  document.documentElement.lang = settings.lang;
}

export function saveSettings(): void {
  applySettings();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento disponible (modo privado, etc.): se ignora.
  }
}

/** Numero con separador de miles del idioma del juego (1.000 / 1,000). */
export const fmtNum = (value: number): string => value.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US');

/** Texto de la interfaz en el idioma elegido (los textos, por tema, en src/i18n/). */
export function t(key: TextKey): string {
  return TEXTS[settings.lang][key];
}

/** Nombres de unidades, edificios y terrenos: los de src/core/content/*.json. */
/** Nombres en el idioma elegido, sacados del contenido de la partida (`s.content`). */
export const unitLabel = (content: GameContent, type: number): string => content.files.units[type]?.name[settings.lang] ?? '?';
export const buildingLabel = (content: GameContent, type: number): string => content.files.buildings[type]?.name[settings.lang] ?? '?';
export const weatherLabel = (content: GameContent, kind: number): string => content.files.weather[kind]?.name[settings.lang] ?? '?';
export const terrainLabel = (content: GameContent, type: number): string => content.files.terrain[type]?.name[settings.lang] ?? '?';
