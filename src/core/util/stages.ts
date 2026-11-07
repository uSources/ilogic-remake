/**
 * Juntar dos listas de pasos que van por momentos (el fin de ronda, el ataque): lo de siempre y lo
 * de los modulos, en el orden de los momentos.
 */

/**
 * Lo de siempre (`always`) y lo de los modulos (`fromModules`) juntos por momento: primero los del
 * primer momento de `stages`, etc.; en cada uno, los de siempre y luego los de los modulos, en su
 * orden (sort es estable). Un paso con un momento que no esta en `stages` es un fallo de quien lo
 * declara: da error en vez de colocarse el primero.
 */
export function inStageOrder<Stage, Entry extends { readonly id: string; readonly stage: Stage }>(
  stages: readonly Stage[],
  always: readonly Entry[],
  fromModules: readonly Entry[],
): Entry[] {
  const entries = [...always, ...fromModules];
  const unknown = entries.find((entry) => !stages.includes(entry.stage));
  if (unknown) throw new Error(`El paso "${unknown.id}" tiene un momento que no existe: ${String(unknown.stage)}`);
  const order = (entry: Entry) => stages.indexOf(entry.stage);
  return entries.sort((first, second) => order(first) - order(second));
}
