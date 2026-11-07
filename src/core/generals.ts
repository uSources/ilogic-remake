/**
 * [CAMBIO] Generales (no estaban en el juego de 2013). Datos en content/generals.json.
 *
 * Cada equipo puede tener un general (TeamState.general). Tiene:
 * - una ventaja fija (passive): multiplica el acierto de sus unidades (attack) o el de los enemigos
 *   contra ellas (defense). Es un modificador del acierto de su modulo de reglas
 *   (ruleModules/generals.ts), asi que la prevision y la IA la ven sin saberlo;
 * - una barra de carga: gana una estrella por cada `charge.per` de valor (precio × vida / 100) que
 *   hace o recibe en combate (un paso del combate de su modulo);
 * - poderes que gastan carga, una por turno (generalPowers.ts): ver todo el mapa (reveal), daño en
 *   un area (areaDamage, nunca mata), curar a sus unidades (heal) o conseguir dinero (funds).
 *
 * Las reglas no importan este modulo: lo enchufa su modulo de reglas.
 */
import { unitTypeOf } from './gameContent';
import type { DeepReadonly } from './util/freeze';
import { findEntry, type GeneralDef, type GeneralModifier, type UnitFilter } from './content';
import { teamState } from './teams';
import { isOnMap } from './util/predicates';
import type { Engagement, GameState, GeneralCharge, GeneralState, TeamId, Unit } from './model';
import { lifeValue } from './unitValue';

export const generalDef = (s: GameState, id: string): DeepReadonly<GeneralDef> | undefined => findEntry(s.content.generals, id);

/** General de un equipo con sus datos (null si no tiene). */
export function generalOf(s: GameState, team: TeamId): { state: GeneralState; definition: DeepReadonly<GeneralDef> } | null {
  const state = teamState(s, team).general;
  const definition = state ? generalDef(s, state.id) : undefined;
  return state && definition ? { state, definition } : null;
}

/** Estado inicial de un general (null si el id no existe). */
export function newGeneral(s: GameState, id: string | null | undefined): GeneralState | null {
  return id && generalDef(s, id) ? { id, charge: 0, used: false, reveal: false } : null;
}

/** El equipo pasa a tener ese general, con la barra vacia (null o un id que no existe: sin general). */
export function appointGeneral(s: GameState, team: TeamId, id: string | null | undefined): void {
  teamState(s, team).general = newGeneral(s, id);
}

/** El tipo de la unidad entra en el filtro (sin filtro, todas). */
export function applies(s: GameState, filter: DeepReadonly<UnitFilter>, unit: Pick<Unit, 'type'>): boolean {
  const unitType = unitTypeOf(s, unit);
  if (filter.movement && !filter.movement.includes(unitType.movement)) return false;
  if (filter.units && !filter.units.includes(unitType.id)) return false;
  return true;
}

/**
 * Las unidades que cura un poder de curar del equipo: las suyas del filtro, en el mapa.
 * [CAMBIO] Fallo K5: antes curaba tambien a las que iban dentro de un transporte.
 */
export function healedByPower(s: GameState, team: TeamId, filter: DeepReadonly<UnitFilter>): Unit[] {
  return s.units.filter((unit) => unit.team === team && isOnMap(unit) && applies(s, filter, unit));
}

/**
 * Multiplica `factor` por los pasivos de clase `kind` del general del equipo de `unit` que valen para
 * ella (en el orden de su definicion; sin general, `factor` tal cual).
 */
function passiveFactor(s: GameState, unit: Unit, kind: GeneralModifier['kind'], factor: number): number {
  const passives = generalOf(s, unit.team)?.definition.passive ?? [];
  return passives
    .filter((passive) => passive.kind === kind && applies(s, passive, unit))
    .reduce((total, passive) => total * passive.factor, factor);
}

/** Multiplicador del acierto de `attacker` contra `defender` por los generales de los dos equipos (1 = nada). */
export function generalHitFactor(s: GameState, fight: Engagement): number {
  // Primero los de ataque y luego los de defensa, multiplicando en ese orden (como siempre).
  const attack = passiveFactor(s, fight.attacker.unit, 'attack', 1);
  return passiveFactor(s, fight.defender.unit, 'defense', attack);
}

/** Suma carga a un equipo por `value` de valor hecho o recibido (sin pasar del maximo). Devuelve la ganada. */
function addCharge(s: GameState, team: TeamId, value: number): number {
  const general = generalOf(s, team);
  if (!general || value <= 0) return 0;
  const before = general.state.charge;
  general.state.charge = Math.min(general.definition.charge.max, before + value / general.definition.charge.per);
  return general.state.charge - before;
}

/**
 * Carga por un combate: los dos equipos ganan por el valor que hacen y por el que reciben.
 * `toDefender`/`toAttacker`: vida que ha perdido cada uno. Devuelve la que ha ganado cada equipo
 * (solo los que ganan algo), para el suceso del ataque.
 */
export function chargeFromCombat(s: GameState, attacker: Unit, defender: Unit, toDefender: number, toAttacker: number): GeneralCharge[] {
  const defenderValueLost = lifeValue(s, toDefender, defender);
  const attackerValueLost = lifeValue(s, toAttacker, attacker);
  const charges = [attacker.team, defender.team].map((team) => ({
    team,
    amount: addCharge(s, team, defenderValueLost + attackerValueLost),
  }));
  return charges.filter((charge) => charge.amount > 0);
}

/** El equipo ve todo el mapa (poder reveal activa). */
export const revealsAll = (s: GameState, team: TeamId): boolean => !!teamState(s, team).general?.reveal;

/** Estrellas enteras de la barra. */
export const chargeStars = (generalState: GeneralState): number => Math.floor(generalState.charge + 1e-9);

/** Al acabar la ronda: se puede volver a usar un poder y se acaba el reconocimiento. */
export function generalsNewRound(s: GameState): void {
  for (const { general } of s.teams) {
    if (!general) continue;
    general.used = false;
    general.reveal = false;
  }
}
