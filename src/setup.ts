/**
 * Opciones de "Nueva partida": reglas, mapa y economia. Se recuerdan entre partidas.
 */
import { DEFAULT_RULES, GENERALS, type RulesConfig } from './core/data';
import { fmtNum, settings } from './settings';

export interface NewGameOptions {
  size: number;
  theme: number | null;
  fog: boolean;
  /** [CAMBIO] Clima que cambia cada pocos dias. */
  weather: boolean;
  funds: number;
  income: number;
  dayLimit: number | null;
  /** Puntos de mando por bando (null = sin limite de puntos). */
  command: number | null;
  /** Mantenimiento por ronda, tanto por uno del precio de las unidades. */
  upkeep: number;
  /** General del jugador (id de generals.json; null = sin general). */
  general: string | null;
  /** General de la IA (id de generals.json; null = sin general). */
  enemyGeneral: string | null;
  /** Codigo de mapa escrito por el jugador ('' = al azar). */
  code: string;
  /** Ajuste elegido en la pantalla de nueva partida. */
  preset: PresetId;
}

export type PresetId = 'normal' | 'quick' | 'custom';
export const PRESET_IDS: PresetId[] = ['normal', 'quick', 'custom'];

/** Ajustes ya hechos (el tema del mapa no cambia: lo elige el jugador o la vista previa). */
export const PRESETS: Record<
  Exclude<PresetId, 'custom'>,
  Omit<NewGameOptions, 'theme' | 'code' | 'preset' | 'general' | 'enemyGeneral'>
> = {
  normal: { size: 32, fog: true, weather: true, funds: 5000, income: 1, dayLimit: null, command: 30, upkeep: 0.1 },
  quick: { size: 20, fog: true, weather: true, funds: 5000, income: 1.5, dayLimit: 20, command: 20, upkeep: 0.1 },
};

export function applyPreset(options: NewGameOptions, id: PresetId): NewGameOptions {
  return id === 'custom' ? { ...options, preset: id } : { ...options, ...PRESETS[id], preset: id };
}

export const DEFAULT_OPTIONS: NewGameOptions = {
  size: 32,
  theme: null,
  fog: true,
  weather: true,
  funds: 5000,
  income: 1,
  dayLimit: null,
  command: 30,
  upkeep: 0.1,
  general: null,
  enemyGeneral: null,
  code: '',
  preset: 'normal',
};

/** Valores posibles de cada opcion (en orden). */
export const CHOICES = {
  size: [20, 32, 40] as const,
  theme: [null, 0, 1, 2, 3, 4] as const,
  fog: [true, false] as const,
  weather: [true, false] as const,
  funds: [3000, 5000, 8000, 12000] as const,
  income: [0.5, 1, 1.5, 2] as const,
  dayLimit: [null, 20, 30, 40, 60] as const,
  command: [null, 20, 30, 40] as const,
  upkeep: [0, 0.05, 0.1, 0.15] as const,
  /** Sin general o uno de generals.json. */
  general: [null, ...GENERALS.map((g) => g.id)] as readonly (string | null)[],
  enemyGeneral: [null, ...GENERALS.map((g) => g.id)] as readonly (string | null)[],
};
export type ChoiceKey = keyof typeof CHOICES;

const STORAGE_KEY = 'ilogic.newgame';

/** Las opciones guardadas que siguen siendo validas; las demas, las de siempre. */
function optionsFromSaved(saved: Partial<NewGameOptions>): NewGameOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (const key of Object.keys(CHOICES) as ChoiceKey[]) {
    const value = saved[key];
    if ((CHOICES[key] as readonly unknown[]).includes(value)) (options as Record<string, unknown>)[key] = value;
  }
  if (PRESET_IDS.includes(saved.preset as PresetId)) options.preset = saved.preset as PresetId;
  return { ...options, code: '' };
}

export function loadOptions(): NewGameOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<NewGameOptions> | null;
    return saved ? optionsFromSaved(saved) : { ...DEFAULT_OPTIONS };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(options: NewGameOptions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...options, code: '' }));
  } catch {
    // sin almacenamiento
  }
}

/** Reglas de la partida a partir de las opciones. */
export function rulesFor(options: NewGameOptions): RulesConfig {
  return {
    ...DEFAULT_RULES,
    fog: options.fog,
    weather: options.weather,
    initialFunds: options.funds,
    incomeScale: options.income,
    dayLimit: options.dayLimit,
    commandPoints: options.command,
    upkeep: options.upkeep,
  };
}

/** Codigo de mapa: la semilla en base 36, en mayusculas (p. ej. "K3F9A2"). */
export const seedToCode = (seed: number): string => (seed >>> 0).toString(36).toUpperCase();

/** Lo mas largo que puede ser un codigo: 7 cifras en base 36 cubren todas las semillas de 32 bits. */
export const MAX_CODE_LENGTH = 7;
const MAX_SEED = 0xffffffff;
const CODE_PATTERN = new RegExp(`^[0-9a-z]{1,${MAX_CODE_LENGTH}}$`);

export function codeToSeed(code: string): number | null {
  const cleaned = code.trim().toLowerCase();
  if (!CODE_PATTERN.test(cleaned)) return null;
  const seed = parseInt(cleaned, 36);
  return Number.isFinite(seed) && seed <= MAX_SEED ? seed : null;
}

export const randomSeed = (): number => Math.floor(Math.random() * MAX_SEED) >>> 0;

/** Nombre de cada tema de graficos del mapa, en el orden de los temas. */
export const THEME_NAMES = {
  es: ['Llanura', 'Desierto', 'Bosque', 'Pantano', 'Nieve'],
  en: ['Plains', 'Desert', 'Forest', 'Swamp', 'Snow'],
};

const SMALL_SIZE = 20;
const LARGE_SIZE = 40;

const isSpanish = () => settings.lang === 'es';
const percent = (value: unknown) => `${Math.round((value as number) * 100)} %`;
const onOff = (value: unknown) => (value ? (isSpanish() ? 'Sí' : 'On') : isSpanish() ? 'No' : 'Off');
const noLimit = () => (isSpanish() ? 'Sin límite' : 'None');

function sizeLabel(value: unknown): string {
  const note =
    value === SMALL_SIZE ? (isSpanish() ? ' pequeño' : ' small') : value === LARGE_SIZE ? (isSpanish() ? ' grande' : ' large') : '';
  return `${String(value)}×${String(value)}${note}`;
}

function generalLabel(value: unknown): string {
  const general = GENERALS.find((candidate) => candidate.id === value);
  if (!general) return isSpanish() ? 'Sin general' : 'No general';
  return `${general.name[settings.lang]} · ${general.title[settings.lang]}`;
}

/** Texto de cada valor de cada opcion, para la pantalla. */
const CHOICE_LABELS: Record<ChoiceKey, (value: unknown) => string> = {
  size: sizeLabel,
  theme: (value) => (value === null ? (isSpanish() ? 'Al azar' : 'Random') : THEME_NAMES[isSpanish() ? 'es' : 'en'][value as number]!),
  fog: onOff,
  weather: onOff,
  funds: (value) => fmtNum(value as number),
  income: percent,
  dayLimit: (value) => (value === null ? noLimit() : `${Number(value)} ${isSpanish() ? 'días' : 'days'}`),
  command: (value) => (value === null ? noLimit() : `${Number(value)}`),
  upkeep: (value) => (value === 0 ? (isSpanish() ? 'No' : 'Off') : percent(value)),
  general: generalLabel,
  enemyGeneral: generalLabel,
};

/** Texto de cada valor, para la pantalla. */
export function choiceLabel(key: ChoiceKey, value: unknown): string {
  return CHOICE_LABELS[key](value);
}
