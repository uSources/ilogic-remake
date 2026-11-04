/**
 * Congela un valor y todo lo que lleva dentro (Object.freeze solo congela el primer nivel). Lo usa el
 * contenido del juego: nadie lo puede cambiar sin querer (ni una variante de la herramienta de
 * equilibrio, que construye otro contenido) y lo que se calcula a partir de el no se queda viejo.
 * Escribir en algo congelado lanza un error (el nucleo va en modo estricto). Los tipos de las tablas
 * ya son `readonly` donde importa (data.ts); aqui se devuelve el mismo tipo para no arrastrar
 * `readonly` por cada definicion del contenido.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}
