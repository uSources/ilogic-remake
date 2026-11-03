/**
 * Puente de la escena a sus modulos. Cada modulo de src/scenes/game declara lo poco que necesita de la
 * escena (una interfaz `...Host`) y GameScene se lo da con `live`: los campos se leen (y, si se puede,
 * se escriben) en la escena cada vez, asi el modulo ve siempre la partida, la fase... del momento.
 */

/** Como se da cada miembro: las funciones tal cual; los campos, con `get` (y `set` si el modulo los cambia). */
export type Live<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? T[K] : { get: () => T[K]; set?: (v: T[K]) => void };
};

export function live<T extends object>(spec: Live<T>): T {
  const o = {};
  for (const [k, v] of Object.entries(spec as Record<string, unknown>)) {
    if (typeof v === 'function') Object.defineProperty(o, k, { value: v, enumerable: true });
    else {
      const a = v as { get: () => unknown; set?: (x: unknown) => void };
      Object.defineProperty(o, k, { get: a.get, set: a.set, enumerable: true });
    }
  }
  return o as T;
}
