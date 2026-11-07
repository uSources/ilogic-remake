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
 * partida de verdad, nunca una vista). Las semillas (dados, decisiones y la del mapa, `setup`) no se
 * ven: el equipo solo sabe la de sus propias decisiones de este turno (`turnSeed`). Ojo: la pantalla
 * enseña a la persona el codigo del mapa (de el salen las semillas de una escaramuza) y son de 32
 * bits; una partida por la red que tenga que guardarlas en secreto no las manda (lo hace el servidor).
 */
import { turnSeedOf } from './dice';
import type { ActionPlan, Building, GameState, TeamId, Unit } from './model';
import { sightOf, type Sight } from './rules/visibility';
import { areAllied } from './teams';

/** Lo que cambia la niebla en la vista (los campos de la partida que se ven de otra forma). */
type FoggedParts = Partial<Pick<GameState, 'units' | 'squads' | 'buildings' | 'dice' | 'decisionSeed' | 'setup'>>;

/** Una cosa que el equipo no sabe: lo que deja ver de esa parte de la partida. */
interface FogRule {
  id: string;
  hide(s: GameState, team: TeamId, sees: Sight): FoggedParts;
}

/**
 * Una unidad de un enemigo como la ve el equipo: sin lo que solo sabe su dueño (sus ordenes, su
 * escuadra y a quien lleva dentro: sus plazas se ven, no quien va en ellas).
 */
function asSeenByEnemy(unit: Unit): Unit {
  const { standingOrder: _order, squad: _squad, ...seen } = unit;
  return { ...seen, cargo: unit.cargo.map(() => null) };
}

/** Un edificio en una casilla que el equipo no ve, como lo sabe: de quien es, pero no quien lo esta capturando. */
const withoutUnseenCapture = (building: Building): Building => ({ ...building, capture: null });

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
    // Quien captura un edificio en una casilla que no ve (si es un enemigo: lo de los aliados se ve).
    id: 'unseenCaptures',
    hide: (s, team, sees) => ({
      buildings: s.buildings.map((building) => {
        const capturer = building.capture?.team;
        const isHiddenCapture = capturer !== undefined && !areAllied(s, capturer, team) && !sees(building);
        return isHiddenCapture ? withoutUnseenCapture(building) : building;
      }),
    }),
  },
  {
    // El azar de la partida: los dados (se sabria como va a salir cada combate), la semilla de las
    // decisiones (se sabria lo que va a hacer la IA de los demas) y la del mapa (de ella salen las dos
    // en una escaramuza). Lo suyo de este turno lo da la vista aparte (`turnSeed`).
    id: 'seeds',
    hide: () => ({ dice: HIDDEN_SEED, decisionSeed: HIDDEN_SEED, setup: undefined }),
  },
];

/** Lo que ve un equipo de una semilla que no sabe (nada: siempre lo mismo). */
const HIDDEN_SEED = 0;

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
   * suya la sigue viendo como es. No se puede cambiar, ni ella ni nada de lo que se lee de ella
   * (unidades, equipos, edificios...): se proponen acciones.
   */
  readonly state: GameState;
  /** La semilla del azar de las decisiones de su equipo en este turno (`decisionRng` de la partida): lo unico que sabe de ella. */
  readonly turnSeed: number;
  /** Vuelve a mirar la partida (tras una accion, o algo que haya pasado fuera del turno). */
  refresh(): void;
}

/** Lo que se le dice a quien intenta cambiar la vista. */
const READ_ONLY = 'La vista de un equipo no se cambia: quien decide propone acciones';

const refuseChange = (): never => {
  throw new Error(READ_ONLY);
};

/** Un objeto de la partida que hay que proteger: los datos (objetos planos y listas) que no esten ya congelados. */
const needsGuard = (value: unknown): value is object =>
  typeof value === 'object' &&
  value !== null &&
  !Object.isFrozen(value) &&
  (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);

/**
 * Lo mismo que `value`, pero de solo lectura hasta el fondo: lo que se lee de ella tambien lo es.
 * Cada objeto tiene siempre la misma envoltura (`guards`), asi que comparar dos unidades de la vista
 * sigue dando lo que debe.
 */
function readOnly<T>(value: T, guards: WeakMap<object, object>): T {
  if (!needsGuard(value)) return value;
  const known = guards.get(value);
  if (known) return known as T;
  const guarded = new Proxy(value, {
    get: (target, key): unknown => {
      const property: unknown = Reflect.get(target, key);
      // Lo que no es un objeto (numeros, textos) se da tal cual, sin mas: es lo que mas se lee.
      return typeof property === 'object' ? readOnly(property, guards) : property;
    },
    set: refuseChange,
    deleteProperty: refuseChange,
    defineProperty: refuseChange,
  });
  guards.set(value, guarded);
  return guarded;
}

/**
 * La vista del equipo `team` en la partida `s`: lo que no sabe, quitado; lo demas, la misma partida
 * (sus unidades y edificios son los de verdad, asi se ve lo que les pasa al momento), de solo
 * lectura hasta el fondo: ni la partida ni nada de lo que se lee de ella se puede cambiar.
 */
export function playerView(s: GameState, team: TeamId): PlayerView {
  const guards = new WeakMap<object, object>();
  // Lo que no cambia en un turno, congelado una vez: el terreno, los ajustes y los modulos de reglas
  // que salen de ellos (estos ya vienen congelados de arriba). La vista es de un turno: si algo de esto
  // cambiara (el laboratorio cambia los ajustes), lo vera la del turno siguiente.
  const fixed: Record<string, unknown> = {
    map: Object.freeze(s.map.map((column) => Object.freeze([...column]))),
    settings: Object.freeze({ ...s.settings }),
    ruleset: s.ruleset,
  };
  let seen = seenParts(s, team, guards);
  const state = new Proxy(s, {
    get: (target, key, receiver): unknown => {
      if (Reflect.has(fixed, key)) return Reflect.get(fixed, key);
      if (Reflect.has(seen, key)) return Reflect.get(seen, key);
      return readOnly(Reflect.get(target, key, receiver), guards);
    },
    set: refuseChange,
    deleteProperty: refuseChange,
    defineProperty: refuseChange,
  });
  const refresh = () => {
    seen = seenParts(s, team, guards);
  };
  return { team, state, turnSeed: turnSeedOf(s, team), refresh };
}

/** Las listas de la partida que mas se recorren, ya con la niebla. */
const LISTS = ['units', 'buildings', 'teams', 'squads', 'controlPoints', 'undoableMoves'] as const;

/**
 * Lo que ve ahora el equipo de las listas de la partida (con la niebla de FOG): listas congeladas
 * (recorrerlas no pasa por la envoltura) de cosas de solo lectura; y lo demas que cambia FOG.
 * Las listas se vuelven a sacar al poner la vista al dia (tras cada accion).
 */
function seenParts(s: GameState, team: TeamId, guards: WeakMap<object, object>): Record<string, unknown> {
  const fogged = foggedParts(s, team);
  const parts: Record<string, unknown> = { ...fogged };
  for (const key of LISTS) {
    const list: unknown = Reflect.has(fogged, key) ? Reflect.get(fogged, key) : Reflect.get(s, key);
    if (Array.isArray(list)) parts[key] = Object.freeze(list.map((item: unknown) => readOnly(item, guards)));
  }
  return parts;
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
