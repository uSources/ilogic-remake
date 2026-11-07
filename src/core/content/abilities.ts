/**
 * La forma de cada clase de habilidad de las unidades (units.json, "abilities"): que numeros lleva y
 * su validacion, una entrada por clase. Lo que hace cada una en la partida esta en core/abilities.ts
 * (`ABILITY_HOOKS`, en el orden de `ABILITY_ORDER`): una clase nueva es su forma en `AbilityDef`
 * (types.ts), su entrada aqui y la suya alli (el compilador obliga aqui; alli, tests/abilities.test.ts).
 */
import type { Scope } from './check';
import { MOVEMENTS, type AbilityDef, type UnitDef } from './types';

/** Una habilidad de esa clase, tal como viene del JSON. */
type AbilityOfKind<K extends AbilityDef['kind']> = Extract<AbilityDef, { kind: K }>;

/** Comprueba los numeros de una habilidad de esa clase (`field` es donde esta, para los errores). */
type ShapeCheck<K extends AbilityDef['kind']> = (scope: Scope, field: string, ability: AbilityOfKind<K>, unit: UnitDef) => void;

/** La validacion de cada clase de habilidad. */
export const ABILITY_SHAPES: { readonly [K in AbilityDef['kind']]: ShapeCheck<K> } = {
  guard: (scope, field, ability) => {
    scope.num(`${field}.factor`, ability.factor, { min: 0, max: 1 });
  },
  zoneOfControl: (scope, field, ability) => {
    if (!scope.expect(Array.isArray(ability.stops) && ability.stops.length > 0, `${field}.stops tiene que ser una lista de movimientos`))
      return;
    for (const movement of ability.stops) scope.known(`${field}.stops`, movement, MOVEMENTS, 'el movimiento ');
  },
  aura: (scope, field, ability) => {
    scope.num(`${field}.radius`, ability.radius, { min: 1, max: 5, int: true });
    scope.num(`${field}.defense`, ability.defense, { min: 0, max: 1 });
  },
  piercing: (scope, field, ability, unit) => {
    scope.num(`${field}.ignoreCover`, ability.ignoreCover, { min: 0, max: 1 });
    scope.expect(unit.attack !== null, `${field}: piercing en una unidad que no ataca`);
  },
  scout: () => {},
  quickCapture: (scope, field, ability, unit) => {
    scope.num(`${field}.factor`, ability.factor, { min: 1, max: 5 });
    scope.expect(unit.captures, `${field}: quickCapture en una unidad que no captura`);
  },
};

/** Clases de habilidad que entiende el juego (las de ABILITY_SHAPES, en su orden). */
export const ABILITY_KINDS = Object.keys(ABILITY_SHAPES) as readonly AbilityDef['kind'][];

/** Comprueba una habilidad de una clase que existe con la validacion de su clase. */
export function validateAbilityShape<K extends AbilityDef['kind']>(
  scope: Scope,
  field: string,
  ability: AbilityOfKind<K>,
  unit: UnitDef,
): void {
  // TypeScript no sabe que la entrada de cada clase recibe una habilidad de esa misma clase.
  (ABILITY_SHAPES[ability.kind] as ShapeCheck<K>)(scope, field, ability, unit);
}
