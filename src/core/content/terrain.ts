/** Terreno (terrain.json): validacion y tablas (TERRAIN, CAN_WALK, MOVE_COST, HIDING_TERRAIN). */
import { type Checker } from './check';
import { MOVEMENTS, type TerrainDef } from './types';

export function validateTerrain(terrain: readonly TerrainDef[], terrainNames: readonly string[], check: Checker): void {
  check
    .scope('terrain.json')
    .expect(
      terrain.map((t) => t?.id).join() === terrainNames.join(),
      `tienen que estar los ${terrainNames.length} terrenos en este orden: ${terrainNames.join(', ')}`,
    );
  for (const t of terrain) {
    const s = check.scope(`terreno ${t?.id}`);
    s.texts('name', t?.name);
    s.num('protection', t?.protection, { min: 0.05, max: 1 });
    for (const f of ['hides', 'buildable', 'water'] as const) s.bool(f, t?.[f]);
    for (const m of MOVEMENTS) {
      const c = t?.movement?.[m];
      s.expect(
        c === null || (Number.isInteger(c) && c >= 1 && c <= 9),
        `movement.${m} tiene que ser un coste de 1 a 9 o null (no se pasa)`,
      );
    }
    s.expect(
      Object.keys(t?.movement ?? {}).every((k) => MOVEMENTS.includes(k as never)),
      `movement solo admite ${MOVEMENTS.join(', ')}`,
    );
    s.expect(t?.movement?.air !== null, 'los aereos tienen que poder pasar por todo (movement.air)');
  }
}

export function buildTerrainTables(terrain: readonly TerrainDef[]) {
  const byMove = <T>(f: (m: (typeof MOVEMENTS)[number]) => T): T[] => MOVEMENTS.map(f);
  return {
    TERRAIN: {
      canbuild: terrain.map((t) => t.buildable),
      iswater: terrain.map((t) => t.water),
      protection: terrain.map((t) => t.protection),
    },
    /** [MoveType][terreno]: se puede pasar. */
    CAN_WALK: byMove((m) => terrain.map((t) => t.movement[m] !== null)),
    /** [MoveType][terreno]: coste de entrar (las que no se pueden pasar cuentan 1, como siempre). */
    MOVE_COST: byMove((m) => terrain.map((t) => t.movement[m] ?? 1)),
    HIDING_TERRAIN: terrain.flatMap((t, i) => (t.hides ? [i] : [])),
  };
}
