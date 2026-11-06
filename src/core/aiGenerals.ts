/**
 * [CAMBIO] La IA usa a su general (ver core/generals.ts). Un poder por turno, al empezarlo, antes
 * de mover: asi un ataque aereo debilita a quien luego puede rematar, y el reconocimiento le deja
 * ver antes de decidir.
 *
 * Cada poder se valora en "valor" (precio × vida que quita / 100, como el resto de la IA), segun
 * su tipo de efecto (EFFECT_VALUES). Se usa la de mas valor si llega a AI.GENERALMINVALUE. Con la
 * barra llena se usa cualquiera que valga algo, para no desperdiciar la carga que seguiria ganando.
 *
 * Generico por tipo de efecto: un general nuevo con efectos que ya existen no necesita tocar esto; un
 * tipo de efecto nuevo es una entrada en EFFECT_VALUES.
 */
import { isHostile } from './teams';
import { unitTypeOf, weightsOf } from './gameContent';
import type { GeneralEffect as GeneralEffectDef } from './content';
import type { DeepReadonly } from './util/freeze';
import { chargeStars, generalOf, healedByPower } from './generals';
import { MAX_LIFE } from './data';
import { act, type PlayCtx } from './autopilot/context';
import { posKey, squareArea } from './geom';
import { mapGrid } from './mapGrid';
import { visibility } from './rules/visibility';
import type { GameEvent, GameState, Pos, TeamId, Unit } from './model';
import { maxBy } from './util/pick';

/** Un efecto de general tal como esta en el contenido (de solo lectura). */
type GeneralEffect = DeepReadonly<GeneralEffectDef>;

export interface PowerChoice {
  power: string;
  target: Pos | null;
  value: number;
}

/** Donde apuntar un poder y cuanto vale usarla ahi. */
interface ValuedTarget {
  target: Pos | null;
  value: number;
}

/** Lo que vale quitar `life` puntos de vida a una unidad de ese tipo (precio × vida / 100). */
const lifeValue = (s: GameState, life: number, unit: Pick<Unit, 'type'>): number => (life * unitTypeOf(s, unit).cost) / 100;

/** Las casillas en las que se puede centrar un area de `radius` que toque a alguno de `enemies`, sin repetir. */
function areaCentersTouching(s: GameState, enemies: readonly Pos[], radius: number): Pos[] {
  const seen = new Set<string>();
  const centers: Pos[] = [];
  for (const enemy of enemies)
    for (const center of squareArea(mapGrid(s), enemy, radius)) {
      if (seen.has(posKey(center))) continue;
      seen.add(posKey(center));
      centers.push(center);
    }
  return centers;
}

/** Mejor casilla para un daño en area: la que mas valor quita a enemigos que se ven. */
export function bestAreaTarget(
  s: GameState,
  team: TeamId,
  radius: number,
  damage: number,
  minLife: number,
): { target: Pos; value: number } | null {
  const visible = visibility(s, team);
  // Nunca a ciegas en la niebla, y nada que ya no pueda bajar de minLife.
  const enemies = s.units.filter(
    (unit) => isHostile(s, unit.team, team) && unit.carrier === null && unit.life > minLife && visible.at(unit),
  );
  const lifeTaken = (life: number) => Math.max(0, Math.min(damage, life - minLife));
  const valueAt = (center: Pos): number => {
    const area = new Set(squareArea(mapGrid(s), center, radius).map(posKey));
    return enemies.reduce((total, enemy) => total + (area.has(posKey(enemy)) ? lifeValue(s, lifeTaken(enemy.life), enemy) : 0), 0);
  };
  const options = areaCentersTouching(s, enemies, radius).map((target) => ({ target, value: valueAt(target) }));
  return maxBy(options, (option) => option.value);
}

/** Como se valora un tipo de efecto: donde apuntarlo y cuanto vale, o null si no tiene sentido ahora. */
type EffectValue<E extends GeneralEffect> = (s: GameState, team: TeamId, effect: E) => ValuedTarget | null;
type EffectValues = { [Kind in GeneralEffect['kind']]: EffectValue<Extract<GeneralEffect, { kind: Kind }>> };

const EFFECT_VALUES: EffectValues = {
  // El mejor cuadrado sobre los enemigos que ve.
  areaDamage: (s, team, effect) => bestAreaTarget(s, team, effect.radius, effect.damage, effect.minLife),
  // Un valor fijo pequeño, y solo con niebla (sin ella ya lo ve todo).
  reveal: (s) => (s.rules.fog ? { target: null, value: weightsOf(s).REVEALVALUE } : null),
  // La vida que recuperarian sus unidades (lo que ya esta entero no cuenta).
  heal: (s, team, effect) => {
    const healed = (life: number) => Math.min(effect.amount, MAX_LIFE - life);
    const value = healedByPower(s, team, effect).reduce((total, unit) => total + lifeValue(s, healed(unit.life), unit), 0);
    return { target: null, value };
  },
  // El dinero que da (el valor ya es dinero).
  funds: (_s, _team, effect) => ({ target: null, value: effect.amount }),
};

function valueEffect<E extends GeneralEffect>(s: GameState, team: TeamId, effect: E): ValuedTarget | null {
  return (EFFECT_VALUES[effect.kind] as EffectValue<E>)(s, team, effect);
}

/** Que poder usaria ahora la IA (null = ninguna, guarda la carga). */
export function choosePower(s: GameState, team: TeamId): PowerChoice | null {
  const general = generalOf(s, team);
  if (!general || general.state.used) return null;
  const stars = chargeStars(general.state);
  const choices: PowerChoice[] = [];
  for (const power of general.definition.powers) {
    if (power.cost > stars) continue;
    const valued = valueEffect(s, team, power.effect);
    if (valued) choices.push({ power: power.id, ...valued });
  }
  const best = maxBy(choices, (choice) => choice.value);
  if (!best) return null;
  const isChargeFull = stars >= general.definition.charge.max;
  return best.value >= weightsOf(s).GENERALMINVALUE || (isChargeFull && best.value > 0) ? best : null;
}

/** Turno del general de la IA: como mucho un poder. */
export function* aiGeneral(s: GameState, ai: PlayCtx): Generator<GameEvent> {
  const choice = choosePower(s, ai.me);
  if (!choice) return;
  yield* act(s, ai, { kind: 'usePower', power: choice.power, target: choice.target });
}
