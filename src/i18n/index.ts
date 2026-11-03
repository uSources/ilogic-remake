/**
 * Textos de la interfaz en los dos idiomas (el original los tenia dibujados en imagenes).
 *
 * Cada tema tiene su fichero en `es/` y su traduccion con el mismo nombre en `en/`; el castellano
 * manda: una clave nueva se escribe primero en `es/<tema>.ts` y el ingles no compila hasta que la
 * tiene. Las claves no se repiten entre temas (lo comprueba `tests/i18n.test.ts`), porque `t()` las
 * busca todas en un solo diccionario.
 */
import { EN, EN_BY_FEATURE } from './en';
import { help as EN_HELP } from './en/help';
import { ES, ES_BY_FEATURE, type TextKey } from './es';
import { help as ES_HELP } from './es/help';
import type { HelpTexts } from './help';

export type { TextKey };

export const TEXTS = { es: ES, en: EN };

export const TEXTS_BY_FEATURE = { es: ES_BY_FEATURE, en: EN_BY_FEATURE };

/** La ayuda ("Cómo se juega") va aparte: no son frases sueltas sino listas y una tabla. */
export const HELP_TEXTS: Record<keyof typeof TEXTS, HelpTexts> = { es: ES_HELP, en: EN_HELP };
