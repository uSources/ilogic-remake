/**
 * Lo que las demas unidades le hacen a quien se mueve: por donde no le dejan pasar, por donde pasa
 * sin poder pararse encima y donde se tiene que parar. Si ninguna regla dice nada, lo de cualquier
 * partida: otra unidad cierra el paso (las reglas de 2013). Los modulos de reglas ponen lo suyo,
 * todo nuevo [CAMBIO]: pasar entre aliados (`passAllies`), no saber de los enemigos que no se ven
 * (`ambush`) y la zona de control de algunas unidades (`stopRules`, habilidades).
 */
import { posOf } from '../geom';
import { createLayer } from '../mapGrid';
import type { GameState, Pos, Unit } from '../model';
import type { PassContext, Passage, PassRule } from '../ruleModules/hooks';
import { hooksOf } from '../ruleModules/ruleset';
import type { Grid } from '../util/grid';
import { areEnemies, isOnMap } from '../util/predicates';
import type { Blockers } from './distance';
import { sightOf, type Sight } from './visibility';

/** Lo que pasa al entrar en una casilla por quien hay en ella. */
export type TileOccupancy = 'empty' | 'passThrough' | 'blocked';

/**
 * Regla de paso: de los enemigos que su equipo no ve no se sabe (como si no hubiera nadie). La pone
 * el modulo de la emboscada y la IA al planear en grupo (PLANS_WITH_WHAT_IT_SEES).
 */
export const UNSEEN_FOES_UNNOTICED: PassRule = {
  id: 'unseenFoes',
  passage: ({ s, mover, sees }, other) => (areEnemies(s, other, mover) && !sees(other) ? 'unnoticed' : null),
};

/** Lo de cualquier partida, si ninguna regla dice nada: otra unidad cierra el paso (las reglas de 2013). */
const UNLESS_A_RULE_SAYS: Passage = 'blocks';

/** Lo que sabe quien se mueve, para preguntarselo a las reglas (lo que ve su equipo se mira solo si alguna lo pide). */
function passContext(s: GameState, mover: Unit): PassContext {
  let sight: Sight | null = null;
  return { s, mover, sees: (pos) => (sight ??= sightOf(s, mover.team))(pos) };
}

/** Lo que es `other` para quien se mueve: la primera regla que dice algo. */
function passageOf(rules: readonly PassRule[], context: PassContext, other: Unit): Passage {
  for (const rule of rules) {
    const passage = rule.passage(context, other);
    if (passage) return passage;
  }
  return UNLESS_A_RULE_SAYS;
}

/** Las demas unidades del mapa (no `mover` ni las que van dentro de un transporte). */
const othersOnMap = (s: GameState, mover: Unit): Unit[] => s.units.filter((other) => isOnMap(other) && other.uid !== mover.uid);

/** Lo que una casilla con una unidad asi le hace a quien se mueve (si no sabe que esta, como si no hubiera nadie). */
const TILE_OF: Record<Passage, TileOccupancy> = { blocks: 'blocked', passThrough: 'passThrough', unnoticed: 'empty' };

/** Lo que encuentra en cada casilla quien se mueve, y donde se tiene que parar. */
export interface Surroundings {
  readonly tiles: Grid<TileOccupancy>;
  /** Casillas en las que tiene que pararse al entrar (puede salir el turno siguiente). */
  readonly mustStop: Grid<boolean>;
}

/**
 * [CAMBIO] Lo que encuentra `mover` en cada casilla y donde tiene que pararse, segun las reglas de
 * paso de la partida. Solo cuentan para pararse los enemigos de los que sabe.
 */
export function surroundingsOf(s: GameState, mover: Unit): Surroundings {
  const tiles = createLayer<TileOccupancy>(s, 'empty');
  const rules = hooksOf(s, 'passRules');
  const context = passContext(s, mover);
  const noticedFoes: Unit[] = [];
  for (const other of othersOnMap(s, mover)) {
    const passage = passageOf(rules, context, other);
    tiles.set(other, TILE_OF[passage]);
    if (passage !== 'unnoticed' && areEnemies(s, other, mover)) noticedFoes.push(other);
  }
  return { tiles, mustStop: stopsFor(s, mover, noticedFoes) };
}

/** Las casillas en las que `mover` tiene que pararse por los enemigos de los que sabe (lo de los modulos). */
function stopsFor(s: GameState, mover: Unit, noticedFoes: readonly Unit[]): Grid<boolean> {
  const mustStop = createLayer(s, false);
  const stops: Pos[] = hooksOf(s, 'stopRules').flatMap((rule) => rule.stopTiles(s, mover, noticedFoes));
  for (const tile of stops) mustStop.set(posOf(tile), true);
  return mustStop;
}

/**
 * Lo que corta el paso a `mover` al medir distancias (distanceMap), segun las reglas de paso de la
 * partida con `firstRules` delante: las casillas de las unidades que le cierran el paso.
 */
export function passBlockers(s: GameState, mover: Unit, firstRules: readonly PassRule[] = []): Blockers {
  const rules = [...firstRules, ...hooksOf(s, 'passRules')];
  const context = passContext(s, mover);
  const blocked = createLayer(s, false);
  for (const other of othersOnMap(s, mover)) if (passageOf(rules, context, other) === 'blocks') blocked.set(other, true);
  return (pos) => blocked.at(pos);
}

/**
 * Las reglas de paso de la partida dejan atravesar a los aliados: lo dice la primera que habla de
 * ellos (`allies`). Da lo mismo que passageOf con cualquier aliado porque las reglas cumplen el
 * contrato de `allies` (PassRule): las que no lo ponen no dicen nada de los aliados.
 */
export const letsAlliesThrough = (s: GameState): boolean =>
  hooksOf(s, 'passRules').find((rule) => rule.allies !== undefined)?.allies === 'passThrough';
