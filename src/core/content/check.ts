/**
 * Recoge los errores del contenido con mensajes que digan donde y que esta mal. Cada parte
 * (units.ts, buildings.ts...) pide un `scope` ("unidad Tank") y comprueba sus campos con el.
 */
export interface NumberLimits {
  min?: number;
  max?: number;
  /** Tiene que ser un entero. */
  int?: boolean;
}

/** El valor es un numero (finito) dentro de los limites. */
export const isNumberWithin = (value: unknown, { min = -Infinity, max = Infinity, int = false }: NumberLimits = {}): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!int || Number.isInteger(value));

/** Lo que se pide de un numero, para el mensaje de error ("un entero entre 0 y 100"). */
const describeLimits = ({ min, max, int }: NumberLimits): string => {
  const kind = int ? 'un entero' : 'un numero';
  if (min !== undefined && max !== undefined && max !== Infinity) return `${kind} entre ${min} y ${max}`;
  if (min !== undefined) return `${kind} >= ${min}`;
  return kind;
};

/** Textos de pantalla en los dos idiomas, sin comprobar. */
type MaybeTexts = { es?: unknown; en?: unknown } | undefined;

export class Checker {
  readonly errors: string[] = [];

  scope(where: string): Scope {
    return new Scope(where, this.errors);
  }
}

export class Scope {
  constructor(
    readonly where: string,
    private readonly errors: string[],
  ) {}

  fail(message: string): void {
    this.errors.push(`${this.where}: ${message}`);
  }

  /** Comprueba y, si falla, apunta el error. Devuelve si estaba bien. */
  expect(isFine: boolean, message: string): boolean {
    if (!isFine) this.fail(message);
    return isFine;
  }

  num(field: string, value: unknown, limits: NumberLimits = {}): boolean {
    return this.expect(isNumberWithin(value, limits), `${field} tiene que ser ${describeLimits(limits)}`);
  }

  bool(field: string, value: unknown): boolean {
    return this.expect(typeof value === 'boolean', `${field} tiene que ser true o false`);
  }

  id(value: unknown): boolean {
    return this.expect(typeof value === 'string' && /^\w+$/.test(value), 'id no valido (letras, numeros y _)');
  }

  texts(field: string, value: unknown): boolean {
    const texts = value as MaybeTexts;
    const hasBoth = typeof texts?.es === 'string' && !!texts.es && typeof texts?.en === 'string' && !!texts.en;
    return this.expect(hasBoth, `falta ${field}.es o ${field}.en`);
  }

  /** `list` es una lista de nombres y todos existen en `known`. */
  refs(field: string, list: unknown, known: ReadonlySet<string>): boolean {
    if (!this.expect(Array.isArray(list), `${field} tiene que ser una lista`)) return false;
    let allKnown = true;
    for (const name of list as unknown[]) allKnown = this.known(field, name, known) && allKnown;
    return allKnown;
  }

  known(field: string, name: unknown, known: ReadonlySet<string> | readonly string[], what = ''): boolean {
    const isKnown = known instanceof Set ? known.has(name) : (known as readonly string[]).includes(name as string);
    return this.expect(isKnown, `${field} nombra ${what}"${String(name)}", que no existe`);
  }
}

/** Mira que no haya ids repetidos (y que sean validos). Devuelve los ids. */
export function uniqueIds(check: Checker, kind: string, items: readonly { id?: unknown }[]): Set<string> {
  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    const scope = check.scope(`${kind} ${typeof item?.id === 'string' ? item.id : `#${index}`}`);
    if (!scope.id(item?.id)) continue;
    if (ids.has(item.id as string)) scope.fail('id repetido');
    ids.add(item.id as string);
  }
  return ids;
}

/** Los dibujos del juego de 2013 por terreno (`classicSprite`): solo de terrenos que existen. */
export function checkSprites(scope: Scope, spritesByTerrain: Record<string, string> | undefined, terrainIds: ReadonlySet<string>): void {
  for (const terrain of Object.keys(spritesByTerrain ?? {})) scope.known('classicSprite', terrain, terrainIds, 'el terreno ');
}
