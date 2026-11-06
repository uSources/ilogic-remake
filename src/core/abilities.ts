/**
 * [CAMBIO] Habilidades de las unidades (ajuste `abilities`; no estaban en el juego de 2013).
 *
 * Son pasivas y salen de units.json ("abilities"): el codigo no sabe que unidad tiene cual, solo
 * que hace cada clase. Lo que hace cada clase es lo que aporta a las listas de las reglas
 * (`ABILITY_EFFECTS`: el acierto, la proteccion, por donde se pasa, la vision, la captura), y el
 * modulo de reglas de las habilidades (ruleModules/abilities.ts) lo enchufa todo si la partida las
 * tiene. La IA y la prevision de combate las ven sin saberlo porque pasan por las mismas reglas.
 *
 * Una clase de habilidad nueva: su forma en AbilityDef (content/types.ts), su validacion en
 * ABILITY_SHAPES (content/abilities.ts) y lo que aporta en ABILITY_EFFECTS, aqui.
 *
 * Este modulo no importa rules/ salvo tipos (las reglas no lo importan: lo enchufa su modulo).
 */
import { unitTypeOf } from './gameContent';
import type { AbilityDef, AbilityKind } from './content';
import type { DeepReadonly } from './util/freeze';
import { manhattan, neighbors4 } from './geom';
import { mapGrid } from './mapGrid';
import { isAlive, areEnemies, isOnMap, isRanged } from './util/predicates';
import type { GameState, Pos, Unit } from './model';
import type { Engagement, Fighter } from './rules/engagement';
import type { RuleHooks } from './ruleModules/hooks';

type AbilityOf<K extends AbilityKind> = DeepReadonly<Extract<AbilityDef, { kind: K }>>;
/** Una unidad, o lo que se sabe de su tipo (una prevision, un evento). */
type OfType = Pick<Unit, 'type'>;

/**
 * Habilidad `kind` del tipo de una unidad, si la tiene. Solo para ABILITY_EFFECTS: fuera, que cuente
 * lo dice el modulo de reglas (abilitiesOf, ruleModules/abilities.ts).
 */
const abilityOfUnit = <K extends AbilityKind>(s: GameState, unit: OfType, kind: K): AbilityOf<K> | undefined =>
  unitTypeOf(s, unit).abilities.find((ability): ability is AbilityOf<K> => ability.kind === kind);

/** Puede dar o sufrir efectos de habilidades de otras unidades: en el mapa y con vida. */
const isFieldUnit = (unit: Unit): boolean => isOnMap(unit) && isAlive(unit);

/** Escudo: los ataques a distancia contra quien lo tiene aciertan `factor` veces. 1 = nada. */
function guardFactor(s: GameState, { attacker, defender }: Engagement): number {
  const guard = abilityOfUnit(s, defender.unit, 'guard');
  return guard && isRanged(s, attacker.unit) ? guard.factor : 1;
}

/** Mejor aura de las unidades propias cercanas a `defender` (1 si no hay ninguna). */
export function auraFactor(s: GameState, defender: Fighter): number {
  let best = 1;
  for (const ally of s.units) {
    if (ally.uid === defender.unit.uid || areEnemies(s, ally, defender.unit) || !isFieldUnit(ally)) continue;
    const aura = abilityOfUnit(s, ally, 'aura');
    if (aura && manhattan(ally, defender.at) <= aura.radius) best = Math.min(best, aura.defense);
  }
  return best;
}

/**
 * Casillas en las que `mover` se tiene que parar (zoneOfControl de los enemigos de los que sabe,
 * `noticedFoes`): las de al lado de un enemigo con la habilidad que para a su tipo de movimiento.
 */
function zoneOfControlTiles(s: GameState, mover: Unit, noticedFoes: readonly Unit[]): Pos[] {
  const movement = unitTypeOf(s, mover).movement;
  const stopsMover = (enemy: Unit) => isFieldUnit(enemy) && !!abilityOfUnit(s, enemy, 'zoneOfControl')?.stops.includes(movement);
  return noticedFoes.filter(stopsMover).flatMap((enemy) => neighbors4(mapGrid(s), enemy));
}

/**
 * En que orden entra lo de cada clase en las listas de las reglas. Decide: en el acierto, el escudo
 * multiplica antes que el aura (otro orden cambia el redondeo de la huella). Una clase nueva va aqui
 * tambien (lo mira tests/abilities.test.ts).
 */
export const ABILITY_EFFECT_ORDER: readonly AbilityKind[] = ['guard', 'zoneOfControl', 'aura', 'piercing', 'scout', 'quickCapture'];

/**
 * Lo que aporta cada clase de habilidad a las listas de las reglas (ver AbilityDef), juntas en el
 * orden de ABILITY_EFFECT_ORDER.
 */
export const ABILITY_EFFECTS: { readonly [K in AbilityKind]: RuleHooks } = {
  // Escudo contra los disparos a distancia: hace fuertes a los grupos con quien lo lleva delante.
  guard: { hitModifiers: [{ id: 'guard', factor: guardFactor }] },
  // En una zona de control enemiga se puede entrar, pero no seguir desde ella.
  zoneOfControl: { stopRules: [{ id: 'zoneOfControl', stopTiles: zoneOfControlTiles }] },
  // A las propias de alrededor les aciertan menos (cuenta la mejor).
  aura: { hitModifiers: [{ id: 'aura', factor: (s, fight) => auraFactor(s, fight.defender) }] },
  // Ignora parte de la proteccion del objetivo.
  piercing: {
    coverPiercing: [{ id: 'piercing', ignoredCover: (s, attacker) => abilityOfUnit(s, attacker, 'piercing')?.ignoreCover ?? 0 }],
  },
  // Ve dentro del terreno que esconde (bosque) en todo su radio de vision.
  scout: { coverSight: [{ id: 'scout', seesIntoCover: (s, unit) => !!abilityOfUnit(s, unit, 'scout') }] },
  // Resta mas al capturar.
  quickCapture: { captureFactors: [{ id: 'quickCapture', factor: (s, unit) => abilityOfUnit(s, unit, 'quickCapture')?.factor ?? 1 }] },
};
