/** Unidades (units.json): validacion y tablas por indice (UNIT, POWER, SPAWNER...). */
import { type Checker, checkSprites, spriteRow } from './check';
import { MOVEMENTS, type ContentContext, type MoveType, type UnitDef } from './types';

const LINKS_TO_BUILDINGS = ['builtAt', 'repairedAt'] as const;

export function validateUnits(units: readonly UnitDef[], ctx: ContentContext, check: Checker): void {
  for (const u of units) {
    const s = check.scope(`unidad ${u?.id}`);
    s.texts('name', u?.name);
    s.num('cost', u?.cost, { min: 1, int: true });
    s.num('command', u?.command, { min: 1, max: 20, int: true });
    s.num('move', u?.move, { min: 0, max: 30, int: true });
    s.num('vision', u?.vision, { min: 0, max: 30, int: true });
    s.expect(MOVEMENTS.includes(u?.movement), `movement tiene que ser ${MOVEMENTS.join(', ')}`);
    s.bool('captures', u?.captures);
    if (u?.attack !== null) {
      const a = u?.attack;
      const r = a?.range;
      if (s.expect(Array.isArray(r) && r.length === 2, 'attack.range tiene que ser [desde, hasta] (o attack: null si no ataca)'))
        s.expect(Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 1 && r[1] >= r[0], 'attack.range: 1 <= desde <= hasta');
      for (const [t, p] of Object.entries(a?.hitChance ?? {})) {
        s.known('attack.hitChance', t, ctx.unitIds);
        s.num(`attack.hitChance.${t}`, p, { min: 0, max: 1 });
      }
      s.expect(
        Object.values(a?.hitChance ?? {}).some((p) => p > 0),
        'ataca pero no puede acertar a nadie (attack.hitChance)',
      );
    }
    if (u?.transport) {
      s.num('transport.slots', u.transport.slots, { min: 1, max: 9, int: true });
      s.refs('transport.carries', u.transport.carries, ctx.unitIds);
    }
    for (const f of LINKS_TO_BUILDINGS) s.refs(f, u?.[f], ctx.buildingIds);
    if (Array.isArray(u?.builtAt)) s.expect(u.builtAt.length > 0, 'builtAt vacio: nadie la puede comprar');
    for (const [t, h] of Object.entries(u?.heals ?? {})) {
      s.known('heals', t, ctx.unitIds);
      s.num(`heals.${t}`, h, { min: 0, max: 100, int: true });
    }
    if (u?.art !== undefined && s.known('art', u.art, ctx.unitIds)) s.expect(u.art !== u.id, 'art no puede ser ella misma');
    checkSprites(s, u?.classicSprite, ctx.terrainNames);
  }
}

export function buildUnitTables(units: readonly UnitDef[], ctx: ContentContext, buildingNames: readonly string[]) {
  const ids = units.map((u) => u.id);
  const byUnit = <T>(f: (u: UnitDef) => T): T[] => units.map(f);
  const unitRow = (list: readonly string[] | undefined) => ids.map((id) => !!list?.includes(id));
  const buildingRow = (list: readonly string[]) => buildingNames.map((id) => list.includes(id));
  return {
    UNIT_NAMES: ids,
    UNIT: {
      cost: byUnit((u) => u.cost),
      command: byUnit((u) => u.command),
      mover: byUnit((u) => u.move),
      vision: byUnit((u) => u.vision),
      alcance: byUnit((u) => u.attack?.range[1] ?? 0),
      minalc: byUnit((u) => (u.attack ? u.attack.range[0] - 1 : 0)),
      movtype: byUnit((u) => MOVEMENTS.indexOf(u.movement) as MoveType),
      maxcarry: byUnit((u) => u.transport?.slots ?? 0),
      cancapt: byUnit((u) => u.captures),
      canfight: byUnit((u) => u.attack !== null),
    },
    HEALER: byUnit((u) => buildingRow(u.repairedAt)),
    SPAWNER: byUnit((u) => buildingRow(u.builtAt)),
    CAN_CARRY: byUnit((u) => unitRow(u.transport?.carries)),
    POWER: byUnit((u) => ids.map((id) => u.attack?.hitChance[id] ?? 0)),
    UNIT_HEALS: byUnit((u) => ids.map((id) => u.heals?.[id] ?? 0)),
    UNIT_TERRAIN_PREFIX: byUnit((u) => spriteRow(u.classicSprite, ctx.terrainNames)),
    UNIT_SUPPORT: byUnit((u) => !!u.ai?.support),
    /** Nombre de las imagenes de cada unidad (el suyo, o el de `art` mientras no tenga dibujo). */
    UNIT_ART: byUnit((u) => u.art ?? u.id),
  };
}
