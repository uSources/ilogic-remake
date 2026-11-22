/**
 * El azar de lo que solo se ve y no cuenta para la partida (humo, polvo, luciernagas, los saltos de las
 * ranas): aqui vale `Math.random`, porque no tiene que salir igual cada vez. El de las reglas y la IA
 * va con la partida (core/util/random.ts).
 */

/** Un numero al azar entre los dos de `range`. */
export const randomBetween = ([low, high]: readonly [number, number]): number => low + Math.random() * (high - low);
