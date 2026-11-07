/**
 * [CAMBIO] Ordenes permanentes de cada equipo (estilo RTS): la de cada escuadra y la propia de cada unidad
 * (destacada). Las consultas (que orden cumple cada una, si se puede dar) las usan la escena y quien las
 * cumple, que es la partida para todos los equipos (autopilot/standingOrders.ts, en los pasos de turno),
 * no la IA. Los pasos que las cambian (`giveStandingOrder`, `cancelStandingOrder`, `finishStandingOrder`,
 * `keepCapturing`, `liftStandingOrder`) solo los llaman las acciones (`APPLY_STEPS`, eslint.config.js).
 */
import { manhattan, samePos, posOf } from '../geom';
import { buildingAt, teamUnits } from '../rules/queries';
import { canFight, isAlive, isCapturer, isOnMap } from '../util/predicates';
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
import { squadById, squadUnits } from './queries';

/** La orden es de las que se cumplen al acabar el turno (las de pelear). */
const isTurnEndOrder = (order: StandingOrder): order is TurnEndOrder => isTurnEndOrderKind(order.kind);

export const sameStandingOrder = (first: StandingOrder, second: StandingOrder): boolean =>
  first.kind === second.kind && samePos(first.at, second.at);

const copyStandingOrder = <Order extends StandingOrder>(standingOrder: Order): Order => ({
  ...standingOrder,
  at: posOf(standingOrder.at),
});

/** La orden tal como la cumple esta unidad: la que no puede cumplirla va de escolta (`escort`: con capturar, atacar). */
export function forUnit<Order extends StandingOrder>(s: GameState, unit: Unit, standingOrder: Order): Order {
  const escort = STANDING_ORDER_TYPES[standingOrder.kind].escort;
  const kind = escort && !escort.canFulfil(s, unit) ? escort.as : standingOrder.kind;
  return { ...copyStandingOrder(standingOrder), kind };
}

/**
 * [CAMBIO] La orden que cumple la unidad: la suya propia si la tiene (destacada) y si no la de su
 * escuadra (adaptada: escolta en una captura). undefined = no tiene orden.
 */
export function effectiveStandingOrder(s: GameState, unit: Unit): StandingOrder | undefined {
  if (unit.standingOrder) return unit.standingOrder;
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return squadOrder ? forUnit(s, unit, squadOrder) : undefined;
}

/** La orden que cumple la unidad en ese momento de su turno (`momentOf`), si la tiene. */
export function standingOrderAt(s: GameState, unit: Unit, moment: StandingOrderMoment): StandingOrder | undefined {
  const order = effectiveStandingOrder(s, unit);
  return order && momentOf(order.kind) === moment ? order : undefined;
}

/** La orden de pelear (atacar, capturar, defender) que cumple al acabar el turno: la que se enseña como orden. */
export function turnEndOrderOf(s: GameState, unit: Unit): TurnEndOrder | undefined {
  const order = effectiveStandingOrder(s, unit);
  return order && isTurnEndOrder(order) ? order : undefined;
}

/** A donde va con su orden de ir alli ('goto'), si la lleva. */
export const gotoDestination = (unit: Unit): Pos | undefined => (unit.standingOrder?.kind === 'goto' ? unit.standingOrder.at : undefined);

/** [CAMBIO] Va por su cuenta: es de una escuadra con orden y lleva otra propia distinta. */
export function isDetached(s: GameState, unit: Unit): boolean {
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return !!unit.standingOrder && !!squadOrder && !sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder));
}

/** Unidades de esa escuadra que siguen su orden (no destacadas). */
const followers = (s: GameState, squad: Squad) => squadUnits(s, squad.id).filter((unit) => !unit.standingOrder);

/** Los ids de escuadra a los que pertenecen todas sus unidades vivas de esta lista. */
function wholeSquads(s: GameState, units: readonly Unit[]): Map<number, Squad> {
  const ids = new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])));
  const picked = new Set(units.map((unit) => unit.uid));
  const isWhole = (id: number) => squadUnits(s, id).every((unit) => !isAlive(unit) || picked.has(unit.uid));
  const whole = new Map<number, Squad>();
  for (const id of ids) {
    const squad = squadById(s, id);
    if (squad && isWhole(id)) whole.set(id, squad);
  }
  return whole;
}

/** El edificio de esa casilla ya es de la alianza de `team` (o no hay): no hay nada que capturar. */
function isOwnedOrMissing(s: GameState, team: TeamId, at: Pos): boolean {
  const building = buildingAt(s, at);
  return !building || (building.owner !== null && areAllied(s, building.owner, team));
}

/** Por que no se puede dar una orden permanente (los mismos nombres que da `dispatch` al rechazarla). */
export type StandingOrderBlock = Extract<ActionRejection, 'noBuilding' | 'noCapturer' | 'noFighter' | 'transported'> | TravelProblem;

/**
 * Por que no se puede dar esa orden ahi a unidades del equipo `team` (null = se puede): alguna tiene
 * que poder cumplirla (atacar y defender, alguna que luche; capturar, alguna que capture y un
 * edificio que no sea ya de la alianza); ir alli, todas tienen que poder ir.
 */
export function standingOrderBlock(
  s: GameState,
  team: TeamId,
  kind: StandingOrderKind,
  at: Pos,
  units: readonly Unit[],
): StandingOrderBlock | null {
  return STANDING_ORDER_TYPES[kind].block(s, team, at, units);
}

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
  /** Cuando esta cumplida para su escuadra (`finishStandingOrder`): las de cada unidad no llegan aqui. */
  readonly squadDone: (s: GameState, squad: Squad, at: Pos) => boolean;
  /** Su puesto en el menu de ordenes de una casilla (menor, antes), o null si ahi no se ofrece. */
  readonly menuRank: (place: OrderPlace) => number | null;
}

/** Atacar y defender: alguna tiene que poder luchar. */
const needsFighter: BlockCheck = (s, _team, _at, units) => (units.some((unit) => canFight(s, unit)) ? null : 'noFighter');

/** Cumplida para la escuadra cuando han llegado todas las que la siguen. */
const whenAllArrive = (s: GameState, squad: Squad): boolean =>
  followers(s, squad).every((unit) => !isAlive(unit) || atStandingOrder(s, unit));

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
const isUnitOnly = (kind: StandingOrderKind): boolean => STANDING_ORDER_TYPES[kind].unitOnly;

/**
 * Ordenes que tiene sentido ofrecer en una casilla (clic derecho o pulsacion larga en el destino, con
 * unidades elegidas), en el orden del menu: el `menuRank` de cada tipo (con un enemigo visible ahi,
 * atacar va primero; si no, con un edificio que estas unidades pueden capturar, capturar; defender
 * siempre se puede). `enemyHere`: hay un enemigo que el jugador ve en esa casilla (la niebla la decide
 * la escena).
 */
export function standingOrderChoices(s: GameState, team: TeamId, at: Pos, units: readonly Unit[], enemyHere: boolean): StandingOrderKind[] {
  const mine = teamUnits(s, team, units);
  if (!mine.length) return [];
  const ranked = STANDING_ORDER_KINDS.flatMap((kind) => {
    const rank = STANDING_ORDER_TYPES[kind].menuRank({ enemyHere, canGive: () => standingOrderBlock(s, team, kind, at, mine) === null });
    return rank === null ? [] : [{ kind, rank }];
  });
  // sort es estable: a igual puesto, el orden de STANDING_ORDER_TYPES.
  return ranked.sort((first, second) => first.rank - second.rank).map((entry) => entry.kind);
}

/** El tipo de orden que es quedarse guardando el sitio (`holdsPosition`). */
const holdingKind = (): StandingOrderKind => kindWith('holdsPosition');
/** El tipo de orden que es tomar el edificio del destino (`takesBuilding`). */
const capturingKind = (): StandingOrderKind => kindWith('takesBuilding');

/** El tipo de orden que dice que si a `field` (tiene que haber uno: lo comprueba tests/standingOrders.test.ts). */
function kindWith(field: 'holdsPosition' | 'takesBuilding'): StandingOrderKind {
  const kind = STANDING_ORDER_KINDS.find((candidate) => STANDING_ORDER_TYPES[candidate][field]);
  if (!kind) throw new Error(`Ningun tipo de orden tiene ${field}`);
  return kind;
}

/** La unidad se queda con la orden como propia, salvo que sea justo la de su escuadra (entonces la sigue). */
function giveOwnStandingOrder(s: GameState, unit: Unit, standingOrder: StandingOrder): void {
  unit.standingOrder = forUnit(s, unit, standingOrder);
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  if (squadOrder && sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder))) delete unit.standingOrder;
}

/**
 * Da una orden con destino a estas unidades del equipo `team` (las de otros equipos no la reciben).
 * Si son una escuadra entera, la orden es de la escuadra (y se olvidan las propias); si son solo
 * algunas, cada una se queda con la orden como propia (destacada) y al cumplirla vuelve a la de su
 * escuadra. Con "capturar", las que no pueden capturar van de escolta. Devuelve cuantas la han
 * recibido.
 */
export function giveStandingOrder(s: GameState, team: TeamId, units: readonly Unit[], kind: StandingOrderKind, at: Pos): number {
  const mine = teamUnits(s, team, units);
  const standingOrder = copyStandingOrder({ kind, at });
  // La de ir alli es siempre de cada unidad, aunque sean una escuadra entera.
  const squadOrder = isTurnEndOrder(standingOrder) ? standingOrder : null;
  const whole = squadOrder ? wholeSquads(s, mine) : new Map<number, Squad>();
  if (squadOrder) for (const squad of whole.values()) squad.standingOrder = copyStandingOrder(squadOrder);
  for (const unit of mine) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else giveOwnStandingOrder(s, unit, standingOrder);
  }
  return mine.length;
}

/**
 * Quita la orden a estas unidades. A una escuadra entera se le quita la suya (se quedan esperando).
 * Una destacada vuelve a la orden de su escuadra; una que seguia a su escuadra se queda guardando
 * donde esta (defender aqui), que es "parar" sin sacarla de la escuadra.
 */
export function cancelStandingOrder(s: GameState, units: readonly Unit[]): void {
  const whole = wholeSquads(s, units);
  for (const squad of whole.values()) delete squad.standingOrder;
  for (const unit of units) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else if (unit.standingOrder) delete unit.standingOrder;
    else if (effectiveStandingOrder(s, unit)) unit.standingOrder = { kind: holdingKind(), at: posOf(unit) };
  }
}

/**
 * [CAMBIO] La unidad ha cumplido la orden que seguia. Si era la suya, la olvida (vuelve a la de su
 * escuadra). Si era la de la escuadra, se quita cuando ya esta cumplida para la escuadra: al
 * capturar el edificio, o al atacar cuando han llegado todas las que la siguen.
 */
export function finishStandingOrder(s: GameState, unit: Unit): void {
  if (unit.standingOrder) {
    delete unit.standingOrder;
    return;
  }
  const squad = squadById(s, unit.squad);
  if (!squad?.standingOrder) return;
  if (STANDING_ORDER_TYPES[squad.standingOrder.kind].squadDone(s, squad, squad.standingOrder.at)) delete squad.standingOrder;
}

/**
 * [CAMBIO] Has empezado a mano una captura con esta unidad: si llevaba una orden (suya o de su
 * escuadra) que no es capturar este edificio, ahora lo es, para que el turno siguiente no lo deje a
 * medias. En una escuadra queda destacada y, con el edificio tomado, vuelve a la orden de la escuadra.
 * Devuelve la orden nueva (para su suceso), o null si no ha cambiado nada.
 */
export function keepCapturing(s: GameState, unit: Unit): StandingOrder | null {
  const building = buildingAt(s, unit);
  const standingOrder = effectiveStandingOrder(s, unit);
  // La de ir alli no se toca: capturar de paso no la cambia (la unidad sigue su viaje).
  if (!building || !standingOrder || isUnitOnly(standingOrder.kind) || isOwnedOrMissing(s, unit.team, unit)) return null;
  const capturing = capturingKind();
  if (standingOrder.kind === capturing && samePos(standingOrder.at, unit)) return null;
  unit.standingOrder = { kind: capturing, at: posOf(unit) };
  return copyStandingOrder(unit.standingOrder);
}

/** Ya ha llegado a la zona de su orden (a 1 casilla o menos). */
export function atStandingOrder(s: GameState, unit: Unit): boolean {
  const standingOrder = effectiveStandingOrder(s, unit);
  return !!standingOrder && manhattan(unit, standingOrder.at) <= 1;
}

/**
 * [CAMBIO] Dos unidades van en formacion: misma escuadra y misma orden (mismo destino; capturar y
 * atacar cuentan igual, porque con "capturar" las que no capturan van escoltando con "atacar").
 */
export function sameFormation(s: GameState, first: Unit, second: Unit): boolean {
  if (first.squad === undefined || first.squad !== second.squad || first.team !== second.team) return false;
  const firstOrder = turnEndOrderOf(s, first);
  const secondOrder = turnEndOrderOf(s, second);
  if (!firstOrder || !secondOrder) return false;
  const holds = (standingOrder: StandingOrder) => STANDING_ORDER_TYPES[standingOrder.kind].holdsPosition;
  return holds(firstOrder) === holds(secondOrder) && samePos(firstOrder.at, secondOrder.at);
}

/** [CAMBIO] La escuadra entera (dos o mas unidades) lleva la misma orden: avanza en formacion. */
export function squadInFormation(s: GameState, id: number): boolean {
  const units = squadUnits(s, id);
  return units.length > 1 && units.every((unit) => sameFormation(s, units[0]!, unit));
}

/**
 * Si todas las unidades de la escuadra llevan la misma orden propia (contando la escolta de una
 * captura), pasa a ser la orden de la escuadra. Asi una escuadra formada con unidades que ya iban
 * juntas, o una partida guardada antes de que las escuadras tuvieran orden, sigue igual.
 */
export function liftStandingOrder(s: GameState, squad: Squad): void {
  const units = squadUnits(s, squad.id);
  const withOrder = units.flatMap((unit) =>
    unit.standingOrder && isTurnEndOrder(unit.standingOrder) ? [{ unit, order: unit.standingOrder }] : [],
  );
  const [first] = withOrder;
  // Si alguna no lleva orden propia, la escuadra no tiene una comun.
  if (!first || withOrder.length !== units.length) return;
  // La que manda (`leadsSquad`, capturar): las demas van de escolta (con "atacar") al mismo sitio.
  const lead = withOrder.find((entry) => STANDING_ORDER_TYPES[entry.order.kind].leadsSquad) ?? first;
  const allAgree = withOrder.every((entry) => sameStandingOrder(entry.order, forUnit(s, entry.unit, lead.order)));
  if (!allAgree) return;
  squad.standingOrder = copyStandingOrder(lead.order);
  for (const unit of units) delete unit.standingOrder;
}
