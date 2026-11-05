/**
 * [CAMBIO] Generales (no estaban en el juego de 2013). Datos en content/generals.json.
 *
 * Cada bando puede tener un general (GameState.generals). Tiene:
 * - una ventaja fija (passive): multiplica el acierto de sus unidades (attack) o el de los enemigos
 *   contra ellas (defense). hitChance la aplica, asi que la prevision y la IA la ven sin saberlo;
 * - una barra de carga: gana una estrella por cada `charge.per` de valor (precio × vida / 100) que
 *   hace o recibe en combate;
 * - habilidades que gastan carga, una por turno: ver todo el mapa (reveal), daño en un area
 *   (areaDamage, nunca mata), curar a sus unidades (heal) o conseguir dinero (funds).
 *
 * Este modulo no importa rules.ts (rules.ts lo importa a el).
 */
import { unitTypeOf } from './gameContent';
import type { DeepReadonly } from './util/freeze';
import { findEntry, type GeneralAbilityDef, type GeneralDef, type GeneralEffect, type UnitFilter } from './content';
import { MAX_LIFE } from './data';
import { posKey, squareArea, posOf } from './geom';
import { mapGrid } from './mapGrid';
import { isOnMap } from './util/predicates';
import type { GameEventOf, GameState, GeneralState, Pos, Team, Unit } from './model';

export const generalDef = (s: GameState, id: string): DeepReadonly<GeneralDef> | undefined => findEntry(s.content.generals, id);

/** General de un bando con sus datos (null si no tiene). */
export function generalOf(s: GameState, team: Team): { state: GeneralState; definition: DeepReadonly<GeneralDef> } | null {
  const state = s.generals?.[team];
  const definition = state ? generalDef(s, state.id) : undefined;
  return state && definition ? { state, definition } : null;
}

/** Estado inicial de un general (null si el id no existe). */
export function newGeneral(s: GameState, id: string | null | undefined): GeneralState | null {
  return id && generalDef(s, id) ? { id, charge: 0, used: false, reveal: false } : null;
}

/** El tipo de la unidad entra en el filtro (sin filtro, todas). */
export function applies(s: GameState, filter: DeepReadonly<UnitFilter>, unit: Pick<Unit, 'type'>): boolean {
  const unitType = unitTypeOf(s, unit);
  if (filter.movement && !filter.movement.includes(unitType.movement)) return false;
  if (filter.units && !filter.units.includes(unitType.id)) return false;
  return true;
}

/** Multiplicador del acierto de `attacker` contra `defender` por los generales de los dos bandos (1 = nada). */
export function generalHitFactor(s: GameState, attacker: Unit, defender: Unit): number {
  let factor = 1;
  const attackerGeneral = generalOf(s, attacker.team);
  for (const passive of attackerGeneral?.definition.passive ?? [])
    if (passive.kind === 'attack' && applies(s, passive, attacker)) factor *= passive.factor;
  const defenderGeneral = generalOf(s, defender.team);
  for (const passive of defenderGeneral?.definition.passive ?? [])
    if (passive.kind === 'defense' && applies(s, passive, defender)) factor *= passive.factor;
  return factor;
}

/** Suma carga a un bando por `value` de valor hecho o recibido (sin pasar del maximo). */
function addCharge(s: GameState, team: Team, value: number): void {
  const general = generalOf(s, team);
  if (!general || value <= 0) return;
  general.state.charge = Math.min(general.definition.charge.max, general.state.charge + value / general.definition.charge.per);
}

/**
 * Carga por un combate: los dos bandos ganan por el valor que hacen y por el que reciben.
 * `toDefender`/`toAttacker`: vida que ha perdido cada uno.
 */
export function chargeFromCombat(s: GameState, attacker: Unit, defender: Unit, toDefender: number, toAttacker: number): void {
  const defenderValueLost = (toDefender * unitTypeOf(s, defender).cost) / 100;
  const attackerValueLost = (toAttacker * unitTypeOf(s, attacker).cost) / 100;
  addCharge(s, attacker.team, defenderValueLost + attackerValueLost);
  addCharge(s, defender.team, defenderValueLost + attackerValueLost);
}

/** El bando ve todo el mapa (habilidad reveal activa). */
export const revealsAll = (s: GameState, team: Team): boolean => !!s.generals?.[team]?.reveal;

/** Estrellas enteras de la barra. */
export const chargeStars = (generalState: GeneralState): number => Math.floor(generalState.charge + 1e-9);

export type AbilityBlock = 'noGeneral' | 'unknown' | 'used' | 'charge' | 'target';

/** Por que no se puede usar ahora una habilidad (null = se puede). `target` hace falta en las de area. */
export function abilityBlock(s: GameState, team: Team, abilityId: string, target?: Pos | null): AbilityBlock | null {
  const general = generalOf(s, team);
  if (!general) return 'noGeneral';
  const ability = general.definition.abilities.find((candidate) => candidate.id === abilityId);
  if (!ability) return 'unknown';
  if (general.state.used) return 'used';
  if (chargeStars(general.state) < ability.cost) return 'charge';
  if (ability.effect.kind === 'areaDamage' && !target) return 'target';
  return null;
}

/** Radio del area de una habilidad (null si no es de area). */
export function abilityArea(ability: DeepReadonly<GeneralAbilityDef>): number | null {
  return ability.effect.kind === 'areaDamage' ? ability.effect.radius : null;
}

/** Lo que ha hecho una habilidad, para su evento. */
interface AbilityEffects {
  hits: { uid: number; damage: number }[];
  heals: { uid: number; amount: number }[];
  funds: number;
}

/** Lo que necesita el efecto de una habilidad para aplicarse. */
interface EffectContext<K extends GeneralEffect['kind']> {
  s: GameState;
  team: Team;
  general: GeneralState;
  effect: Extract<DeepReadonly<GeneralEffect>, { kind: K }>;
  /** Casilla elegida (solo en las de area, que no se pueden usar sin ella: ver abilityBlock). */
  target: Pos | null | undefined;
  out: AbilityEffects;
}

/**
 * Que hace cada clase de habilidad (generals.json, "effect.kind"). Una clase nueva es una entrada
 * mas aqui (y su forma en content/generals.ts).
 */
const ABILITY_EFFECTS: { [K in GeneralEffect['kind']]: (context: EffectContext<K>) => void } = {
  reveal: ({ general }) => {
    general.reveal = true;
  },
  heal: ({ s, team, effect, out }) => {
    for (const unit of s.units) {
      if (unit.team !== team || !applies(s, effect, unit)) continue;
      const amount = Math.min(effect.amount, MAX_LIFE - unit.life);
      if (amount <= 0) continue;
      unit.life += amount;
      out.heals.push({ uid: unit.uid, amount });
    }
  },
  funds: ({ s, team, effect, out }) => {
    s.funds[team] += effect.amount;
    out.funds = effect.amount;
  },
  // Daño en un area a los enemigos, sin dejar a nadie por debajo de `minLife` (nunca mata).
  areaDamage: ({ s, team, effect, target, out }) => {
    const inArea = new Set(squareArea(mapGrid(s), target!, effect.radius).map(posKey));
    for (const unit of s.units) {
      if (unit.team === team || !isOnMap(unit) || !inArea.has(posKey(unit))) continue;
      const damage = Math.max(0, Math.min(effect.damage, unit.life - effect.minLife));
      if (damage <= 0) continue;
      unit.life -= damage;
      out.hits.push({ uid: unit.uid, damage });
    }
  },
};

function applyEffect<K extends GeneralEffect['kind']>(context: EffectContext<K>): void {
  (ABILITY_EFFECTS[context.effect.kind] as (context: EffectContext<K>) => void)(context);
}

/**
 * Usa una habilidad: gasta la carga, la marca como usada este turno y aplica el efecto.
 * Devuelve el evento para animarlo, o null si no se puede (ver abilityBlock).
 */
export function useAbility(s: GameState, team: Team, abilityId: string, target?: Pos | null): GameEventOf<'ability'> | null {
  if (abilityBlock(s, team, abilityId, target)) return null;
  const general = generalOf(s, team)!;
  const ability = general.definition.abilities.find((candidate) => candidate.id === abilityId)!;
  general.state.charge = Math.max(0, general.state.charge - ability.cost);
  general.state.used = true;
  const out: AbilityEffects = { hits: [], heals: [], funds: 0 };
  applyEffect({ s, team, general: general.state, effect: ability.effect, target, out });
  return {
    kind: 'ability',
    team,
    general: general.definition.id,
    ability: ability.id,
    ...(target ? { target: posOf(target) } : {}),
    hits: out.hits,
    ...(out.heals.length ? { heals: out.heals } : {}),
    ...(out.funds ? { funds: out.funds } : {}),
  };
}

/** Al acabar la ronda: se puede volver a usar una habilidad y se acaba el reconocimiento. */
export function generalsNewRound(s: GameState): void {
  for (const general of s.generals ?? []) {
    if (!general) continue;
    general.used = false;
    general.reveal = false;
  }
}
