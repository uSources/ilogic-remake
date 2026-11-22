/**
 * El azar de lo que solo se ve y no cuenta para la partida (humo, polvo, luciernagas, los saltos de las
 * ranas): aqui vale `Math.random`, porque no tiene que salir igual cada vez. El de las reglas y la IA
 * va con la partida (core/util/random.ts).
 */

/** Dos numeros, de menos a mas: entre ellos sale lo que va al azar (lo que vive una mota, su altura...). */
export type Range = readonly [low: number, high: number];

/** Un numero al azar entre los dos de `range`. */
export const randomBetween = ([low, high]: Range): number => low + Math.random() * (high - low);

/** El numero de `range` que esta a `share` (0 a 1) del primero al segundo. */
export const pointIn = ([low, high]: Range, share: number): number => low + share * (high - low);
