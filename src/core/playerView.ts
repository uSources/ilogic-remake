/**
 * Lo que sabe un equipo de la partida (`PlayerView`): lo que recibe quien decide por el (los
 * controladores: la IA, el jugador al azar; y las ordenes permanentes que cumple la partida). Quien
 * decide no lee la partida de verdad: lee su vista, que se pone al dia despues de cada accion (la
 * sesion lo hace sola; fuera de una sesion, `seeing`), y propone acciones que la partida comprueba contra la de verdad. Asi la IA no puede
 * esquivar ni perseguir lo que no ve (I2).
 *
 * Lo que no sabe un equipo es una lista (`FOG`): cada entrada quita una cosa de la vista. Lo demas
 * es publico: el mapa, los edificios y de quien son, el dinero y el general de cada equipo, el dia
 * y el clima, y las caidas (`TeamState.fell`: la partida las anuncia a todos, «El equipo N queda
 * fuera»). Un enemigo del que no se ve ninguna unidad no ha caido por eso: lo dice lo apuntado,
 * no lo que se ve (y las reglas que cuentan unidades para saber si alguien ha caido miran la
 * partida de verdad, nunca una vista).
 */
import type { ActionPlan, GameState, TeamId, Unit } from './model';
import { sightOf, type Sight } from './rules/visibility';
import { areAllied } from './teams';

/** Lo que cambia la niebla en la vista (los campos de la partida que se ven de otra forma). */
type FoggedParts = Partial<Pick<GameState, 'units' | 'squads' | 'dice'>>;

/** Una cosa que el equipo no sabe: lo que deja ver de esa parte de la partida. */
interface FogRule {
  id: string;
  hide(s: GameState, team: TeamId, sees: Sight): FoggedParts;
}

/** Una unidad de un enemigo como la ve el equipo: sin lo que solo sabe su dueño (sus ordenes y su escuadra). */
function asSeenByEnemy(unit: Unit): Unit {
  const { standingOrder: _order, squad: _squad, ...seen } = unit;
  return seen;
}

/** Lo que el equipo no sabe de la partida, en orden. */
const FOG: readonly FogRule[] = [
  {
    // Las unidades enemigas que no ve, ni lo que llevan dentro los transportes enemigos; de las que
    // ve, solo lo que se ve. Las suyas y las de sus aliados, enteras (comparten lo que ven).
    id: 'unseenUnits',
    hide: (s, team, sees) => ({
      units: s.units.flatMap((unit) => {
        if (areAllied(s, unit.team, team)) return [unit];
        return unit.carrier === null && sees(unit) ? [asSeenByEnemy(unit)] : [];
      }),
    }),
  },
  {
    // Las escuadras de los enemigos (y sus ordenes).
    id: 'foreignSquads',
    hide: (s, team) => (s.squads ? { squads: s.squads.filter((squad) => areAllied(s, squad.team, team)) } : {}),
  },
  {
    // Los dados de la partida: con ellos se sabria como va a salir cada combate.
    id: 'dice',
    hide: () => ({ dice: HIDDEN_DICE }),
  },
];

/** Lo que ve un equipo de los dados (nada: siempre lo mismo). */
const HIDDEN_DICE = 0;

/** Lo que el equipo `team` ve distinto de la partida ahora mismo (lo que deja cada entrada de FOG). */
function foggedParts(s: GameState, team: TeamId): FoggedParts {
  const sees = sightOf(s, team);
  return FOG.reduce<FoggedParts>((parts, rule) => ({ ...parts, ...rule.hide(s, team, sees) }), {});
}

/** Las unidades que conoce el equipo `team` (las suyas y las de sus aliados, y lo que ve de las enemigas). */
export const unitsKnownTo = (s: GameState, team: TeamId): Unit[] => foggedParts(s, team).units ?? s.units;

export interface PlayerView {
  /** El equipo que mira. */
  readonly team: TeamId;
  /**
   * La partida tal como la sabe el equipo (sin lo que quita FOG). Es el mismo objeto todo el turno:
   * se pone al dia con `refresh` (lo hace `seeing` tras cada accion), asi quien guarda una unidad
   * suya la sigue viendo como es. No se puede cambiar: se proponen acciones.
   */
  readonly state: GameState;
  /** Vuelve a mirar la partida (tras una accion, o algo que haya pasado fuera del turno). */
  refresh(): void;
}

/**
 * La vista del equipo `team` en la partida `s`: lo que no sabe, quitado; lo demas, la misma partida
 * (sus unidades y edificios son los de verdad, asi se ve lo que les pasa al momento).
 */
export function playerView(s: GameState, team: TeamId): PlayerView {
  let fogged = foggedParts(s, team);
  const state = new Proxy(s, {
    get: (target, key, receiver): unknown => (Reflect.has(fogged, key) ? Reflect.get(fogged, key) : Reflect.get(target, key, receiver)),
    set: () => {
      throw new Error('La vista de un equipo no se cambia: quien decide propone acciones');
    },
    deleteProperty: () => {
      throw new Error('La vista de un equipo no se cambia: quien decide propone acciones');
    },
  });
  const refresh = () => {
    fogged = foggedParts(s, team);
  };
  return { team, state, refresh };
}

/**
 * El plan con la vista al dia fuera de una sesion (el paso de fin de turno, la partida por texto, los
 * tests): tras el resultado de cada accion que propone, `view` vuelve a mirar la partida. En una
 * sesion no hace falta: la sesion pone al dia la vista de quien juega tras cada accion.
 */
export function* seeing<Result>(view: PlayerView, plan: ActionPlan<Result>): ActionPlan<Result> {
  for (let step = plan.next(); ;) {
    if (step.done) return step.value;
    const result = yield step.value;
    view.refresh();
    step = plan.next(result);
  }
}
