/**
 * Lo que sabe un equipo de la partida (`PlayerView`): lo que recibe quien decide por el (los
 * controladores: la IA, el jugador al azar; y las ordenes permanentes que cumple la partida). Quien
 * decide no lee la partida de verdad: lee su vista, que se pone al dia despues de cada accion (la
 * sesion lo hace sola; fuera de una sesion, `seeing`), y propone acciones que la partida comprueba contra la de verdad. Asi la IA no puede
 * esquivar ni perseguir lo que no ve (I2).
 *
 * Lo que no sabe un equipo es una lista (`FOG`): cada entrada quita una cosa de la vista. Lo demas
 * es publico: el mapa, los edificios y de quien son, el general de cada equipo (cual es, si ha usado
 * su poder), el dia y el clima, y las caidas (`TeamState.fell`: la partida las anuncia a todos, «El equipo N queda
 * fuera»). Un enemigo del que no se ve ninguna unidad no ha caido por eso: lo dice lo apuntado,
 * no lo que se ve (y las reglas que cuentan unidades para saber si alguien ha caido miran la
 * partida de verdad, nunca una vista). De los enemigos tampoco se saben sus cuentas (sus
 * estadisticas: lo que han comprado, gastado y perdido, y su ejercito cada dia; su dinero; la carga
 * de su general) ni cuantas unidades y escuadras llevan hechas
 * (`nextUid`, `nextSquadId`: la vista da el siguiente a lo que conoce); esto, aunque la partida no
 * tenga niebla (sin niebla se ven todas las unidades, pero las cuentas de los demas no son de nadie mas).
 * Que la vista sea de solo lectura hasta el fondo lo hacen las envolturas de util/readOnly.ts. Las semillas (dados, decisiones y la del mapa, `setup`) no se
 * ven: el equipo solo sabe la de sus propias decisiones de este turno (`turnSeed`). Ojo: la pantalla
 * enseña a la persona el codigo del mapa (de el salen las semillas de una escaramuza) y son de 32
 * bits; una partida por la red que tenga que guardarlas en secreto no las manda (lo hace el servidor).
 */
import { cloneState } from './gameContent';
import type { ActionPlan, Building, GameState, Rng, TeamId, TeamState, Unit } from './model';
import { unitById } from './rules/queries';
import { sightOf, visibleFoes, type Sight } from './rules/visibility';
import { areAllied, emptyTeamStats, isHostile } from './teams';
import { isAlive, isOnMap } from './util/predicates';
import { turnSeedOf } from './turnSeeds';
import { seededRng } from './util/random';
import { readOnly, REFUSED_CHANGES, shownDescriptor, UNSHOWN_KEYS } from './util/readOnly';

/** Lo que cambia la niebla en la vista (los campos de la partida que se ven de otra forma). */
type FoggedParts = Partial<
  Pick<
    GameState,
    'units' | 'squads' | 'buildings' | 'teams' | 'dice' | 'decisionSeed' | 'setup' | 'undoableMoves' | 'nextUid' | 'nextSquadId'
  >
>;

/** Una cosa que el equipo no sabe: lo que deja ver de esa parte de la partida. */
interface FogRule {
  id: string;
  /** `before`: lo que ya han cambiado las entradas de antes (las unidades que ve, por ejemplo). */
  hide(s: GameState, team: TeamId, sees: Sight, before: FoggedParts): FoggedParts;
}

/**
 * Una unidad de un enemigo como la ve el equipo: sin lo que solo sabe su dueño (sus ordenes, su
 * escuadra y a quien lleva dentro: sus plazas se ven, no quien va en ellas).
 */
function asSeenByEnemy(unit: Unit): Unit {
  const { standingOrder: _order, squad: _squad, ...seen } = unit;
  return { ...seen, cargo: unit.cargo.map(() => null) };
}

/** El equipo sabe de esta unidad: es suya o de un aliado, o es de un enemigo y la ve (fuera de un transporte). */
const isKnownTo =
  (s: GameState, team: TeamId, sees: Sight) =>
  (unit: Unit): boolean =>
    areAllied(s, unit.team, team) || (unit.carrier === null && sees(unit));

/** El siguiente numero despues de los que el equipo conoce (el contador de verdad diria cuantos hay que no ve). */
const nextAfter = (ids: readonly number[]): number => 1 + Math.max(0, ...ids);

/** Lo que un enemigo ve de un equipo: sin sus cuentas (estadisticas, dinero y carga de su general). */
const withoutBooks = (other: TeamState): TeamState => ({
  ...other,
  stats: emptyTeamStats(),
  funds: HIDDEN_FUNDS,
  general: other.general && { ...other.general, charge: HIDDEN_CHARGE },
});

/** Lo que ve un enemigo del dinero y de la carga de un equipo (nada: siempre lo mismo). */
const HIDDEN_FUNDS = 0;
const HIDDEN_CHARGE = 0;

/**
 * Un edificio sin captura que contar: de quien es y nada mas. Sin el campo `capture` (ni a null),
 * para que un edificio que nadie captura se vea siempre igual: si apareciera el campo al empezar
 * una captura escondida, delataria donde la hay.
 */
const withoutCapture = (building: Building): Building => {
  const { capture: _capture, ...rest } = building;
  return rest;
};

/** Lo que el equipo no sabe de la partida, en orden. */
const FOG: readonly FogRule[] = [
  {
    // Las unidades enemigas que no ve, ni lo que llevan dentro los transportes enemigos; de las que
    // ve, solo lo que se ve. Las suyas y las de sus aliados, enteras (comparten lo que ven).
    id: 'unseenUnits',
    hide: (s, team, sees) => ({
      units: s.units.filter(isKnownTo(s, team, sees)).map((unit) => (areAllied(s, unit.team, team) ? unit : asSeenByEnemy(unit))),
    }),
  },
  {
    // Lo que un enemigo lleva en la caja: sus estadisticas (lo que ha comprado, gastado, perdido y
    // capturado, y el valor de su ejercito cada dia, que cuenta las unidades que no se ven), su
    // dinero (diria lo que ha comprado o cobrado sin verlo) y la carga de su general (diria los
    // combates que ha tenido). De su general se sabe cual es, si ha usado su poder y si ha hecho un
    // reconocimiento (es publico: cambia lo que se ve). Solo lo de su alianza se sabe entero.
    id: 'foreignBooks',
    hide: (s, team) => ({
      teams: s.teams.map((other) => (areAllied(s, other.id, team) ? other : withoutBooks(other))),
    }),
  },
  {
    // Los contadores de unidades y escuadras (diria cuantas ha hecho un enemigo sin verlas): el
    // siguiente despues de las que conoce. Asi una copia para simular sigue dando numeros nuevos.
    id: 'counters',
    hide: (s, team, sees, before) => ({
      nextUid: nextAfter((before.units ?? s.units.filter(isKnownTo(s, team, sees))).map((unit) => unit.uid)),
      nextSquadId: nextAfter((s.squads ?? []).filter((squad) => areAllied(s, squad.team, team)).map((squad) => squad.id)),
    }),
  },
  {
    // Las escuadras de los enemigos (y sus ordenes).
    id: 'foreignSquads',
    hide: (s, team) => (s.squads ? { squads: s.squads.filter((squad) => areAllied(s, squad.team, team)) } : {}),
  },
  {
    // Quien captura un edificio en una casilla que no ve (si es un enemigo: lo de los aliados se ve).
    // Un edificio sin captura a la vista se ve siempre igual (sin el campo), lo capture alguien o no.
    id: 'unseenCaptures',
    hide: (s, team, sees) => ({
      buildings: s.buildings.map((building) => {
        const capturer = building.capture?.team;
        const isShownCapture = capturer !== undefined && (areAllied(s, capturer, team) || sees(building));
        return isShownCapture ? building : withoutCapture(building);
      }),
    }),
  },
  {
    // Lo que puede deshacer otro equipo (de donde venian sus unidades, la captura que perdieron). Sin
    // nada que deshacer, sin la lista (como la partida: asi la lista no aparece al moverse un enemigo).
    id: 'othersUndo',
    hide: (s, team) => {
      const own = (s.undoableMoves ?? []).filter((move) => unitById(s, move.uid)?.team === team);
      return { undoableMoves: own.length ? own : undefined };
    },
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
  return FOG.reduce<FoggedParts>((parts, rule) => ({ ...parts, ...rule.hide(s, team, sees, parts) }), {});
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

/**
 * Lo que no cambia en un turno, congelado una vez: el terreno, los ajustes y los modulos de reglas
 * que salen de ellos (estos ya vienen congelados de arriba). La vista es de un turno: si algo de esto
 * cambiara (el laboratorio cambia los ajustes), lo vera la del turno siguiente.
 */
const fixedPartsOf = (s: GameState): Record<string, unknown> => ({
  map: Object.freeze(s.map.map((column) => Object.freeze([...column]))),
  settings: Object.freeze({ ...s.settings }),
  ruleset: s.ruleset,
});

/**
 * La envoltura de la partida de la vista: lo que da `replacing` (lo fijo del turno o lo que cambia la
 * niebla) en lugar de lo de la partida; lo demas, de la partida, de solo lectura.
 */
function viewHandler(
  replacing: (key: string | symbol) => Record<string, unknown> | null,
  guard: (value: unknown) => unknown,
): ProxyHandler<GameState> {
  return {
    // Lo que mas se lee de la vista: sin crear nada por el camino.
    get: (target, key, receiver): unknown => {
      if (UNSHOWN_KEYS.has(key)) return undefined;
      const instead = replacing(key);
      return instead ? Reflect.get(instead, key) : guard(Reflect.get(target, key, receiver));
    },
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      const instead = replacing(key);
      if (!instead) return shownDescriptor(descriptor, guard);
      // Lo que la niebla quita de la partida (`setup`) puede no estar en ella: se da como una propiedad mas.
      const value: unknown = Reflect.get(instead, key);
      return { ...(descriptor ?? { writable: false, enumerable: true }), configurable: descriptor?.configurable ?? true, value };
    },
    ...REFUSED_CHANGES,
  };
}

/**
 * La vista del equipo `team` en la partida `s`: lo que no sabe, quitado; lo demas, la misma partida
 * (sus unidades y edificios son los de verdad, asi se ve lo que les pasa al momento), de solo
 * lectura hasta el fondo: ni la partida ni nada de lo que se lee de ella se puede cambiar.
 */
export function playerView(s: GameState, team: TeamId): PlayerView {
  const guards = new WeakMap<object, object>();
  const fixed = fixedPartsOf(s);
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
  const state = new Proxy(
    s,
    viewHandler(replacing, (value) => readOnly(value, guards)),
  );
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

/**
 * El plan de quien decide por `team` (`planFor`, con la partida tal como la sabe), mirando la vista de
 * su equipo, al dia tras cada accion, fuera de una sesion: lo que hacen las ordenes que cumple la
 * partida al empezar y acabar un turno (actions/turn.ts) y las que empieza la escena al darlas
 * (scenes/game/orders.ts). Asi deciden con lo que sabe el equipo, las cumpla quien las cumpla.
 */
export function decidingAs<Result>(s: GameState, team: TeamId, planFor: (known: GameState) => ActionPlan<Result>): ActionPlan<Result> {
  const view = playerView(s, team);
  return seeing(view, planFor(view.state));
}
