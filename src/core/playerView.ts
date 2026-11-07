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
import { cloneState } from './gameContent';
import type { ActionPlan, Building, GameState, Rng, TeamId, Unit } from './model';
import { unitById } from './rules/queries';
import { sightOf, visibleFoes, type Sight } from './rules/visibility';
import { areAllied, isHostile } from './teams';
import { isAlive, isOnMap } from './util/predicates';
import { turnSeedOf } from './turnSeeds';
import { seededRng } from './util/random';

/** Lo que cambia la niebla en la vista (los campos de la partida que se ven de otra forma). */
type FoggedParts = Partial<Pick<GameState, 'units' | 'squads' | 'buildings' | 'dice' | 'decisionSeed' | 'setup' | 'undoableMoves'>>;

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
    // Lo que puede deshacer otro equipo (de donde venian sus unidades, la captura que perdieron).
    id: 'othersUndo',
    hide: (s, team) => (s.undoableMoves ? { undoableMoves: s.undoableMoves.filter((move) => unitById(s, move.uid)?.team === team) } : {}),
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

/** Lo que el equipo `team` ve distinto de la partida ahora mismo, viendo lo que dice `sees` (lo que deja cada entrada de FOG). */
function foggedParts(s: GameState, team: TeamId, sees: Sight = sightOf(s, team)): FoggedParts {
  return FOG.reduce<FoggedParts>((parts, rule) => ({ ...parts, ...rule.hide(s, team, sees) }), {});
}

/**
 * Una copia de la partida tal como la sabe el equipo `team` (con todo lo que quita FOG), para simular
 * en ella lo que haria (la prevision de sus ordenes): se puede cambiar sin tocar la de verdad, y lo
 * que se simule no puede delatar lo que el equipo no ve.
 */
export function foggedCopy(s: GameState, team: TeamId): GameState {
  const copy = cloneState(s);
  return Object.assign(copy, foggedParts(copy, team));
}

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
  /** La semilla del azar de las decisiones de su equipo en este turno (`turnSeedOf` de la partida): lo unico que sabe de ella. */
  readonly turnSeed: number;
  /** Vuelve a mirar la partida (tras una accion, o algo que haya pasado fuera del turno). */
  refresh(): void;
}

/**
 * El azar de las decisiones de quien decide con esta vista, en este turno: el mismo cada vez que se
 * juegue el turno (al cargar, al repetir, por la red). Es el unico azar de quien decide: los dados son
 * de las reglas y la semilla de la partida no se ve en la vista.
 */
export const decisionRngOf = (view: PlayerView): Rng => seededRng(view.turnSeed);

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
 * Lo que no deja hacer ninguna envoltura de la vista: cambiar algo, ni por la puerta de atras
 * (definir una propiedad, cambiar el prototipo, cerrar el objeto para que no crezca).
 */
const REFUSED_CHANGES = {
  set: refuseChange,
  deleteProperty: refuseChange,
  defineProperty: refuseChange,
  setPrototypeOf: refuseChange,
  preventExtensions: refuseChange,
} as const;

/**
 * El descriptor de una propiedad con su valor como se lee por la envoltura (`shown`): pedir el
 * descriptor (`Object.getOwnPropertyDescriptor`) da lo mismo que leerla, nunca el objeto de verdad.
 * Una propiedad que no se puede ni reconfigurar ni escribir se tiene que dar tal cual (lo exige
 * Proxy); en la partida no hay ninguna con algo que proteger.
 */
function shownDescriptor(descriptor: PropertyDescriptor | undefined, shown: (value: unknown) => unknown): PropertyDescriptor | undefined {
  if (!descriptor || !('value' in descriptor) || (!descriptor.configurable && !descriptor.writable)) return descriptor;
  return { ...descriptor, value: shown(descriptor.value) };
}

/**
 * Lo mismo que `value`, pero de solo lectura hasta el fondo: lo que se lee de ella tambien lo es.
 * Cada objeto tiene siempre la misma envoltura (`guards`), asi que comparar dos unidades de la vista
 * sigue dando lo que debe.
 */
function readOnly<T>(value: T, guards: WeakMap<object, object>): T {
  if (!needsGuard(value)) return value;
  const known = guards.get(value);
  if (known) return known as T;
  const guard = (property: unknown): unknown => readOnly(property, guards);
  const guarded = new Proxy(value, {
    get: (target, key): unknown => {
      const property: unknown = Reflect.get(target, key);
      // Lo que no es un objeto (numeros, textos) se da tal cual, sin mas: es lo que mas se lee.
      return typeof property === 'object' ? guard(property) : property;
    },
    getOwnPropertyDescriptor: (target, key) => shownDescriptor(Reflect.getOwnPropertyDescriptor(target, key), guard),
    ...REFUSED_CHANGES,
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
  // Lo que ve ahora: se vuelve a mirar la primera vez que se lee algo despues de `refresh` (tras una
  // accion), no en cada una: varias acciones seguidas sin mirar no cuestan nada.
  let current: SeenNow | null = null;
  const seenNow = (): SeenNow => (current ??= seenNowIn(s, team, guards));
  /** Donde esta lo que la vista da en lugar de lo de la partida (lo fijo del turno o lo que cambia la niebla), o null. */
  const replacing = (key: string | symbol): Record<string, unknown> | null => {
    if (Reflect.has(fixed, key)) return fixed;
    const { parts } = seenNow();
    return Reflect.has(parts, key) ? parts : null;
  };
  const state = new Proxy(s, {
    // Lo que mas se lee de la vista: sin crear nada por el camino.
    get: (target, key, receiver): unknown => {
      const instead = replacing(key);
      return instead ? Reflect.get(instead, key) : readOnly(Reflect.get(target, key, receiver), guards);
    },
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      const instead = replacing(key);
      if (!instead) return shownDescriptor(descriptor, (value) => readOnly(value, guards));
      // Lo que la niebla quita de la partida (`setup`) puede no estar en ella: se da como una propiedad mas.
      const value: unknown = Reflect.get(instead, key);
      return { ...(descriptor ?? { writable: false, enumerable: true }), configurable: descriptor?.configurable ?? true, value };
    },
    ...REFUSED_CHANGES,
  });
  const refresh = () => {
    current = null;
  };
  VIEW_SIGHTS.set(state, { team, sees: (pos) => seenNow().sees(pos) });
  return { team, state, turnSeed: turnSeedOf(s, team), refresh };
}

/** Lo que ve el equipo de la vista ahora: sus listas y demas partes con niebla, y lo que ve (`sees`, calculado una vez). */
interface SeenNow {
  parts: Record<string, unknown>;
  sees: Sight;
}

/** Lo que ve cada vista que hay (por su partida, `PlayerView.state`): de que equipo es y lo que ve ahora. */
const VIEW_SIGHTS = new WeakMap<GameState, { team: TeamId; sees: Sight }>();

/** Lo que ve ahora la vista de `team` cuya partida es `s`, o null si `s` no es la vista de ese equipo. */
const viewSightOf = (s: GameState, team: TeamId): Sight | null => {
  const view = VIEW_SIGHTS.get(s);
  return view?.team === team ? view.sees : null;
};

/**
 * Lo que ve el equipo `team`: en su vista, lo que ve desde que se puso al dia (calculado una vez, al
 * mirarla); en otra partida (una copia para simular), lo que ve en ella ahora (`sightOf`).
 */
export const sightIn = (s: GameState, team: TeamId): Sight => viewSightOf(s, team) ?? sightOf(s, team);

/**
 * Los enemigos de `team` que conoce: en su vista, los que hay en ella (la niebla ya ha quitado los
 * que no ve, asi que no hace falta volver a mirar: lo mismo que `visibleFoes`, sin calcular la
 * vision); en otra partida, los que ve en ella ahora (`visibleFoes`). Lo que usa quien decide.
 */
export function knownFoes(s: GameState, team: TeamId): Unit[] {
  if (!viewSightOf(s, team)) return visibleFoes(s, team);
  return s.units.filter((unit) => isHostile(s, team, unit.team) && isOnMap(unit) && isAlive(unit));
}

/** Las listas de la partida que mas se recorren, ya con la niebla. */
const LISTS = ['units', 'buildings', 'teams', 'squads', 'controlPoints', 'undoableMoves'] as const;

/**
 * Lo que ve ahora el equipo de las listas de la partida (con la niebla de FOG): listas congeladas
 * (recorrerlas no pasa por la envoltura) de cosas de solo lectura; y lo demas que cambia FOG.
 * Las listas se vuelven a sacar la primera vez que se mira la vista despues de ponerla al dia.
 */
function seenNowIn(s: GameState, team: TeamId, guards: WeakMap<object, object>): SeenNow {
  const sees = sightOf(s, team);
  const fogged = foggedParts(s, team, sees);
  const parts: Record<string, unknown> = { ...fogged };
  for (const key of LISTS) {
    const list: unknown = Reflect.has(fogged, key) ? Reflect.get(fogged, key) : Reflect.get(s, key);
    if (Array.isArray(list)) parts[key] = Object.freeze(list.map((item: unknown) => readOnly(item, guards)));
  }
  return { parts, sees };
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
