/** Terreno (terrain.json): validacion y su tipo resuelto (`TerrainType`). */
import { type Checker } from './check';
import { MOVEMENTS, type MoveType, type TerrainDef, type Texts } from './types';

/** Coste de movimiento admitido en un terreno (null = no se pasa). */
const MAX_MOVE_COST = 9;

export function validateTerrain(terrain: readonly TerrainDef[], check: Checker): void {
  check.scope('terrain.json').expect(terrain.length > 0, 'tiene que haber al menos un terreno (el primero es el suelo llano)');
  const letters = new Set<string>();
  for (const t of terrain) {
    const s = check.scope(`terreno ${t?.id}`);
    s.texts('name', t?.name);
    s.num('protection', t?.protection, { min: 0.05, max: 1 });
    for (const f of ['hides', 'buildable', 'water'] as const) s.bool(f, t?.[f]);
    for (const m of MOVEMENTS) {
      const c = t?.movement?.[m];
      s.expect(
        c === null || (Number.isInteger(c) && c >= 1 && c <= MAX_MOVE_COST),
        `movement.${m} tiene que ser un coste de 1 a ${MAX_MOVE_COST} o null (no se pasa)`,
      );
    }
    s.expect(
      Object.keys(t?.movement ?? {}).every((k) => MOVEMENTS.includes(k as MoveType)),
      `movement solo admite ${MOVEMENTS.join(', ')}`,
    );
    s.expect(t?.movement?.air !== null, 'los aereos tienen que poder pasar por todo (movement.air)');
    if (t?.mapLetter === undefined) continue;
    s.expect(typeof t.mapLetter === 'string' && t.mapLetter.length === 1, 'mapLetter tiene que ser una sola letra');
    s.expect(!letters.has(t.mapLetter), `la letra "${t.mapLetter}" ya es de otro terreno`);
    letters.add(t.mapLetter);
  }
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
  /** Coste de entrar por tipo de movimiento; null = no se puede pasar. */
  readonly moveCost: Readonly<Record<MoveType, number | null>>;
  /** Letra en los mapas en texto que no depende del tema (null si solo la da un tema). */
  readonly mapLetter: string | null;
}

export function buildTerrainTypes(terrain: readonly TerrainDef[]): TerrainType[] {
  return terrain.map((definition) => ({
    id: definition.id,
    name: definition.name,
    protection: definition.protection,
    hides: definition.hides,
    buildable: definition.buildable,
    isWater: definition.water,
    moveCost: { ...definition.movement },
    mapLetter: definition.mapLetter ?? null,
  }));
}
