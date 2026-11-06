/**
 * Lo que las demas unidades le hacen a quien se mueve: por donde no le dejan pasar, por donde pasa
 * sin poder pararse encima y donde se tiene que parar. `PASS_RULES` dice lo de cualquier partida
 * (otra unidad cierra el paso) y los modulos de reglas ponen delante lo suyo: [CAMBIO] pasar entre
 * aliados (`passAllies`), no saber de los enemigos que no se ven (`ambush`) y la zona de control
 * de algunas unidades (`stopRules`, habilidades).
 */
import { posOf } from '../geom';
import { createLayer } from '../mapGrid';
import type { GameState, Pos, Unit } from '../model';
import type { PassContext, Passage, PassRule } from '../ruleModules/hooks';
import { hooksOf } from '../ruleModules/registry';
import type { Grid } from '../util/grid';
import { areEnemies, isOnMap } from '../util/predicates';
import { sightOf, type Sight } from './visibility';

/** Lo que pasa al entrar en una casilla por quien hay en ella. */
export type TileOccupancy = 'empty' | 'passThrough' | 'blocked';

/** Lo de cualquier partida: otra unidad cierra el paso (las reglas de 2013). Va detras de lo de los modulos. */
export const PASS_RULES: readonly PassRule[] = [{ id: 'occupied', passage: () => 'blocks' }];

/** Todas las reglas de paso de esta partida, en orden: las de sus modulos y luego las de siempre. */
export const passRulesOf = (s: GameState): PassRule[] => [...hooksOf(s, 'passRules'), ...PASS_RULES];

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
  return 'blocks';
}

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
  const rules = passRulesOf(s);
  const context = passContext(s, mover);
  const noticedFoes: Unit[] = [];
  for (const other of s.units) {
    if (!isOnMap(other) || other.uid === mover.uid) continue;
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
