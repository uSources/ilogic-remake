/**
 * Tipos de movimiento (movements.json): por donde se mueve una unidad. Cada terreno dice lo que le
 * cuesta a cada uno (terrain.json, "movement"), cada clima cuanto le quita (weather.json, "move") y
 * cada unidad cual es el suyo (units.json, "movement"). Un tipo nuevo es su entrada aqui y su coste
 * en cada terreno: el codigo no los nombra (lo que necesita saber de uno es un campo).
 */
import type { Checker } from './check';
import type { Texts } from './types';

/** Como se ve al moverse y al disparar (lo dibuja la escena): a pie, rodando o volando. */
export type MovementMotion = 'march' | 'drive' | 'fly';
const MOTIONS: readonly MovementMotion[] = ['march', 'drive', 'fly'];

/** Un tipo de movimiento tal como esta en movements.json. */
export interface MovementDef {
  id: string;
  name: Texts;
  motion: MovementMotion;
  /** Pasa por todos los terrenos (los aviones): cada terreno tiene que tener un coste para el. */
  crossesEverything?: boolean;
}

/** Un tipo de movimiento resuelto al cargar el contenido. */
export interface MovementType {
  readonly id: string;
  readonly name: Texts;
  readonly motion: MovementMotion;
  readonly crossesEverything: boolean;
}

/** Comprueba movements.json: al menos uno, cada uno con su nombre (que los ids no se repitan lo mira uniqueIds). */
export function validateMovements(list: readonly MovementDef[], check: Checker): void {
  if (
    !check.scope('movements.json').expect(Array.isArray(list) && list.length > 0, 'tiene que tener una lista "movements" con al menos uno')
  )
    return;
  for (const movement of list) {
    const scope = check.scope(`movimiento ${movement?.id}`);
    scope.texts('name', movement?.name);
    scope.known('motion', movement?.motion, MOTIONS, 'el movimiento ');
    if (movement?.crossesEverything !== undefined) scope.bool('crossesEverything', movement.crossesEverything);
  }
}

export const buildMovementTypes = (list: readonly MovementDef[]): MovementType[] =>
  list.map((movement) => ({
    id: movement.id,
    name: movement.name,
    motion: movement.motion,
    crossesEverything: movement.crossesEverything ?? false,
  }));
