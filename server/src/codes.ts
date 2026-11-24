/**
 * Lo que el servidor genera con azar: el codigo de una sala (lo que se escribe o se dicta; su forma,
 * `isRoomCode`, es del nucleo, para que la pantalla la compruebe igual), la semilla del mapa de una
 * sala de la busqueda de rival y las fichas de los asientos
 * (`RoomContext.newToken`: el nucleo no tira de ningun azar). Todo sale de `crypto.getRandomValues`,
 * nunca de `Math.random`. Y como se compara una ficha sin que el tiempo diga en que letra deja de
 * coincidir (`sameToken`).
 */
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@core/net';

function randomBytes(count: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(count));
}

/**
 * Un codigo de sala al azar. Cada byte elige una letra: los que se pasan del alfabeto se descartan
 * (en vez del resto de dividir, que cargaria las primeras letras).
 */
export function newRoomCode(): string {
  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    for (const byte of randomBytes(ROOM_CODE_LENGTH * 2)) {
      if (code.length === ROOM_CODE_LENGTH) break;
      if (byte < ROOM_CODE_ALPHABET.length) code += ROOM_CODE_ALPHABET[byte];
    }
  }
  return code;
}

/** Bytes de una semilla de mapa: 32 bits, como el codigo de mapa de la pantalla. */
const SEED_BYTES = 4;

/** Una semilla de mapa al azar (la de una sala de la busqueda de rival: el mapa no lo elige nadie). */
export function newSeed(): number {
  return randomBytes(SEED_BYTES).reduce((seed, byte) => seed * 256 + byte, 0);
}

/** Una ficha de `bytes` bytes de azar, en base64 para URL (sin relleno: va en un enlace). */
export function newToken(bytes: number): string {
  const binary = String.fromCharCode(...randomBytes(bytes));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Las dos fichas son la misma, en tiempo constante: se recorren las dos enteras y se juntan las
 * diferencias, para que lo que tarda no diga hasta donde coinciden.
 */
export function sameToken(given: string, stored: string): boolean {
  const length = Math.max(given.length, stored.length);
  let difference = given.length ^ stored.length;
  for (let i = 0; i < length; i++) difference |= (given.charCodeAt(i) || 0) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
