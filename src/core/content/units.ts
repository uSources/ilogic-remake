/** Unidades (units.json): validacion y su tipo resuelto (`UnitType`). */
import type { DeepReadonly } from '../util/freeze';
import { type Checker, type Scope, checkSprites } from './check';
import { ABILITY_KINDS, MOVEMENTS, type AbilityDef, type ContentContext, type MoveType, type Texts, type UnitDef } from './types';

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
    checkSprites(s, u?.classicSprite, ctx.terrainIds);
    if (u?.abilities !== undefined) validateAbilities(s, u.abilities, u);
  }
}

function validateAbilities(s: Scope, list: unknown, u: UnitDef): void {
  if (!s.expect(Array.isArray(list), 'abilities tiene que ser una lista')) return;
  const seen = new Set<string>();
  for (const [i, a] of (list as AbilityDef[]).entries()) {
    const f = `abilities[${i}]`;
    if (!s.known(`${f}.kind`, a?.kind, ABILITY_KINDS, 'la habilidad ')) continue;
    s.expect(!seen.has(a.kind), `${f}: la habilidad "${a.kind}" esta repetida`);
    seen.add(a.kind);
    switch (a.kind) {
      case 'guard':
        s.num(`${f}.factor`, a.factor, { min: 0, max: 1 });
        break;
      case 'zoneOfControl':
        if (s.expect(Array.isArray(a.stops) && a.stops.length > 0, `${f}.stops tiene que ser una lista de movimientos`))
          for (const m of a.stops) s.known(`${f}.stops`, m, MOVEMENTS, 'el movimiento ');
        break;
      case 'aura':
        s.num(`${f}.radius`, a.radius, { min: 1, max: 5, int: true });
        s.num(`${f}.defense`, a.defense, { min: 0, max: 1 });
        break;
      case 'piercing':
        s.num(`${f}.ignoreCover`, a.ignoreCover, { min: 0, max: 1 });
        s.expect(u.attack !== null, `${f}: piercing en una unidad que no ataca`);
        break;
      case 'scout':
        break;
      case 'quickCapture':
        s.num(`${f}.factor`, a.factor, { min: 1, max: 5 });
        s.expect(u.captures, `${f}: quickCapture en una unidad que no captura`);
        break;
      default:
        break;
    }
  }
}

/** Ataque de un tipo de unidad: a que distancias dispara y con que acierto contra cada tipo. */
export interface UnitAttack {
  /** Distancia minima de tiro (1 = la casilla de al lado). */
  readonly minRange: number;
  readonly maxRange: number;
  /** Probabilidad de acierto de cada punto de vida contra cada tipo, por id (si no esta, 0: no le puede atacar). */
  readonly hitChance: Readonly<Record<string, number>>;
}

/** Un tipo de unidad, resuelto al cargar el contenido (units.json). */
export interface UnitType {
  readonly id: string;
  readonly name: Texts;
  readonly cost: number;
  /** Puntos de mando que ocupa (regla commandPoints). */
  readonly command: number;
  /** Casillas que puede mover por turno. */
  readonly move: number;
  readonly vision: number;
  readonly movement: MoveType;
  readonly canCapture: boolean;
  /** null = no ataca. */
  readonly attack: UnitAttack | null;
  /** Plazas de transporte (0 = no lleva a nadie) y tipos que puede llevar, por id. */
  readonly cargoSlots: number;
  readonly carries: readonly string[];
  /** Edificios que la fabrican y edificios propios que la curan al empezar la ronda, por id. */
  readonly builtAt: readonly string[];
  readonly repairedAt: readonly string[];
  /** Vida que cura con la orden de reparar a cada tipo de al lado, por id (si no esta, 0). */
  readonly heals: Readonly<Record<string, number>>;
  /** Habilidades pasivas (regla abilities): ver AbilityDef. */
  readonly abilities: readonly DeepReadonly<AbilityDef>[];
  /** Pista para la IA: no combate (compra como mucho una a la vez). */
  readonly isSupport: boolean;
  /** Nombre de sus imagenes (el suyo, o el de `art` mientras no tenga dibujo propio). */
  readonly art: string;
  /** Graficos de 2013: prefijo de la imagen segun el terreno, por id de terreno (si no esta, ''). */
  readonly classicSprite: Readonly<Record<string, string>>;
}

function attackOf(definition: UnitDef): UnitAttack | null {
  if (!definition.attack) return null;
  const [minRange, maxRange] = definition.attack.range;
  return { minRange, maxRange, hitChance: { ...definition.attack.hitChance } };
}

/** Los tipos de unidad del fichero (validado), en su orden. */
export function buildUnitTypes(units: readonly UnitDef[]): UnitType[] {
  return units.map((definition) => ({
    id: definition.id,
    name: definition.name,
    cost: definition.cost,
    command: definition.command,
    move: definition.move,
    vision: definition.vision,
    movement: definition.movement,
    canCapture: definition.captures,
    attack: attackOf(definition),
    cargoSlots: definition.transport?.slots ?? 0,
    carries: definition.transport?.carries ?? [],
    builtAt: definition.builtAt,
    repairedAt: definition.repairedAt,
    heals: { ...definition.heals },
    abilities: definition.abilities ?? [],
    isSupport: !!definition.ai?.support,
    art: definition.art ?? definition.id,
    classicSprite: { ...definition.classicSprite },
  }));
}
