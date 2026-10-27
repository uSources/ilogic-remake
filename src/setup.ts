/**
 * Opciones de "Nueva partida": reglas, mapa y economia. Se recuerdan entre partidas.
 */
import { CLASSIC_RULES, MODERN_RULES, type RulesConfig } from './core/data';
import { settings } from './settings';

export interface NewGameOptions {
  rules: 'modern' | 'classic';
  size: number;
  theme: number | null;
  fog: boolean;
  funds: number;
  income: number;
  dayLimit: number | null;
  /** Codigo de mapa escrito por el jugador ('' = al azar). */
  code: string;
}

export const DEFAULT_OPTIONS: NewGameOptions = { rules: 'modern', size: 32, theme: null, fog: true, funds: 5000, income: 1, dayLimit: null, code: '' };

/** Valores posibles de cada opcion (en orden). */
export const CHOICES = {
  rules: ['modern', 'classic'] as const,
  size: [20, 32, 40] as const,
  theme: [null, 0, 1, 2, 3, 4] as const,
  fog: [true, false] as const,
  funds: [3000, 5000, 8000, 12000] as const,
  income: [0.5, 1, 1.5, 2] as const,
  dayLimit: [null, 20, 30, 40, 60] as const,
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
  const base = o.rules === 'classic' ? CLASSIC_RULES : MODERN_RULES;
  return { ...base, fog: o.fog, initialFunds: o.funds, incomeScale: o.income, dayLimit: o.dayLimit };
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
    case 'rules':
      return v === 'modern' ? (es ? 'Nuevas' : 'New') : es ? 'Clásicas (2013)' : 'Classic (2013)';
    case 'size':
      return `${v}×${v}${v === 20 ? (es ? ' pequeño' : ' small') : v === 40 ? (es ? ' grande' : ' large') : ''}`;
    case 'theme':
      return v === null ? (es ? 'Al azar' : 'Random') : (es ? THEME_ES : THEME_EN)[v as number]!;
    case 'fog':
      return v ? (es ? 'Sí' : 'On') : es ? 'No' : 'Off';
    case 'funds':
      return (v as number).toLocaleString(es ? 'es-ES' : 'en-US');
    case 'income':
      return `${Math.round((v as number) * 100)} %`;
    case 'dayLimit':
      return v === null ? (es ? 'Sin límite' : 'None') : `${v} ${es ? 'días' : 'days'}`;
  }
}
