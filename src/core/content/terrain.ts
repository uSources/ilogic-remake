/** Terreno (terrain.json): validacion y su tipo resuelto (`TerrainType`). */
import { uniqueLetter, type Checker, type Scope } from './check';
import type { MovementDef } from './movements';
import type { MoveType, TerrainDef, Texts } from './types';

/** Coste de movimiento admitido en un terreno (null = no se pasa). */
const MAX_MOVE_COST = 9;

export function validateTerrain(terrain: readonly TerrainDef[], movements: readonly MovementDef[], check: Checker): void {
  const top = check.scope('terrain.json');
  top.expect(
    terrain.filter((type) => type?.plain).length === 1,
    'tiene que haber exactamente un terreno con "plain": true (el suelo llano)',
  );
  const letters = new Set<string>();
  const textLetters = new Set<string>();
  for (const type of terrain) {
    const scope = check.scope(`terreno ${type?.id}`);
    scope.texts('name', type?.name);
    scope.num('protection', type?.protection, { min: 0.05, max: 1 });
    for (const field of ['hides', 'buildable', 'water'] as const) scope.bool(field, type?.[field]);
    if (type?.plain !== undefined) scope.bool('plain', type.plain);
    validateMovement(scope, type?.movement, movements);
    uniqueLetter(scope, 'textLetter', type?.textLetter, textLetters);
    if (type?.mapLetter === undefined) continue;
    scope.expect(typeof type.mapLetter === 'string' && type.mapLetter.length === 1, 'mapLetter tiene que ser una sola letra');
    scope.expect(!letters.has(type.mapLetter), `la letra "${type.mapLetter}" ya es de otro terreno`);
    letters.add(type.mapLetter);
  }
}

/**
 * El coste de entrar de cada tipo de movimiento de movements.json (null = no se pasa; los que pasan
 * por todo, `crossesEverything`, tienen que tener un coste).
 */
function validateMovement(scope: Scope, movement: TerrainDef['movement'] | undefined, movements: readonly MovementDef[]): void {
  const ids = movements.map((type) => type.id);
  for (const moveType of movements) {
    const cost = movement?.[moveType.id];
    scope.expect(
      cost === null || (typeof cost === 'number' && Number.isInteger(cost) && cost >= 1 && cost <= MAX_MOVE_COST),
      `movement.${moveType.id} tiene que ser un coste de 1 a ${MAX_MOVE_COST} o null (no se pasa)`,
    );
    if (moveType.crossesEverything) scope.expect(cost !== null, `movement.${moveType.id} pasa por todo: tiene que tener un coste`);
  }
  scope.expect(
    Object.keys(movement ?? {}).every((key) => ids.includes(key)),
    `movement solo admite ${ids.join(', ')} (movements.json)`,
  );
}

/** Un terreno, resuelto al cargar el contenido (terrain.json). */
export interface TerrainType {
  readonly id: string;
  readonly name: Texts;
  /** Multiplica el acierto contra quien esta encima. */
  readonly protection: number;
  /** Esconde a quien esta dentro (con niebla y la regla forestHides). */
  readonly hides: boolean;
  /** Se puede poner un edificio (generador de mapas, misiones). */
  readonly buildable: boolean;
  readonly isWater: boolean;
  /** Es el suelo llano (GameContent.plainTerrain). */
  readonly isPlain: boolean;
  /** Coste de entrar por tipo de movimiento; null = no se puede pasar. */
  readonly moveCost: Readonly<Record<MoveType, number | null>>;
  /** Letra en los mapas en texto que no depende del tema (null si solo la da un tema). */
  readonly mapLetter: string | null;
  /** Letra en el mapa de la partida por texto. */
  readonly textLetter: string;
}

export function buildTerrainTypes(terrain: readonly TerrainDef[]): TerrainType[] {
  return terrain.map((definition) => ({
    id: definition.id,
    name: definition.name,
    protection: definition.protection,
    hides: definition.hides,
    buildable: definition.buildable,
    isWater: definition.water,
    isPlain: !!definition.plain,
    moveCost: { ...definition.movement },
    mapLetter: definition.mapLetter ?? null,
    textLetter: definition.textLetter,
  }));
}
