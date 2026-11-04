/**
 * Valores que no se cambian: el tipo (`DeepReadonly`) y en marcha (`deepFreeze`). Lo usa el contenido
 * del juego: nadie lo puede cambiar sin querer (ni una variante de la herramienta de equilibrio, que
 * construye otro contenido) y lo que se calcula a partir de el no se queda viejo. Escribir en algo
 * congelado no compila y, si se fuerza, lanza un error (el nucleo va en modo estricto).
 */

/** `T` con todo lo de dentro `readonly`, a cualquier profundidad. */
export type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;

/** Congela un valor y todo lo que lleva dentro (Object.freeze solo congela el primer nivel). */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Una copia que se puede cambiar de algo congelado (structuredClone no copia la congelacion). */
export function mutableCopy<T>(value: DeepReadonly<T>): T {
  return structuredClone(value) as T;
}
