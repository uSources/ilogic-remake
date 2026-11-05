import type { GameContent } from '@core/content';

/** Nombre en español de un tipo de unidad del contenido con el que se ha jugado (el de la variante). */
export const unitLabelEs = (content: GameContent, type: number): string => content.files.units[type]?.name.es ?? String(type);
