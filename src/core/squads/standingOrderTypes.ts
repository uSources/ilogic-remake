/**
 * [CAMBIO] Los tipos de orden permanente (`STANDING_ORDER_TYPES`): que es cada uno (cuando se cumple,
 * si es de cada unidad, si guarda el sitio, si toma el edificio, si es un viaje...), cuando no se
 * puede dar y donde va en el menu. Lo demas pregunta aqui en vez de por un tipo concreto. Las
 * consultas de que orden cumple cada unidad estan en standingOrderQueries.ts y los pasos que las
 * cambian, en standingOrderSteps.ts.
 */
import { buildingAt } from '../rules/queries';
import { canFight, isCapturer, isOnMap } from '../util/predicates';
import { travelProblem, type TravelProblem } from '../rules/travel';
import { areAllied } from '../teams';
import type {
  ActionRejection,
  GameState,
  Pos,
  Squad,
  StandingOrder,
  StandingOrderKind,
  StandingOrderKinds,
  StandingOrderMoment,
  TeamId,
  TurnEndOrder,
  TurnEndOrderKind,
  Unit,
} from '../model';

/** El edificio de esa casilla ya es de la alianza de `team` (o no hay): no hay nada que capturar. */
export function isOwnedOrMissing(s: GameState, team: TeamId, at: Pos): boolean {
  const building = buildingAt(s, at);
  return !building || (building.owner !== null && areAllied(s, building.owner, team));
}

/** Por que no se puede dar una orden permanente (los mismos nombres que da `dispatch` al rechazarla). */
export type StandingOrderBlock = Extract<ActionRejection, 'noBuilding' | 'noCapturer' | 'noFighter' | 'transported'> | TravelProblem;

type BlockCheck = (s: GameState, team: TeamId, at: Pos, units: readonly Unit[]) => StandingOrderBlock | null;

/** Lo que se sabe de la casilla al ofrecer las ordenes en ella (clic derecho o pulsacion larga con unidades elegidas). */
export interface OrderPlace {
  /** Hay un enemigo que quien mira ve en esa casilla. */
  readonly enemyHere: boolean;
  /** Esta orden se puede dar ahi a esas unidades (su `block`). */
  readonly canGive: () => boolean;
}

/** Como la cumple quien no puede cumplirla (con capturar, las que no capturan: escoltan atacando al mismo sitio). */
interface Escort {
  readonly canFulfil: (s: GameState, unit: Unit) => boolean;
  readonly as: TurnEndOrderKind;
}

/** Lo que hay que saber de un tipo de orden permanente. */
interface StandingOrderType<Kind extends StandingOrderKind> {
  /** Como se dice (para depurar y la partida por texto). */
  readonly name: string;
  /**
   * Cuando la cumple la unidad en el turno de su equipo: al empezarlo (la de ir alli: avanza y
   * despues quien juega puede seguir con ella) o al acabarlo (las de pelear, con lo que no se ha usado).
   */
  readonly moment: StandingOrderKinds[Kind];
  /** Es siempre de cada unidad (nunca de su escuadra), la acaba moverla a mano y capturar de paso no la cambia. */
  readonly unitOnly: boolean;
  /** Por que no se puede dar ahi a esas unidades (null = se puede). */
  readonly block: BlockCheck;
  /** Quien no la puede cumplir va con otra (ver Escort); sin esto, todas la cumplen igual. */
  readonly escort?: Escort;
  /**
   * Es quedarse guardando el sitio: la que se da al parar a una unidad que seguia a su escuadra, y
   * en formacion no va con las que avanzan (las demas, aunque sean de otro tipo, si).
   */
  readonly holdsPosition: boolean;
  /** Es tomar el edificio del destino: la que se queda quien empieza a capturar a mano. */
  readonly takesBuilding: boolean;
  /** Si la llevan todas las de una escuadra (unas de escolta), es esta la que pasa a la escuadra. */
  readonly leadsSquad: boolean;
  /**
   * Cuando esta cumplida para su escuadra (`finishStandingOrder`): las de cada unidad no llegan aqui.
   * `followersArrived`: si ya han llegado todas las que la siguen (lo mira quien pregunta).
   */
  readonly squadDone: (s: GameState, squad: Squad, at: Pos, followersArrived: () => boolean) => boolean;
  /** Es un viaje: la unidad va hasta su destino (`gotoDestination`), y no pelea por el camino. */
  readonly travels: boolean;
  /** Su puesto en el menu de ordenes de una casilla (menor, antes), o null si ahi no se ofrece. */
  readonly menuRank: (place: OrderPlace) => number | null;
}

/** Atacar y defender: alguna tiene que poder luchar. */
const needsFighter: BlockCheck = (s, _team, _at, units) => (units.some((unit) => canFight(s, unit)) ? null : 'noFighter');

/** Cumplida para la escuadra cuando han llegado todas las que la siguen. */
const whenAllArrive: StandingOrderType<StandingOrderKind>['squadDone'] = (_s, _squad, _at, followersArrived) => followersArrived();

/** Nunca es de una escuadra (`unitOnly`). */
const neverForSquads = (): boolean => false;

/**
 * Cada tipo de orden permanente, con todo lo suyo (el tipo obliga a tener uno por tipo, con su
 * momento). Un tipo nuevo es su linea en `StandingOrderKinds` (model/standingOrder.ts), su entrada
 * aqui y como se juega en `STANDING_ORDER_TURNS` (autopilot/standingOrders.ts).
 */
export const STANDING_ORDER_TYPES: { readonly [Kind in StandingOrderKind]: StandingOrderType<Kind> } = {
  attack: {
    name: 'atacar',
    moment: 'turnEnd',
    unitOnly: false,
    block: needsFighter,
    holdsPosition: false,
    takesBuilding: false,
    leadsSquad: false,
    travels: false,
    squadDone: whenAllArrive,
    // Con un enemigo a la vista ahi, lo primero.
    menuRank: ({ enemyHere }) => (enemyHere ? 0 : 1),
  },
  capture: {
    name: 'capturar',
    moment: 'turnEnd',
    unitOnly: false,
    block: (s, team, at, units) => {
      if (isOwnedOrMissing(s, team, at)) return 'noBuilding';
      return units.some((unit) => isCapturer(s, unit)) ? null : 'noCapturer';
    },
    escort: { canFulfil: isCapturer, as: 'attack' },
    holdsPosition: false,
    takesBuilding: true,
    leadsSquad: true,
    travels: false,
    squadDone: (s, squad, at) => isOwnedOrMissing(s, squad.team, at),
    // Solo si estas unidades pueden tomar el edificio; sin enemigo a la vista, lo primero.
    menuRank: ({ enemyHere, canGive }) => (!canGive() ? null : enemyHere ? 1 : 0),
  },
  defend: {
    name: 'defender',
    moment: 'turnEnd',
    unitOnly: false,
    block: needsFighter,
    holdsPosition: true,
    takesBuilding: false,
    leadsSquad: false,
    travels: false,
    squadDone: whenAllArrive,
    // Siempre se puede, la ultima.
    menuRank: () => 2,
  },
  goto: {
    name: 'ir',
    moment: 'turnStart',
    unitOnly: true,
    holdsPosition: false,
    takesBuilding: false,
    leadsSquad: false,
    travels: true,
    squadDone: neverForSquads,
    // Ir alli se da moviendo (el viaje), no desde el menu de ordenes de una casilla.
    menuRank: () => null,
    // Cada una tiene que poder ir (en el mapa, a donde no llegue ya este turno: travelProblem).
    block: (s, _team, at, units) => {
      for (const unit of units) {
        const problem = isOnMap(unit) ? travelProblem(s, unit, at) : 'transported';
        if (problem) return problem;
      }
      return null;
    },
  },
};

/** Los tipos de orden permanente que hay (para comprobar los que vienen de fuera, como una partida guardada). */
export const STANDING_ORDER_KINDS = Object.keys(STANDING_ORDER_TYPES) as readonly StandingOrderKind[];

/** El valor es un tipo de orden permanente. */
export const isStandingOrderKind = (value: unknown): value is StandingOrderKind => STANDING_ORDER_KINDS.some((kind) => kind === value);

/** Cuando se cumple una orden de ese tipo en el turno de su equipo. */
export const momentOf = (kind: StandingOrderKind): StandingOrderMoment => STANDING_ORDER_TYPES[kind].moment;

/** El valor es un tipo de orden de pelear (de las que se cumplen al acabar el turno). */
export const isTurnEndOrderKind = (value: unknown): value is TurnEndOrderKind =>
  isStandingOrderKind(value) && momentOf(value) === 'turnEnd';

/** Las de ese tipo son de cada unidad (ver StandingOrderType.unitOnly). */
export const isUnitOnly = (kind: StandingOrderKind): boolean => STANDING_ORDER_TYPES[kind].unitOnly;

/** El tipo de orden que es quedarse guardando el sitio (`holdsPosition`). */
export const holdingKind = (): StandingOrderKind => kindWith('holdsPosition');
/** El tipo de orden que es tomar el edificio del destino (`takesBuilding`). */
export const capturingKind = (): StandingOrderKind => kindWith('takesBuilding');

/** El tipo de orden que dice que si a `field` (tiene que haber uno: lo comprueba tests/standingOrders.test.ts). */
function kindWith(field: 'holdsPosition' | 'takesBuilding'): StandingOrderKind {
  const kind = STANDING_ORDER_KINDS.find((candidate) => STANDING_ORDER_TYPES[candidate][field]);
  if (!kind) throw new Error(`Ningun tipo de orden tiene ${field}`);
  return kind;
}

/** La orden es de las que se cumplen al acabar el turno (las de pelear). */
export const isTurnEndOrder = (order: StandingOrder): order is TurnEndOrder => isTurnEndOrderKind(order.kind);
