/**
 * [CAMBIO] La IA usa a su general (ver core/generals.ts). Una habilidad por turno, al empezarlo, antes
 * de mover: asi un ataque aereo debilita a quien luego puede rematar, y el reconocimiento le deja
 * ver antes de decidir.
 *
 * Cada habilidad se valora en "valor" (precio × vida que quita / 100, como el resto de la IA), segun
 * su tipo de efecto (EFFECT_VALUES). Se usa la de mas valor si llega a AI.GENERALMINVALUE. Con la
 * barra llena se usa cualquiera que valga algo, para no desperdiciar la carga que seguiria ganando.
 *
 * Generico por tipo de efecto: un general nuevo con efectos que ya existen no necesita tocar esto; un
 * tipo de efecto nuevo es una entrada en EFFECT_VALUES.
 */
import type { GeneralEffect } from './content';
import { AI, RULES, UNIT } from './data';
import { applies, areaTiles, chargeStars, generalOf, useAbility } from './generals';
import { visibility } from './rules/visibility';
import type { GameEvent, GameState, Pos, Team } from './types';
import { cellAt } from './util/grid';
import { maxBy } from './util/pick';

export interface AbilityChoice {
  ability: string;
  target: Pos | null;
  value: number;
}

/** Donde apuntar una habilidad y cuanto vale usarla ahi. */
interface ValuedTarget {
  target: Pos | null;
  value: number;
}

/** Lo que vale quitar `life` puntos de vida a una unidad de ese tipo (precio × vida / 100). */
const lifeValue = (life: number, type: number): number => (life * UNIT.cost[type]!) / 100;

const tileKey = (pos: Pos): string => `${pos.x},${pos.y}`;

/** Las casillas en las que se puede centrar un area de `radius` que toque a alguno de `enemies`, sin repetir. */
function areaCentersTouching(enemies: readonly Pos[], radius: number): Pos[] {
  const seen = new Set<string>();
  const centers: Pos[] = [];
  for (const enemy of enemies)
    for (const center of areaTiles(enemy, radius)) {
      if (seen.has(tileKey(center))) continue;
      seen.add(tileKey(center));
      centers.push(center);
    }
  return centers;
}

/** Mejor casilla para un daño en area: la que mas valor quita a enemigos que se ven. */
export function bestAreaTarget(
  s: GameState,
  team: Team,
  radius: number,
  damage: number,
  minLife: number,
): { target: Pos; value: number } | null {
  const visible = visibility(s, team);
  // Nunca a ciegas en la niebla, y nada que ya no pueda bajar de minLife.
  const enemies = s.units.filter((unit) => unit.team !== team && unit.carrier === null && unit.life > minLife && cellAt(visible, unit));
  const lifeTaken = (life: number) => Math.max(0, Math.min(damage, life - minLife));
  const valueAt = (center: Pos): number => {
    const area = new Set(areaTiles(center, radius).map(tileKey));
    return enemies.reduce((total, enemy) => total + (area.has(tileKey(enemy)) ? lifeValue(lifeTaken(enemy.life), enemy.type) : 0), 0);
  };
  const options = areaCentersTouching(enemies, radius).map((target) => ({ target, value: valueAt(target) }));
  return maxBy(options, (option) => option.value);
}

/** Como se valora un tipo de efecto: donde apuntarlo y cuanto vale, o null si no tiene sentido ahora. */
type EffectValue<E extends GeneralEffect> = (s: GameState, team: Team, effect: E) => ValuedTarget | null;
type EffectValues = { [Kind in GeneralEffect['kind']]: EffectValue<Extract<GeneralEffect, { kind: Kind }>> };

const EFFECT_VALUES: EffectValues = {
  // El mejor cuadrado sobre los enemigos que ve.
  areaDamage: (s, team, effect) => bestAreaTarget(s, team, effect.radius, effect.damage, effect.minLife),
  // Un valor fijo pequeño, y solo con niebla (sin ella ya lo ve todo).
  reveal: () => (RULES.fog ? { target: null, value: AI.REVEALVALUE } : null),
  // La vida que recuperarian sus unidades (lo que ya esta entero no cuenta).
  heal: (s, team, effect) => {
    const healed = (life: number) => Math.min(effect.amount, 100 - life);
    const value = s.units.reduce(
      (total, unit) => total + (unit.team === team && applies(effect, unit.type) ? lifeValue(healed(unit.life), unit.type) : 0),
      0,
    );
    return { target: null, value };
  },
  // El dinero que da (el valor ya es dinero).
  funds: (_s, _team, effect) => ({ target: null, value: effect.amount }),
};

function valueEffect<E extends GeneralEffect>(s: GameState, team: Team, effect: E): ValuedTarget | null {
  return (EFFECT_VALUES[effect.kind] as EffectValue<E>)(s, team, effect);
}

/** Que habilidad usaria ahora la IA (null = ninguna, guarda la carga). */
export function chooseAbility(s: GameState, team: Team): AbilityChoice | null {
  const general = generalOf(s, team);
  if (!general || general.state.used) return null;
  const stars = chargeStars(general.state);
  const choices: AbilityChoice[] = [];
  for (const ability of general.def.abilities) {
    if (ability.cost > stars) continue;
    const valued = valueEffect(s, team, ability.effect);
    if (valued) choices.push({ ability: ability.id, ...valued });
  }
  const best = maxBy(choices, (choice) => choice.value);
  if (!best) return null;
  const isChargeFull = stars >= general.def.charge.max;
  return best.value >= AI.GENERALMINVALUE || (isChargeFull && best.value > 0) ? best : null;
}

/** Turno del general de la IA: como mucho una habilidad. */
export function* aiGeneral(s: GameState, team: Team): Generator<GameEvent> {
  const choice = chooseAbility(s, team);
  if (!choice) return;
  const event = useAbility(s, team, choice.ability, choice.target);
  if (event) yield event;
}
