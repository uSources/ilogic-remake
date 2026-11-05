/**
 * [CAMBIO] Habilidades de las unidades (regla abilities; no estaban en el juego de 2013).
 *
 * Son pasivas y salen de units.json ("abilities"): el codigo no sabe que unidad tiene cual, solo
 * que hace cada clase (ver AbilityDef en content/types.ts y docs/CONTENIDO.md). Las reglas
 * (hitChance, moveRange, validPath, visibility, captureStrength) llaman a estas funciones; la IA y la
 * prevision de combate las usan sin saberlo porque pasan por las mismas reglas.
 *
 * Una clase de habilidad nueva: su forma en AbilityDef (content/types.ts) y su efecto aqui, como
 * funcion que pregunta la regla que toca. Las reglas no leen `abilityOf` directamente.
 *
 * Este modulo no importa rules/ (las reglas lo importan a el).
 */
import { unitTypeOf } from './gameContent';
import type { AbilityDef, UnitType } from './content';
import type { DeepReadonly } from './util/freeze';
import { manhattan, neighbors4 } from './geom';
import { createLayer } from './mapGrid';
import type { Grid } from './util/grid';
import { isAlive, isEnemyOf, isOnMap } from './util/predicates';
import type { GameState, Unit } from './model';

type AbilityOf<K extends AbilityDef['kind']> = DeepReadonly<Extract<AbilityDef, { kind: K }>>;
/** Una unidad, o lo que se sabe de su tipo (una prevision, un evento). */
type OfType = Pick<Unit, 'type'>;

/** Habilidad `kind` de un tipo de unidad, si la tiene y la regla esta activa. */
export function abilityOf<K extends AbilityDef['kind']>(s: GameState, unitType: UnitType, kind: K): AbilityOf<K> | undefined {
  if (!s.rules.abilities) return undefined;
  return unitType.abilities.find((ability): ability is AbilityOf<K> => ability.kind === kind);
}

/** Habilidad `kind` del tipo de una unidad, si la tiene y la regla esta activa. */
const abilityOfUnit = <K extends AbilityDef['kind']>(s: GameState, unit: OfType, kind: K): AbilityOf<K> | undefined =>
  abilityOf(s, unitTypeOf(s, unit), kind);

/** Habilidades de un tipo de unidad que cuentan con las reglas de la partida (para enseñarlas). */
export function abilitiesOf(s: GameState, unitType: UnitType): readonly DeepReadonly<AbilityDef>[] {
  return s.rules.abilities ? unitType.abilities : [];
}

/** Ve dentro del terreno que esconde (bosque) en todo su radio de vision (scout). */
export function seesIntoCover(s: GameState, unit: OfType): boolean {
  return !!abilityOfUnit(s, unit, 'scout');
}

/** Multiplicador de lo que resta al capturar (quickCapture). 1 = nada. */
export function captureFactor(s: GameState, unit: OfType): number {
  return abilityOfUnit(s, unit, 'quickCapture')?.factor ?? 1;
}

/** Ataca a distancia (no puede disparar a la casilla de al lado). */
export function isRanged(s: GameState, unit: OfType): boolean {
  return (unitTypeOf(s, unit).attack?.minRange ?? 1) > 1;
}

/**
 * Proteccion de la casilla que le queda al objetivo frente a `attacker` (piercing): 1 = sin
 * proteccion. `protection` es la de tileProtection.
 */
export function coverAgainst(s: GameState, attacker: OfType, protection: number): number {
  const piercing = abilityOfUnit(s, attacker, 'piercing');
  return piercing ? protection + (1 - protection) * piercing.ignoreCover : protection;
}

/**
 * Multiplicador del acierto de `attacker` contra `defender` por las habilidades del defensor y de
 * sus aliados (guard, aura). 1 = nada.
 */
export function defenseFactor(s: GameState, attacker: Unit, defender: Unit): number {
  if (!s.rules.abilities) return 1;
  let factor = 1;
  const guard = abilityOfUnit(s, defender, 'guard');
  if (guard && isRanged(s, attacker)) factor *= guard.factor;
  factor *= auraFactor(s, defender);
  return factor;
}

/** Puede dar o sufrir efectos de habilidades de otras unidades: en el mapa y con vida. */
const isFieldUnit = (unit: Unit): boolean => isOnMap(unit) && isAlive(unit);

/** Mejor aura de las unidades propias cercanas a `defender` (1 si no hay ninguna). */
export function auraFactor(s: GameState, defender: Unit): number {
  if (!s.rules.abilities) return 1;
  let best = 1;
  for (const ally of s.units) {
    if (ally.uid === defender.uid || isEnemyOf(ally, defender) || !isFieldUnit(ally)) continue;
    const aura = abilityOfUnit(s, ally, 'aura');
    if (aura && manhattan(ally, defender) <= aura.radius) best = Math.min(best, aura.defense);
  }
  return best;
}

/**
 * Casillas en las que `unit` se tiene que parar (zoneOfControl de los enemigos): las de al lado de un
 * enemigo con la habilidad que para a su tipo de movimiento. `visible` (opcional): solo cuentan los
 * enemigos que se ven, como en passMap.
 */
export function zoneOfControl(s: GameState, unit: Unit, visible?: Grid<boolean> | null): Grid<boolean> {
  const mustStop = createLayer(s, false);
  if (!s.rules.abilities) return mustStop;
  const movement = unitTypeOf(s, unit).movement;
  for (const enemy of s.units) {
    if (!isEnemyOf(enemy, unit) || !isFieldUnit(enemy)) continue;
    if (visible && !visible.at(enemy)) continue;
    const zone = abilityOfUnit(s, enemy, 'zoneOfControl');
    if (!zone?.stops.includes(movement)) continue;
    for (const tile of neighbors4(mustStop, enemy)) mustStop.set(tile, true);
  }
  return mustStop;
}
