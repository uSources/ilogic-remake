/**
 * Opciones de "Nueva partida": reglas, mapa y economia. Se recuerdan entre partidas.
 */
import { DEFAULT_RULES, type RulesConfig } from './core/data';
import { fmtNum, settings } from './settings';

export interface NewGameOptions {
  size: number;
  theme: number | null;
  fog: boolean;
  funds: number;
  income: number;
  dayLimit: number | null;
  /** Puntos de mando por bando (null = sin limite de puntos). */
  command: number | null;
  /** Mantenimiento por ronda, tanto por uno del precio de las unidades. */
  upkeep: number;
  /** Codigo de mapa escrito por el jugador ('' = al azar). */
  code: string;
  /** Ajuste elegido en la pantalla de nueva partida. */
  preset: PresetId;
}

export type PresetId = 'normal' | 'quick' | 'custom';
export const PRESET_IDS: PresetId[] = ['normal', 'quick', 'custom'];

/** Ajustes ya hechos (el tema del mapa no cambia: lo elige el jugador o la vista previa). */
export const PRESETS: Record<Exclude<PresetId, 'custom'>, Omit<NewGameOptions, 'theme' | 'code' | 'preset'>> = {
  normal: { size: 32, fog: true, funds: 5000, income: 1, dayLimit: null, command: 30, upkeep: 0.1 },
  quick: { size: 20, fog: true, funds: 5000, income: 1.5, dayLimit: 20, command: 20, upkeep: 0.1 },
};

export function applyPreset(o: NewGameOptions, id: PresetId): NewGameOptions {
  return id === 'custom' ? { ...o, preset: id } : { ...o, ...PRESETS[id], preset: id };
}

export const DEFAULT_OPTIONS: NewGameOptions = {
  size: 32,
  theme: null,
  fog: true,
  funds: 5000,
  income: 1,
  dayLimit: null,
  command: 30,
  upkeep: 0.1,
  code: '',
  preset: 'normal',
};

/** Valores posibles de cada opcion (en orden). */
export const CHOICES = {
  size: [20, 32, 40] as const,
  theme: [null, 0, 1, 2, 3, 4] as const,
  fog: [true, false] as const,
  funds: [3000, 5000, 8000, 12000] as const,
  income: [0.5, 1, 1.5, 2] as const,
  dayLimit: [null, 20, 30, 40, 60] as const,
  command: [null, 20, 30, 40] as const,
  upkeep: [0, 0.05, 0.1, 0.15] as const,
};
export type ChoiceKey = keyof typeof CHOICES;

const KEY = 'ilogic.newgame';

export function loadOptions(): NewGameOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NewGameOptions> | null;
    if (!raw) return { ...DEFAULT_OPTIONS };
    const o = { ...DEFAULT_OPTIONS };
    for (const k of Object.keys(CHOICES) as ChoiceKey[]) {
      const v = raw[k];
      if ((CHOICES[k] as readonly unknown[]).includes(v)) (o as Record<string, unknown>)[k] = v;
    }
    if (PRESET_IDS.includes(raw.preset as PresetId)) o.preset = raw.preset as PresetId;
    return { ...o, code: '' };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(o: NewGameOptions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...o, code: '' }));
  } catch {
    // sin almacenamiento
  }
}

/** Reglas de la partida a partir de las opciones. */
export function rulesFor(o: NewGameOptions): RulesConfig {
  return {
    ...DEFAULT_RULES,
    fog: o.fog,
    initialFunds: o.funds,
    incomeScale: o.income,
    dayLimit: o.dayLimit,
    commandPoints: o.command,
    upkeep: o.upkeep,
  };
}

/** Codigo de mapa: la semilla en base 36, en mayusculas (p. ej. "K3F9A2"). */
export const seedToCode = (seed: number): string => (seed >>> 0).toString(36).toUpperCase();

export function codeToSeed(code: string): number | null {
  const c = code.trim().toLowerCase();
  if (!/^[0-9a-z]{1,7}$/.test(c)) return null;
  const n = parseInt(c, 36);
  return Number.isFinite(n) && n <= 0xffffffff ? n : null;
}

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

const THEME_ES = ['Llanura', 'Desierto', 'Bosque', 'Pantano', 'Nieve'];
const THEME_EN = ['Plains', 'Desert', 'Forest', 'Swamp', 'Snow'];

/** Texto de cada valor, para la pantalla. */
export function choiceLabel(k: ChoiceKey, v: unknown): string {
  const es = settings.lang === 'es';
  switch (k) {
    case 'size':
      return `${String(v)}×${String(v)}${v === 20 ? (es ? ' pequeño' : ' small') : v === 40 ? (es ? ' grande' : ' large') : ''}`;
    case 'theme':
      return v === null ? (es ? 'Al azar' : 'Random') : (es ? THEME_ES : THEME_EN)[v as number]!;
    case 'fog':
      return v ? (es ? 'Sí' : 'On') : es ? 'No' : 'Off';
    case 'funds':
      return fmtNum(v as number);
    case 'income':
      return `${Math.round((v as number) * 100)} %`;
    case 'dayLimit':
      return v === null ? (es ? 'Sin límite' : 'None') : `${Number(v)} ${es ? 'días' : 'days'}`;
    case 'command':
      return v === null ? (es ? 'Sin límite' : 'None') : `${Number(v)}`;
    case 'upkeep':
      return v === 0 ? (es ? 'No' : 'Off') : `${Math.round((v as number) * 100)} %`;
  }
}
