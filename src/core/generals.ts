/**
 * [CAMBIO] Generales (no estaban en el juego de 2013). Datos en content/generals.json.
 *
 * Cada bando puede tener un general (GameState.generals). Tiene:
 * - una ventaja fija (passive): multiplica el acierto de sus unidades (attack) o el de los enemigos
 *   contra ellas (defense). hitChance la aplica, asi que la prevision y la IA la ven sin saberlo;
 * - una barra de carga: gana una estrella por cada `charge.per` de valor (precio × vida / 100) que
 *   hace o recibe en combate;
 * - habilidades que gastan carga, una por turno: ver todo el mapa (reveal) o daño en un area
 *   (areaDamage, nunca mata).
 *
 * Este modulo no importa rules.ts (rules.ts lo importa a el).
 */
import { MOVEMENTS, type GeneralAbilityDef, type GeneralDef, type GeneralModifier } from './content';
import { GENERALS, UNIT, UNIT_NAMES } from './data';
import type { GameEvent, GameState, GeneralState, Pos, Team, Unit } from './types';

export const generalDef = (id: string): GeneralDef | undefined => GENERALS.find((g) => g.id === id);

/** General de un bando con sus datos (null si no tiene). */
export function generalOf(s: GameState, team: Team): { state: GeneralState; def: GeneralDef } | null {
  const state = s.generals?.[team];
  const def = state ? generalDef(state.id) : undefined;
  return state && def ? { state, def } : null;
}

/** Estado inicial de un general (null si el id no existe). */
export function newGeneral(id: string | null | undefined): GeneralState | null {
  return id && generalDef(id) ? { id, charge: 0, used: false, reveal: false } : null;
}

function applies(m: GeneralModifier, type: number): boolean {
  if (m.movement && !m.movement.includes(MOVEMENTS[UNIT.movtype[type]!])) return false;
  if (m.units && !m.units.includes(UNIT_NAMES[type]!)) return false;
  return true;
}

/** Multiplicador del acierto de `atk` contra `def` por los generales de los dos bandos (1 = nada). */
export function generalHitFactor(s: GameState, atk: Unit, def: Unit): number {
  let f = 1;
  const a = generalOf(s, atk.team);
  for (const m of a?.def.passive ?? []) if (m.kind === 'attack' && applies(m, atk.type)) f *= m.factor;
  const d = generalOf(s, def.team);
  for (const m of d?.def.passive ?? []) if (m.kind === 'defense' && applies(m, def.type)) f *= m.factor;
  return f;
}

/** Suma carga a un bando por `value` de valor hecho o recibido (sin pasar del maximo). */
function addCharge(s: GameState, team: Team, value: number): void {
  const g = generalOf(s, team);
  if (!g || value <= 0) return;
  g.state.charge = Math.min(g.def.charge.max, g.state.charge + value / g.def.charge.per);
}

/**
 * Carga por un combate: los dos bandos ganan por el valor que hacen y por el que reciben.
 * `toDef`/`toAtk`: vida que ha perdido cada uno.
 */
export function chargeFromCombat(s: GameState, atk: Unit, def: Unit, toDef: number, toAtk: number): void {
  const vDef = (toDef * UNIT.cost[def.type]!) / 100;
  const vAtk = (toAtk * UNIT.cost[atk.type]!) / 100;
  addCharge(s, atk.team, vDef + vAtk);
  addCharge(s, def.team, vDef + vAtk);
}

/** El bando ve todo el mapa (habilidad reveal activa). */
export const revealsAll = (s: GameState, team: Team): boolean => !!s.generals?.[team]?.reveal;

/** Estrellas enteras de la barra. */
export const chargeStars = (g: GeneralState): number => Math.floor(g.charge + 1e-9);

export type AbilityBlock = 'noGeneral' | 'unknown' | 'used' | 'charge' | 'target';

/** Por que no se puede usar ahora una habilidad (null = se puede). `target` hace falta en las de area. */
export function abilityBlock(s: GameState, team: Team, abilityId: string, target?: Pos | null): AbilityBlock | null {
  const g = generalOf(s, team);
  if (!g) return 'noGeneral';
  const a = g.def.abilities.find((x) => x.id === abilityId);
  if (!a) return 'unknown';
  if (g.state.used) return 'used';
  if (chargeStars(g.state) < a.cost) return 'charge';
  if (a.effect.kind === 'areaDamage' && !target) return 'target';
  return null;
}

/** Casillas de un area cuadrada de radio `r` alrededor de `c` (dentro del mapa o no: el que llama filtra). */
export function areaTiles(c: Pos, r: number): Pos[] {
  const out: Pos[] = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) out.push({ x: c.x + dx, y: c.y + dy });
  return out;
}

/** Radio del area de una habilidad (null si no es de area). */
export function abilityArea(a: GeneralAbilityDef): number | null {
  return a.effect.kind === 'areaDamage' ? a.effect.radius : null;
}

/**
 * Usa una habilidad: gasta la carga, la marca como usada este turno y aplica el efecto.
 * Devuelve el evento para animarlo, o null si no se puede (ver abilityBlock).
 */
export function useAbility(
  s: GameState,
  team: Team,
  abilityId: string,
  target?: Pos | null,
): Extract<GameEvent, { kind: 'ability' }> | null {
  if (abilityBlock(s, team, abilityId, target)) return null;
  const g = generalOf(s, team)!;
  const a = g.def.abilities.find((x) => x.id === abilityId)!;
  g.state.charge = Math.max(0, g.state.charge - a.cost);
  g.state.used = true;
  const hits: { uid: number; damage: number }[] = [];
  const e = a.effect;
  if (e.kind === 'reveal') g.state.reveal = true;
  else {
    const inArea = new Set(areaTiles(target!, e.radius).map((p) => `${p.x},${p.y}`));
    for (const u of s.units) {
      if (u.team === team || u.carrier !== null || !inArea.has(`${u.x},${u.y}`)) continue;
      const damage = Math.max(0, Math.min(e.damage, u.life - e.minLife));
      if (damage <= 0) continue;
      u.life -= damage;
      hits.push({ uid: u.uid, damage });
    }
  }
  return { kind: 'ability', team, general: g.def.id, ability: a.id, ...(target ? { target: { x: target.x, y: target.y } } : {}), hits };
}

/** Al acabar la ronda: se puede volver a usar una habilidad y se acaba el reconocimiento. */
export function generalsNewRound(s: GameState): void {
  for (const g of s.generals ?? []) {
    if (!g) continue;
    g.used = false;
    g.reveal = false;
  }
}
