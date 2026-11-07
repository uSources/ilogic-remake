/**
 * Envolturas de solo lectura hasta el fondo (`readOnly`): lo que se lee de ellas tambien lo es, y no
 * se puede cambiar nada ni por la puerta de atras (definir propiedades, cambiar el prototipo, pedir el
 * descriptor, `__proto__`). Las usa la vista de un equipo (playerView.ts), que es lo que quien decide
 * recibe de la partida.
 */

/** Lo que se le dice a quien intenta cambiar algo de solo lectura (lo que mas se protege asi es la vista de un equipo). */
const READ_ONLY = 'La vista de un equipo no se cambia: quien decide propone acciones';

const refuseChange = (): never => {
  throw new Error(READ_ONLY);
};

/** Un objeto de la partida que hay que proteger: los datos (objetos planos y listas) que no esten ya congelados. */
const needsGuard = (value: unknown): value is object =>
  typeof value === 'object' &&
  value !== null &&
  !Object.isFrozen(value) &&
  (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);

/**
 * Lo que no deja hacer ninguna envoltura de la vista: cambiar algo, ni por la puerta de atras
 * (definir una propiedad, cambiar el prototipo, cerrar el objeto para que no crezca).
 */
export const REFUSED_CHANGES = {
  set: refuseChange,
  deleteProperty: refuseChange,
  defineProperty: refuseChange,
  setPrototypeOf: refuseChange,
  preventExtensions: refuseChange,
} as const;

/**
 * El descriptor de una propiedad con su valor como se lee por la envoltura (`shown`): pedir el
 * descriptor (`Object.getOwnPropertyDescriptor`) da lo mismo que leerla, nunca el objeto de verdad.
 * Una propiedad que no se puede ni reconfigurar ni escribir se tiene que dar tal cual (lo exige
 * Proxy); en la partida no hay ninguna con algo que proteger.
 */
export function shownDescriptor(
  descriptor: PropertyDescriptor | undefined,
  shown: (value: unknown) => unknown,
): PropertyDescriptor | undefined {
  if (!descriptor || !('value' in descriptor) || (!descriptor.configurable && !descriptor.writable)) return descriptor;
  return { ...descriptor, value: shown(descriptor.value) };
}

/**
 * Lo que no se da desde la vista aunque se pida por su nombre: `__proto__` y `constructor` llevarian
 * al prototipo de verdad (`Object.prototype`, compartido por todo el programa), que se podria cambiar.
 * Leerlos da undefined (las listas, sin `constructor`, siguen haciendo listas normales con map o filter).
 */
export const UNSHOWN_KEYS: ReadonlySet<string | symbol> = new Set(['__proto__', 'constructor']);

/**
 * La envoltura de solo lectura de un objeto de la partida: lo que se lee pasa por `guard` (de solo
 * lectura tambien, si es un objeto), cambiar no se puede y lo de UNSHOWN_KEYS no se da.
 */
export function readOnlyHandler(guard: (value: unknown) => unknown): ProxyHandler<object> {
  return {
    get: (target, key): unknown => {
      const property: unknown = Reflect.get(target, key);
      // Lo que no es un objeto (numeros, textos) se da tal cual, sin mas: es lo que mas se lee. Lo de
      // UNSHOWN_KEYS es un objeto (`__proto__`) o una funcion (`constructor`): solo ahi se mira.
      if (typeof property === 'object') return UNSHOWN_KEYS.has(key) ? undefined : guard(property);
      return typeof property === 'function' && UNSHOWN_KEYS.has(key) ? undefined : property;
    },
    getOwnPropertyDescriptor: (target, key) => shownDescriptor(Reflect.getOwnPropertyDescriptor(target, key), guard),
    ...REFUSED_CHANGES,
  };
}

/**
 * Lo mismo que `value`, pero de solo lectura hasta el fondo: lo que se lee de ella tambien lo es.
 * Cada objeto tiene siempre la misma envoltura (`guards`), asi que comparar dos unidades de la vista
 * sigue dando lo que debe.
 */
export function readOnly<T>(value: T, guards: WeakMap<object, object>): T {
  if (!needsGuard(value)) return value;
  const known = guards.get(value);
  if (known) return known as T;
  const guarded: object = new Proxy(
    value,
    readOnlyHandler((property) => readOnly(property, guards)),
  );
  guards.set(value, guarded);
  return guarded as T;
}
