/** La carpeta de los efectos del juego (public/assets/sfx). */
export const SFX_FOLDER: string;

/** Cuantas variantes seguidas tiene cada efecto en public/assets/sfx, por su id. */
export function variantCounts(): Map<string, number>;

/** Reescribe src/audio/soundList.ts con lo que hay en public/assets/sfx. */
export function writeSoundList(): void;
