/**
 * La niebla de los sucesos: lo que un equipo ve de lo que acaba de pasar (`eventsSeenBy`). Un
 * servidor manda a cada cliente solo la vista de su equipo (`PlayerView`, con la niebla de FOG) y,
 * de cada paso, los sucesos que ese equipo veria: los demas se quitan o se recortan aqui, antes de
 * salir por la red (asi un cliente no puede mirar a traves de la niebla por mucho que escuche).
 *
 * La regla: un suceso se ve si el equipo conoce lo que nombra, **antes o despues del paso**. Lo que
 * sabe el equipo en cada momento es su `Knowledge` (su vista con niebla y lo que ve); las dos juntas
 * son el `Vantage` desde el que mira el paso. Hace falta el antes porque un suceso puede dejar sin
 * rastro a quien lo protagoniza (la unidad que cae, la que se mete en la niebla, la que sube a un
 * transporte), y el despues porque puede dejar algo nuevo a la vista (la que sale de la niebla, la
 * que se fabrica). Lo que un equipo sabe de una unidad lo decide FOG (playerView.ts): aqui no se
 * vuelve a calcular la vision, se pregunta a sus vistas.
 *
 * Lo que es de cada tipo de suceso es una entrada de `EVENT_FOG` (el compilador exige una por tipo,
 * tambien para los de los modulos: un suceso nuevo no compila sin la suya). Publico queda lo que la
 * partida anuncia a todos: los turnos, el dia, el clima, las rendiciones y las caidas, los puntos de
 * control y los poderes de los generales (su carga y su uso se ven en el estado de cada equipo).
 * Privado de cada alianza: sus ordenes, sus escuadras, sus ingresos y su mantenimiento, lo que pierde
 * por el tope de dinero y quien va dentro de sus transportes.
 */
import { foggedCopy } from '../playerView';
import { unitById } from '../rules/queries';
import { sightOf, type Sight } from '../rules/visibility';
import { areAllied } from '../teams';
import type { GameEvent, GameEventKind, GameEventOf, GameState, Pos, TeamId } from '../model';

/** Lo que sabe un equipo en un momento: la partida tal como la sabe (`foggedCopy`) y lo que ve. */
export interface Knowledge {
  readonly team: TeamId;
  /** La partida con toda la niebla de FOG: sus unidades son las que conoce. */
  readonly state: GameState;
  readonly sees: Sight;
}

/** Lo que sabe ahora mismo el equipo `team` de la partida `s`. */
export function knowledgeOf(s: GameState, team: TeamId): Knowledge {
  const state = foggedCopy(s, team);
  // Lo que ve sale igual de su vista: sus unidades y edificios, y los de sus aliados, estan enteros en ella.
  return { team, state, sees: sightOf(state, team) };
}

/** Desde donde mira un equipo un paso de la partida: lo que sabia antes y lo que sabe despues. */
export interface Vantage {
  readonly before: Knowledge;
  readonly after: Knowledge;
}

/** Las preguntas con las que cada regla de la niebla mira un suceso: lo que el equipo sabe antes o despues del paso. */
interface Witness {
  knows(uid: number): boolean;
  sees(pos: Pos): boolean;
  isAlly(team: TeamId | null): boolean;
  knowsSquad(squad: number): boolean;
  /** Lo de la lista que es de unidades que conoce. */
  knownOf<Entry extends { uid: number }>(list: readonly Entry[]): Entry[];
}

function witnessOf({ before, after }: Vantage): Witness {
  if (before.team !== after.team) throw new Error(`El antes es del equipo ${before.team} y el despues del ${after.team}`);
  const states = [before.state, after.state];
  const knows = (uid: number): boolean => states.some((s) => unitById(s, uid) !== undefined);
  return {
    knows,
    sees: (pos) => before.sees(pos) || after.sees(pos),
    isAlly: (team) => team !== null && areAllied(after.state, before.team, team),
    knowsSquad: (squad) => states.some((s) => s.squads?.some((known) => known.id === squad)),
    knownOf: (list) => list.filter((entry) => knows(entry.uid)),
  };
}

/** Lo que ve el equipo de un suceso de ese tipo: el suceso (recortado si hace falta), o null si no lo ve. */
type EventFogRule<K extends GameEventKind> = (event: GameEventOf<K>, witness: Witness) => GameEventOf<K> | null;

/** Lo anuncia la partida a todos. */
const isPublic = <K extends GameEventKind>(event: GameEventOf<K>): GameEventOf<K> => event;

/** Solo si conoce a las unidades que nombra (todas). */
const whenKnown =
  <K extends GameEventKind>(uidsOf: (event: GameEventOf<K>) => readonly number[]): EventFogRule<K> =>
  (event, witness) =>
    uidsOf(event).every((uid) => witness.knows(uid)) ? event : null;

/** Solo si el equipo que nombra es de su alianza. */
const alliesOnly =
  <K extends GameEventKind>(teamOf: (event: GameEventOf<K>) => TeamId | null): EventFogRule<K> =>
  (event, witness) =>
    witness.isAlly(teamOf(event)) ? event : null;

/**
 * El camino de una unidad tal como lo ve el equipo: entero si es de su alianza; si no, solo las
 * casillas que ve (pueden no ser contiguas: por la niebla la unidad desaparece y vuelve a salir).
 */
const seenPath = (witness: Witness, actor: TeamId, path: Pos[]): Pos[] =>
  witness.isAlly(actor) ? path : path.filter((pos) => witness.sees(pos));

/** Lo que el equipo ve de cada tipo de suceso (una entrada por tipo: el compilador lo exige). */
const EVENT_FOG: { readonly [K in GameEventKind]: EventFogRule<K> } = {
  // Una unidad que cruza la vision sin pararse en ella no esta en ninguna vista: no se cuenta.
  move: (event, witness) => {
    if (!witness.knows(event.uid)) return null;
    const { interruption, ...rest } = event;
    const seenCut = interruption && witness.sees(interruption.at) ? { interruption } : {};
    return { ...rest, path: seenPath(witness, event.actor, event.path), ...seenCut };
  },
  // El combate se ve donde cae el disparo. Quien dispara se delata en el suceso (su tipo, su vida y
  // su rango salen en el panel de combate, como en la pantalla de hoy), pero no donde esta: su
  // casilla no va en el suceso, y si no se ve tampoco esta en la vista.
  attack: (event, witness) => (witness.sees(event.at) ? event : null),
  capture: whenKnown((event) => [event.uid]),
  merge: (event, witness) =>
    witness.knows(event.uid) && witness.knows(event.into) ? { ...event, path: seenPath(witness, event.actor, event.path) } : null,
  load: (event, witness) =>
    witness.knows(event.uid) && witness.knows(event.into) ? { ...event, path: seenPath(witness, event.actor, event.path) } : null,
  unload: whenKnown((event) => [event.uid, event.passenger]),
  spawn: whenKnown((event) => [event.uid]),
  wait: whenKnown((event) => [event.uid]),
  supply: (event, witness) => (witness.knows(event.uid) ? { ...event, repairs: witness.knownOf(event.repairs) } : null),
  remove: whenKnown((event) => [event.uid]),
  // Deshecho hacia la niebla: la unidad desaparece sin mas (donde vuelve no se ve).
  undoMove: (event, witness) => (witness.knows(event.uid) && witness.sees(event.to) ? event : null),
  standingOrder: alliesOnly((event) => event.actor),
  standingOrderDone: alliesOnly((event) => event.actor),
  squad: (event, witness) => (witness.knowsSquad(event.squad) ? event : null),
  // Que un general usa su poder es publico (su carga y su uso estan en el estado del equipo); a
  // quien ha tocado o curado, solo las unidades que conoce, y la casilla elegida, si la ve.
  power: (event, witness) => {
    const { target, heals, ...rest } = event;
    const seenTarget = target && witness.sees(target) ? { target } : {};
    const seenHeals = heals ? { heals: witness.knownOf(heals) } : {};
    return { ...rest, hits: witness.knownOf(event.hits), ...seenTarget, ...seenHeals };
  },
  // Quien iba dentro de un transporte enemigo nunca se supo: solo los pasajeros que conocia.
  cargoLost: (event, witness) =>
    witness.knows(event.transport) ? { ...event, passengers: event.passengers.filter((uid) => witness.knows(uid)) } : null,
  captureDropped: whenKnown((event) => [event.uid]),
  fundsCapped: alliesOnly((event) => event.team),
  income: alliesOnly((event) => event.team),
  heal: whenKnown((event) => [event.uid]),
  newDay: isPublic,
  surrender: isPublic,
  teamDefeated: isPublic,
  turnStart: isPublic,
  turnEnd: isPublic,
  weather: isPublic,
  upkeep: alliesOnly((event) => event.team),
  controlPoint: isPublic,
};

/** Un suceso que no esta en la tabla (el de un modulo de un modo que no se conoce aqui): lo prudente es no mandarlo. */
const unknownStaysHidden: EventFogRule<GameEventKind> = () => null;

/** La regla de la niebla del tipo de este suceso. */
function fogRuleOf(event: GameEvent): EventFogRule<GameEventKind> {
  // TypeScript no sabe que la entrada de cada tipo recibe el suceso de ese mismo tipo.
  const rule = Object.hasOwn(EVENT_FOG, event.kind) ? (EVENT_FOG[event.kind] as EventFogRule<GameEventKind>) : undefined;
  return rule ?? unknownStaysHidden;
}

/**
 * Los sucesos de un paso tal como los ve el equipo del `vantage`: los que no ve, fuera; los demas,
 * recortados a lo que conoce (ver EVENT_FOG). En el orden en que pasaron.
 */
export function eventsSeenBy(events: readonly GameEvent[], vantage: Vantage): GameEvent[] {
  const witness = witnessOf(vantage);
  return events.flatMap((event) => {
    const seen = fogRuleOf(event)(event, witness);
    return seen ? [seen] : [];
  });
}
