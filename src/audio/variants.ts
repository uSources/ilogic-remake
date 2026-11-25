/**
 * Que variante suena de un efecto (sus WAV `<id>_<n>.wav`, soundList.ts). Puro, para probarlo sin
 * navegador; lo usa sfx.ts.
 */

/**
 * Una variante al azar de las `count` de un efecto (de 1 a `count`), pero no la de la ultima vez (`last`;
 * 0 si aun no ha sonado): dos seguidas iguales delatan que es el mismo sonido. `roll` es el azar, de 0 a 1.
 */
export function nextVariant(count: number, last: number, roll: number): number {
  const avoidsLast = count > 1 && last >= 1 && last <= count;
  const choices = avoidsLast ? count - 1 : count;
  const drawn = 1 + Math.floor(roll * choices);
  return avoidsLast && drawn >= last ? drawn + 1 : drawn;
}
