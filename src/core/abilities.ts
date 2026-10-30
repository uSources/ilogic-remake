/**
 * [CAMBIO] Habilidades de las unidades (regla abilities; no estaban en el juego de 2013).
 *
 * Son pasivas y salen de units.json ("abilities"): el codigo no sabe que unidad tiene cual, solo
 * que hace cada clase (ver AbilityDef en content/types.ts y docs/CONTENIDO.md). Las reglas
 * (hitChance, moveRange, validPath) llaman a estas funciones; la IA y la prevision de combate las
 * usan sin saberlo porque pasan por las mismas reglas.
 *
 * Este modulo no importa rules.ts (rules.ts lo importa a el).
 */
import { MOVEMENTS } from './content';
import { RULES, UNIT, UNIT_ABILITIES, type AbilityDef } from './data';
import { grid, manhattan, neighbors4 } from './geom';
import type { GameState, Unit } from './types';

type AbilityOf<K extends AbilityDef['kind']> = Extract<AbilityDef, { kind: K }>;

/** Habilidad `kind` de un tipo de unidad, si la tiene y la regla esta activa. */
export function abilityOf<K extends AbilityDef['kind']>(type: number, kind: K): AbilityOf<K> | undefined {
  if (!RULES.abilities) return undefined;
  return UNIT_ABILITIES[type]?.find((a): a is AbilityOf<K> => a.kind === kind);
}

/** Habilidades de un tipo de unidad que cuentan con las reglas actuales (para enseñarlas). */
export function abilitiesOf(type: number): readonly AbilityDef[] {
  return RULES.abilities ? (UNIT_ABILITIES[type] ?? []) : [];
}

/** Ataca a distancia (no puede disparar a la casilla de al lado). */
export function isRanged(type: number): boolean {
  return UNIT.minalc[type]! > 0;
}

/**
 * Proteccion de la casilla que le queda al objetivo frente a `atkType` (piercing): 1 = sin proteccion.
 * `protection` es la de tileProtection.
 */
export function coverAgainst(atkType: number, protection: number): number {
  const p = abilityOf(atkType, 'piercing');
  return p ? protection + (1 - protection) * p.ignoreCover : protection;
}

/**
 * Multiplicador del acierto de `atk` contra `def` por las habilidades del defensor y de sus aliados
 * (guard, aura). 1 = nada.
 */
export function defenseFactor(s: GameState, atk: Unit, def: Unit): number {
  if (!RULES.abilities) return 1;
  let f = 1;
  const guard = abilityOf(def.type, 'guard');
  if (guard && isRanged(atk.type)) f *= guard.factor;
  f *= auraFactor(s, def);
  return f;
}

/** Mejor aura de las unidades propias cercanas a `def` (1 si no hay ninguna). */
export function auraFactor(s: GameState, def: Unit): number {
  if (!RULES.abilities) return 1;
  let best = 1;
  for (const o of s.units) {
    if (o.uid === def.uid || o.team !== def.team || o.carrier !== null || o.life <= 0) continue;
    const a = abilityOf(o.type, 'aura');
    if (a && manhattan(o, def) <= a.radius) best = Math.min(best, a.defense);
  }
  return best;
}

/**
 * Casillas en las que `u` se tiene que parar (zoneOfControl de los enemigos): las de al lado de un
 * enemigo con la habilidad que para a su tipo de movimiento. `vis` (opcional): solo cuentan los
 * enemigos que se ven, como en passMap.
 */
export function zoneOfControl(s: GameState, u: Unit, vis?: boolean[][] | null): boolean[][] {
  const zoc = grid(false);
  if (!RULES.abilities) return zoc;
  const mt = MOVEMENTS[UNIT.movtype[u.type]!];
  for (const o of s.units) {
    if (o.team === u.team || o.carrier !== null || o.life <= 0) continue;
    if (vis && !vis[o.x]![o.y]) continue;
    const z = abilityOf(o.type, 'zoneOfControl');
    if (!z?.stops.includes(mt)) continue;
    for (const n of neighbors4(o)) zoc[n.x]![n.y] = true;
  }
  return zoc;
}
