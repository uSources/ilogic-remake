/**
 * Catalogo de tipos de contenido (unidades, edificios, terrenos, climas, temas, generales): la lista
 * en el orden del fichero y el acceso por id. Cada tipo ya viene resuelto al cargar (campos con
 * nombre, referencias comprobadas), asi que las reglas preguntan `unitType.cost`, no columnas por
 * numero de tipo.
 */

/** Lo que tiene todo tipo de contenido: su id (el nombre interno, el que guardan las partidas). */
export interface Identified {
  readonly id: string;
}

export interface Catalog<T extends Identified> {
  /** En el orden del fichero (el que siguen los menus y el generador de mapas). */
  readonly list: readonly T[];
  readonly byId: Readonly<Record<string, T>>;
}

export function catalogOf<T extends Identified>(list: readonly T[]): Catalog<T> {
  return { list, byId: Object.fromEntries(list.map((entry) => [entry.id, entry])) };
}

/** El tipo con ese id, o undefined si el catalogo no lo tiene (para lo que viene de fuera: partidas, misiones). */
export function findEntry<T extends Identified>(catalog: Catalog<T>, id: string): T | undefined {
  return Object.hasOwn(catalog.byId, id) ? catalog.byId[id] : undefined;
}

/** El valor es el id de un tipo del catalogo (para comprobar lo que viene de fuera). */
export const isEntryId = <T extends Identified>(catalog: Catalog<T>, value: unknown): value is string =>
  typeof value === 'string' && !!findEntry(catalog, value);

/**
 * El tipo con ese id. Un id que no esta es un fallo de quien lo pide (el contenido y las partidas
 * se comprueban al cargarlas): lanza un error que lo dice.
 */
export function entryOf<T extends Identified>(catalog: Catalog<T>, id: string, what: string): T {
  const entry = findEntry(catalog, id);
  if (!entry) throw new Error(`${what} "${id}" no existe en el contenido de la partida`);
  return entry;
}
