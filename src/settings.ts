/**
 * Configuracion del jugador (idioma, autoguardado, musica).
 * En el original se guardaba en data/config al cerrar la ventana;
 * aqui se guarda en localStorage en cada cambio.
 */
import { CONTENT, TERRAIN_CONTENT } from './core/data';
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

const KEY = 'ilogic.settings';

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
const SPEEDS: Speed[] = ['normal', 'fast', 'instant'];

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      lang: parsed.lang === 'en' ? 'en' : 'es',
      autosave: !!parsed.autosave,
      music: !!parsed.music,
      autoWait: parsed.autoWait !== false,
      autoNext: !!parsed.autoNext,
      speedOwn: SPEEDS.includes(parsed.speedOwn as Speed) ? (parsed.speedOwn as Speed) : 'normal',
      speedEnemy: SPEEDS.includes(parsed.speedEnemy as Speed) ? (parsed.speedEnemy as Speed) : 'normal',
      uiScale: UI_SCALES.includes(parsed.uiScale as number) ? (parsed.uiScale as number) : 1,
      reduceMotion: !!parsed.reduceMotion,
      alwaysThreat: !!parsed.alwaysThreat,
      warnIdle: parsed.warnIdle !== false,
      menuBg: parsed.menuBg === 'classic' ? 'classic' : 'live',
      terrainArt: parsed.terrainArt === 'classic' ? 'classic' : 'new',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

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
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento disponible (modo privado, etc.): se ignora.
  }
}

/** Numero con separador de miles del idioma del juego (1.000 / 1,000). */
export const fmtNum = (n: number): string => n.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US');

/** Texto de la interfaz en el idioma elegido (los textos, por tema, en src/i18n/). */
export function t(key: TextKey): string {
  return TEXTS[settings.lang][key];
}

/** Nombres de unidades, edificios y terrenos: los de src/core/content/*.json. */
export const unitLabel = (type: number): string => CONTENT.units[type]?.name[settings.lang] ?? '?';
export const buildingLabel = (type: number): string => CONTENT.buildings[type]?.name[settings.lang] ?? '?';
export const weatherLabel = (kind: number): string => CONTENT.weather[kind]?.name[settings.lang] ?? '?';
export const terrainLabel = (type: number): string => TERRAIN_CONTENT[type]?.name[settings.lang] ?? '?';
