/**
 * Recoge los errores del contenido con mensajes que digan donde y que esta mal. Cada parte
 * (units.ts, buildings.ts...) pide un `scope` ("unidad Tank") y comprueba sus campos con el.
 */
export interface NumOpts {
  min?: number;
  max?: number;
  int?: boolean;
}

export const isNum = (v: unknown, { min = -Infinity, max = Infinity, int = false }: NumOpts = {}): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v));

const describe = ({ min, max, int }: NumOpts): string => {
  const kind = int ? 'un entero' : 'un numero';
  if (min !== undefined && max !== undefined && max !== Infinity) return `${kind} entre ${min} y ${max}`;
  if (min !== undefined) return `${kind} >= ${min}`;
  return kind;
};

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

  fail(msg: string): void {
    this.errors.push(`${this.where}: ${msg}`);
  }

  /** Comprueba y, si falla, apunta el error. Devuelve si estaba bien. */
  expect(ok: boolean, msg: string): boolean {
    if (!ok) this.fail(msg);
    return ok;
  }

  num(field: string, v: unknown, opts: NumOpts = {}): boolean {
    return this.expect(isNum(v, opts), `${field} tiene que ser ${describe(opts)}`);
  }

  bool(field: string, v: unknown): boolean {
    return this.expect(typeof v === 'boolean', `${field} tiene que ser true o false`);
  }

  id(v: unknown): boolean {
    return this.expect(typeof v === 'string' && /^\w+$/.test(v), 'id no valido (letras, numeros y _)');
  }

  texts(field: string, v: unknown): boolean {
    const t = v as { es?: unknown; en?: unknown } | undefined;
    return this.expect(typeof t?.es === 'string' && !!t.es && typeof t?.en === 'string' && !!t.en, `falta ${field}.es o ${field}.en`);
  }

  /** `list` es una lista de nombres y todos existen en `known`. */
  refs(field: string, list: unknown, known: ReadonlySet<string>): boolean {
    if (!this.expect(Array.isArray(list), `${field} tiene que ser una lista`)) return false;
    let ok = true;
    for (const x of list as unknown[]) ok = this.known(field, x, known) && ok;
    return ok;
  }

  known(field: string, name: unknown, known: ReadonlySet<string> | readonly string[], what = ''): boolean {
    const has = known instanceof Set ? known.has(name) : (known as readonly string[]).includes(name as string);
    return this.expect(has, `${field} nombra ${what}"${String(name)}", que no existe`);
  }
}

/** Mira que no haya ids repetidos (y que sean validos). Devuelve los ids. */
export function uniqueIds(check: Checker, kind: string, items: readonly { id?: unknown }[]): Set<string> {
  const ids = new Set<string>();
  for (const [i, it] of items.entries()) {
    const s = check.scope(`${kind} ${typeof it?.id === 'string' ? it.id : `#${i}`}`);
    if (!s.id(it?.id)) continue;
    if (ids.has(it.id as string)) s.fail('id repetido');
    ids.add(it.id as string);
  }
  return ids;
}

/** Fila de prefijos de imagen de 2013 por terreno (vacio si no hay). */
export const spriteRow = (m: Record<string, string> | undefined, terrainNames: readonly string[]): string[] =>
  terrainNames.map((t) => m?.[t] ?? '');

export function checkSprites(s: Scope, m: Record<string, string> | undefined, terrainNames: readonly string[]): void {
  for (const t of Object.keys(m ?? {})) s.known('classicSprite', t, terrainNames, 'el terreno ');
}
