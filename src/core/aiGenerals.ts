/**
 * [CAMBIO] La IA usa a su general (ver core/generals.ts). Una habilidad por turno, al empezarlo, antes
 * de mover: asi un ataque aereo debilita a quien luego puede rematar, y el reconocimiento le deja
 * ver antes de decidir.
 *
 * Cada habilidad se valora en "valor" (precio × vida que quita / 100, como el resto de la IA):
 * - areaDamage: el mejor cuadrado sobre los enemigos que ve (nunca a ciegas en la niebla).
 * - reveal: un valor fijo pequeño (AI.REVEALVALUE) y solo con niebla.
 * Se usa la de mas valor si llega a AI.GENERALMINVALUE. Con la barra llena se usa cualquiera que
 * valga algo, para no desperdiciar la carga que seguiria ganando.
 *
 * Generico por tipo de efecto: un general nuevo con efectos que ya existen no necesita tocar esto.
 */
import { AI, RULES, UNIT } from './data';
import { areaTiles, chargeStars, generalOf, useAbility } from './generals';
import { visibility } from './rules';
import type { GameEvent, GameState, Pos, Team } from './types';

export interface AbilityChoice {
  ability: string;
  target: Pos | null;
  value: number;
}

/** Mejor casilla para un daño en area: la que mas valor quita a enemigos que se ven. */
export function bestAreaTarget(
  s: GameState,
  team: Team,
  radius: number,
  damage: number,
  minLife: number,
): { target: Pos; value: number } | null {
  const vis = visibility(s, team);
  const enemies = s.units.filter((u) => u.team !== team && u.carrier === null && u.life > minLife && vis[u.x]![u.y]);
  const hitValue = (life: number, type: number) => (Math.max(0, Math.min(damage, life - minLife)) * UNIT.cost[type]!) / 100;
  let best: { target: Pos; value: number } | null = null;
  const tried = new Set<string>();
  for (const e of enemies)
    for (const c of areaTiles(e, radius)) {
      const k = `${c.x},${c.y}`;
      if (tried.has(k)) continue;
      tried.add(k);
      const area = new Set(areaTiles(c, radius).map((p) => `${p.x},${p.y}`));
      const value = enemies.reduce((v, u) => v + (area.has(`${u.x},${u.y}`) ? hitValue(u.life, u.type) : 0), 0);
      if (!best || value > best.value) best = { target: c, value };
    }
  return best;
}

/** Que habilidad usaria ahora la IA (null = ninguna, guarda la carga). */
export function chooseAbility(s: GameState, team: Team): AbilityChoice | null {
  const g = generalOf(s, team);
  if (!g || g.state.used) return null;
  const stars = chargeStars(g.state);
  let best: AbilityChoice | null = null;
  for (const a of g.def.abilities) {
    if (a.cost > stars) continue;
    let c: AbilityChoice | null = null;
    if (a.effect.kind === 'areaDamage') {
      const t = bestAreaTarget(s, team, a.effect.radius, a.effect.damage, a.effect.minLife);
      if (t) c = { ability: a.id, target: t.target, value: t.value };
    } else if (a.effect.kind === 'reveal' && RULES.fog) c = { ability: a.id, target: null, value: AI.REVEALVALUE };
    if (c && (!best || c.value > best.value)) best = c;
  }
  if (!best) return null;
  const full = stars >= g.def.charge.max;
  return best.value >= AI.GENERALMINVALUE || (full && best.value > 0) ? best : null;
}

/** Turno del general de la IA: como mucho una habilidad. */
export function* aiGeneral(s: GameState, team: Team): Generator<GameEvent> {
  const c = chooseAbility(s, team);
  if (!c) return;
  const ev = useAbility(s, team, c.ability, c.target);
  if (ev) yield ev;
}
