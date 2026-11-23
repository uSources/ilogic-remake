/**
 * El codigo de una sala: lo que se escribe o se dicta para unirse (letras y cifras que no se
 * confunden). Lo genera el servidor con azar (`newRoomCode`, server/src/codes.ts); aqui solo su
 * forma, para que el servidor y la pantalla lo comprueben con la misma regla (la pantalla no
 * pregunta al servidor por algo que no puede ser un codigo).
 */

/** Sin 0, O, 1, I ni L: un codigo se lee en voz alta o a mano sin dudar (31 signos: 31^6, casi 900 millones de codigos). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Un codigo de sala bien formado (en mayusculas, del alfabeto de arriba). */
export const isRoomCode = (value: unknown): value is string => typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
