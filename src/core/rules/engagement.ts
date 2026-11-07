/**
 * Un combate como pregunta: quien ataca a quien, desde donde y con que vida. Las reglas del combate
 * (acierto, daño, contraataque, prevision) miran un `Engagement` en vez de dos unidades sueltas, asi
 * que "¿y si atacara desde alli?" o "¿y si le quedara esta vida?" se preguntan sin fingir unidades
 * (copias con otra casilla u otra vida que pasan por las reglas como si fueran de verdad).
 */
import { posOf } from '../geom';
import type { Engagement, Fighter, Pos, Unit } from '../model';

/** La unidad tal como esta, o en otra casilla o con otra vida. */
export const fighterOf = (unit: Unit, at: Pos = unit, life = unit.life): Fighter => ({ unit, at: posOf(at), life });

/** Lo que cambia en un combate hipotetico; lo que no se dice es como estan ahora las dos unidades. */
export interface EngagementOptions {
  /** Desde donde ataca (por defecto, desde donde esta). */
  readonly from?: Pos;
  readonly attackerLife?: number;
  readonly defenderLife?: number;
}

/** El combate de `attacker` contra `defender`, como estan ahora o como dicen las opciones. */
export function engagement(attacker: Unit, defender: Unit, options: EngagementOptions = {}): Engagement {
  return {
    attacker: fighterOf(attacker, options.from, options.attackerLife),
    defender: fighterOf(defender, defender, options.defenderLife),
  };
}

/** El mismo combate al reves: el del contraataque (el defensor dispara a quien le ha atacado). */
export const reversed = (fight: Engagement): Engagement => ({ attacker: fight.defender, defender: fight.attacker });
