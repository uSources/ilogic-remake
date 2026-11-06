/**
 * [CAMBIO] Los poderes de los generales (generals.json, "powers"): si se pueden usar, que hacen y
 * cuanto le valen a quien decide usarlos. Cada clase de efecto es una entrada de `POWER_EFFECTS` con
 * todo lo suyo (si necesita una casilla, su area, como se aplica y lo que vale); su forma y su
 * validacion estan en content/generals.ts (`EFFECT_SHAPES`), con las mismas claves.
 */
import type { GeneralEffect, GeneralPowerDef } from './content';
import { unitTypeOf, weightsOf } from './gameContent';
import { MAX_LIFE } from './data';
import { chargeStars, generalOf, healedByPower } from './generals';
import { posKey, posOf, squareArea } from './geom';
import { mapGrid } from './mapGrid';
import type { ActionRejection, GameEventOf, GameState, GeneralState, Healing, Pos, TeamId, Unit } from './model';
import { earn } from './rules/funds';
import { isRuleOn } from './ruleModules/ruleset';
import { visibility } from './rules/visibility';
import { isHostile } from './teams';
import type { DeepReadonly } from './util/freeze';
import { maxBy } from './util/pick';
import { isOnMap } from './util/predicates';

/** Un efecto de esa clase, como esta en el contenido (de solo lectura). */
type EffectOf<K extends GeneralEffect['kind']> = Extract<DeepReadonly<GeneralEffect>, { kind: K }>;

/** Lo que ha hecho un poder, para su evento. */
interface PowerEffects {
  hits: { uid: number; damage: number }[];
  heals: Healing[];
  funds: number;
}

/** Lo que necesita el efecto de un poder para aplicarse. */
interface EffectContext<K extends GeneralEffect['kind']> {
  s: GameState;
  team: TeamId;
  general: GeneralState;
  effect: EffectOf<K>;
  /** Casilla elegida (los que la necesitan no se pueden usar sin ella: ver powerBlock). */
  target: Pos | null;
  out: PowerEffects;
}

/** Donde apuntar un poder y cuanto vale usarlo ahi (precio × vida / 100, como el resto de la IA). */
export interface ValuedTarget {
  target: Pos | null;
  value: number;
}

/** Todo lo de una clase de efecto. */
interface PowerEffect<K extends GeneralEffect['kind']> {
  /** Hay que elegir una casilla para usarlo. */
  readonly needsTarget: boolean;
  /** Radio del area que se enseña al apuntar (null si no es de area). */
  area(effect: EffectOf<K>): number | null;
  apply(context: EffectContext<K>): void;
  /** Donde apuntarlo y cuanto vale usarlo ahora (null si no tiene sentido): lo que mira la IA. */
  aiValue(s: GameState, team: TeamId, effect: EffectOf<K>): ValuedTarget | null;
}

/** Lo que vale quitar (o devolver) `life` puntos de vida a una unidad de ese tipo (precio × vida / 100). */
const lifeValue = (s: GameState, life: number, unit: Pick<Unit, 'type'>): number => (life * unitTypeOf(s, unit).cost) / 100;

/** La vida que recuperaria la unidad con una cura de `amount` (lo que ya esta entero no cuenta). */
const healedLife = (unit: Unit, amount: number): number => Math.min(amount, MAX_LIFE - unit.life);

/** La vida que le quitaria a la unidad un daño de area sin dejarla por debajo de `minLife` (nunca mata). */
const areaDamageTo = (unit: Unit, effect: EffectOf<'areaDamage'>): number =>
  Math.max(0, Math.min(effect.damage, unit.life - effect.minLife));

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
export function bestAreaTarget(s: GameState, team: TeamId, effect: EffectOf<'areaDamage'>): { target: Pos; value: number } | null {
  const visible = visibility(s, team);
  // Nunca a ciegas en la niebla, y nada que ya no pueda bajar de minLife.
  const enemies = s.units.filter(
    (unit) => isHostile(s, unit.team, team) && unit.carrier === null && unit.life > effect.minLife && visible.at(unit),
  );
  const valueAt = (center: Pos): number => {
    const area = new Set(squareArea(mapGrid(s), center, effect.radius).map(posKey));
    return enemies.reduce((total, enemy) => total + (area.has(posKey(enemy)) ? lifeValue(s, areaDamageTo(enemy, effect), enemy) : 0), 0);
  };
  const options = areaCentersTouching(s, enemies, effect.radius).map((target) => ({ target, value: valueAt(target) }));
  return maxBy(options, (option) => option.value);
}

/** La casilla de un poder que la necesita, ya comprobada (si no la hay, es un fallo de quien lo aplica). */
function checkedTarget(target: Pos | null): Pos {
  if (!target) throw new Error('Un poder de area ya comprobado sin casilla');
  return target;
}

/** Que hace y cuanto vale cada clase de efecto (generals.json, "effect.kind"). */
export const POWER_EFFECTS: { readonly [K in GeneralEffect['kind']]: PowerEffect<K> } = {
  // Ve todo el mapa hasta que acaba la ronda. A la IA le vale poco, y solo con niebla (sin ella ya lo ve todo).
  reveal: {
    needsTarget: false,
    area: () => null,
    apply: ({ general }) => {
      general.reveal = true;
    },
    aiValue: (s) => (isRuleOn(s, 'noFog') ? null : { target: null, value: weightsOf(s).REVEALVALUE }),
  },
  // Daño en un area a los enemigos, sin dejar a nadie por debajo de `minLife` (nunca mata); la IA, en el mejor cuadrado que ve.
  areaDamage: {
    needsTarget: true,
    area: (effect) => effect.radius,
    apply: ({ s, team, effect, target, out }) => {
      const inArea = new Set(squareArea(mapGrid(s), checkedTarget(target), effect.radius).map(posKey));
      for (const unit of s.units) {
        if (!isHostile(s, unit.team, team) || !isOnMap(unit) || !inArea.has(posKey(unit))) continue;
        const damage = areaDamageTo(unit, effect);
        if (damage <= 0) continue;
        unit.life -= damage;
        out.hits.push({ uid: unit.uid, damage });
      }
    },
    aiValue: (s, team, effect) => bestAreaTarget(s, team, effect),
  },
  // Sus unidades recuperan vida; vale la vida que recuperarian.
  heal: {
    needsTarget: false,
    area: () => null,
    apply: ({ s, team, effect, out }) => {
      for (const unit of healedByPower(s, team, effect)) {
        const amount = healedLife(unit, effect.amount);
        if (amount <= 0) continue;
        unit.life += amount;
        out.heals.push({ uid: unit.uid, amount });
      }
    },
    aiValue: (s, team, effect) => {
      const value = healedByPower(s, team, effect).reduce((total, unit) => total + lifeValue(s, healedLife(unit, effect.amount), unit), 0);
      return { target: null, value };
    },
  },
  // Dinero al momento; el valor ya es dinero.
  funds: {
    needsTarget: false,
    area: () => null,
    apply: ({ s, team, effect, out }) => {
      earn(s, team, effect.amount);
      out.funds = effect.amount;
    },
    aiValue: (_s, _team, effect) => ({ target: null, value: effect.amount }),
  },
};

/** La entrada de POWER_EFFECTS de la clase de un efecto. */
function powerEffectOf<K extends GeneralEffect['kind']>(effect: EffectOf<K>): PowerEffect<K> {
  return POWER_EFFECTS[effect.kind];
}

/** Por que no se puede usar un poder (los mismos nombres que da `dispatch` al rechazar la accion). */
export type PowerBlock = Extract<ActionRejection, 'noGeneral' | 'unknownPower' | 'powerUsed' | 'charge' | 'needsTarget'>;

/** Un poder de un general por su id (undefined si ese general no lo tiene). */
export const powerOf = (
  general: { powers: readonly DeepReadonly<GeneralPowerDef>[] },
  powerId: string,
): DeepReadonly<GeneralPowerDef> | undefined => general.powers.find((power) => power.id === powerId);

/** Por que no se puede usar ahora un poder (null = se puede). `target` hace falta en los que apuntan a una casilla. */
export function powerBlock(s: GameState, team: TeamId, powerId: string, target?: Pos | null): PowerBlock | null {
  const general = generalOf(s, team);
  if (!general) return 'noGeneral';
  const power = powerOf(general.definition, powerId);
  if (!power) return 'unknownPower';
  if (general.state.used) return 'powerUsed';
  if (chargeStars(general.state) < power.cost) return 'charge';
  if (powerEffectOf(power.effect).needsTarget && !target) return 'needsTarget';
  return null;
}

/** Radio del area de un poder (null si no es de area). */
export function powerArea(power: DeepReadonly<GeneralPowerDef>): number | null {
  return powerEffectOf(power.effect).area(power.effect);
}

/** Donde usaria la IA un poder y cuanto vale (null si ahora no tiene sentido). */
export function powerValue(s: GameState, team: TeamId, power: DeepReadonly<GeneralPowerDef>): ValuedTarget | null {
  return powerEffectOf(power.effect).aiValue(s, team, power.effect);
}

/** El general de un equipo con poder, ya comprobado (si no lo tiene, es un fallo de quien aplica el poder). */
function checkedPower(s: GameState, team: TeamId, powerId: string) {
  const general = generalOf(s, team);
  const power = general && powerOf(general.definition, powerId);
  if (!general || !power) throw new Error(`El equipo ${team} no tiene el poder ${powerId} ya comprobado`);
  return { general, power };
}

/**
 * Usa un poder, ya comprobado (powerBlock): gasta la carga, la marca como usado este turno y aplica
 * el efecto. Devuelve el evento para animarlo.
 */
export function applyPower(s: GameState, team: TeamId, powerId: string, target: Pos | null): GameEventOf<'power'> {
  const { general, power } = checkedPower(s, team, powerId);
  general.state.charge = Math.max(0, general.state.charge - power.cost);
  general.state.used = true;
  const out: PowerEffects = { hits: [], heals: [], funds: 0 };
  powerEffectOf(power.effect).apply({ s, team, general: general.state, effect: power.effect, target, out });
  return {
    kind: 'power',
    actor: team,
    general: general.definition.id,
    power: power.id,
    ...(target ? { target: posOf(target) } : {}),
    hits: out.hits,
    ...(out.heals.length ? { heals: out.heals } : {}),
    ...(out.funds ? { funds: out.funds } : {}),
  };
}
