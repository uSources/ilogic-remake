/** Unidades (units.json): validacion y su tipo resuelto (`UnitType`). */
import type { DeepReadonly } from '../util/freeze';
import { type Checker, type Scope, checkSprites } from './check';
import { ABILITY_KINDS, validateAbilityShape } from './abilities';
import { MAX_LIFE } from '../data';
import type { MovementDef, MovementMotion } from './movements';
import type { AbilityDef, ContentContext, MoveType, Texts, UnitDef } from './types';

const LINKS_TO_BUILDINGS = ['builtAt', 'repairedAt'] as const;

export function validateUnits(units: readonly UnitDef[], context: ContentContext, check: Checker): void {
  for (const unit of units) {
    const scope = check.scope(`unidad ${unit?.id}`);
    validateNumbers(scope, unit, context);
    if (unit?.attack !== null) validateAttack(scope, unit?.attack, context);
    validateLinks(scope, unit, context);
    checkSprites(scope, unit?.classicSprite, context.terrainIds);
    if (unit?.abilities !== undefined) validateAbilities(scope, unit.abilities, unit, context);
  }
}

/** Nombre, precio, mando, movimiento, vision y si captura. */
function validateNumbers(scope: Scope, unit: UnitDef, context: ContentContext): void {
  scope.texts('name', unit?.name);
  scope.num('cost', unit?.cost, { min: 1, int: true });
  scope.num('command', unit?.command, { min: 1, max: 20, int: true });
  scope.num('move', unit?.move, { min: 0, max: 30, int: true });
  scope.num('vision', unit?.vision, { min: 0, max: 30, int: true });
  scope.known('movement', unit?.movement, context.movementIds, 'el movimiento ');
  scope.bool('captures', unit?.captures);
}

/** Alcance y acierto contra cada unidad. */
function validateAttack(scope: Scope, attack: UnitDef['attack'] | undefined, context: ContentContext): void {
  const range = attack?.range;
  if (scope.expect(Array.isArray(range) && range.length === 2, 'attack.range tiene que ser [desde, hasta] (o attack: null si no ataca)'))
    scope.expect(
      Array.isArray(range) && Number.isInteger(range[0]) && Number.isInteger(range[1]) && range[0] >= 1 && range[1] >= range[0],
      'attack.range: 1 <= desde <= hasta',
    );
  scope.bool('attack.firesAfterMove', attack?.firesAfterMove);
  for (const [target, chance] of Object.entries(attack?.hitChance ?? {})) {
    scope.known('attack.hitChance', target, context.unitIds);
    scope.num(`attack.hitChance.${target}`, chance, { min: 0, max: 1 });
  }
  scope.expect(
    Object.values(attack?.hitChance ?? {}).some((chance) => chance > 0),
    'ataca pero no puede acertar a nadie (attack.hitChance)',
  );
}

/** Lo que nombra a otras unidades o edificios: transporte, quien la fabrica y repara, a quien cura, su dibujo. */
function validateLinks(scope: Scope, unit: UnitDef, context: ContentContext): void {
  if (unit?.transport) {
    scope.num('transport.slots', unit.transport.slots, { min: 1, max: 9, int: true });
    scope.refs('transport.carries', unit.transport.carries, context.unitIds);
  }
  for (const field of LINKS_TO_BUILDINGS) scope.refs(field, unit?.[field], context.buildingIds);
  if (Array.isArray(unit?.builtAt)) scope.expect(unit.builtAt.length > 0, 'builtAt vacio: nadie la puede comprar');
  for (const [healed, amount] of Object.entries(unit?.heals ?? {})) {
    scope.known('heals', healed, context.unitIds);
    scope.num(`heals.${healed}`, amount, { min: 0, max: MAX_LIFE, int: true });
  }
  if (unit?.art !== undefined && scope.known('art', unit.art, context.unitIds))
    scope.expect(unit.art !== unit.id, 'art no puede ser ella misma');
}

function validateAbilities(scope: Scope, list: unknown, unit: UnitDef, context: ContentContext): void {
  if (!scope.expect(Array.isArray(list), 'abilities tiene que ser una lista')) return;
  const seen = new Set<string>();
  for (const [index, ability] of (list as AbilityDef[]).entries()) {
    const field = `abilities[${index}]`;
    if (!scope.known(`${field}.kind`, ability?.kind, ABILITY_KINDS, 'la habilidad ')) continue;
    scope.expect(!seen.has(ability.kind), `${field}: la habilidad "${ability.kind}" esta repetida`);
    seen.add(ability.kind);
    validateAbilityShape(scope, field, ability, unit, context);
  }
}

/** Ataque de un tipo de unidad: a que distancias dispara y con que acierto contra cada tipo. */
export interface UnitAttack {
  /** Distancia minima de tiro (1 = la casilla de al lado). */
  readonly minRange: number;
  readonly maxRange: number;
  /** Puede moverse y disparar en el mismo turno (la artilleria no: solo dispara si no se ha movido). */
  readonly firesAfterMove: boolean;
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
  /** Como se ve al moverse y al disparar: el de su tipo de movimiento (movements.json, "motion"). */
  readonly motion: MovementMotion;
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
  return { minRange, maxRange, firesAfterMove: definition.attack.firesAfterMove, hitChance: { ...definition.attack.hitChance } };
}

/** Los tipos de unidad del fichero (validado), en su orden. */
export function buildUnitTypes(units: readonly UnitDef[], movements: readonly MovementDef[]): UnitType[] {
  const motionOf = (movement: MoveType) => movements.find((type) => type.id === movement)!.motion;
  return units.map((definition) => ({
    id: definition.id,
    name: definition.name,
    cost: definition.cost,
    command: definition.command,
    move: definition.move,
    vision: definition.vision,
    movement: definition.movement,
    motion: motionOf(definition.movement),
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
