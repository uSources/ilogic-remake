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
  const host = {};
  for (const [name, member] of Object.entries(spec as Record<string, unknown>)) {
    if (typeof member === 'function') Object.defineProperty(host, name, { value: member, enumerable: true });
    else {
      const field = member as { get: () => unknown; set?: (value: unknown) => void };
      Object.defineProperty(host, name, { get: field.get, set: field.set, enumerable: true });
    }
  }
  return host as T;
}

/** Un campo que el modulo lee y cambia: `phase: rw(() => this.phase, (v) => (this.phase = v))`. */
export function rw<T>(get: () => T, set: (value: T) => void): { get: () => T; set: (value: T) => void } {
  return { get, set };
}
