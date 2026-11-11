/**
 * Lo que nombra una accion (unidades por su uid, escuadras por su numero) y si quien la manda lo
 * conoce todo (`refersOnlyToKnown`). Por la red, una accion que nombra algo que el equipo no sabe
 * que existe se rechaza como 'missing' sin preguntar a la partida: si se le preguntara, la
 * respuesta ('notTarget', 'notYours', 'transported'...) diria que esa unidad existe, y probando uids
 * uno a uno se contaria el ejercito enemigo escondido. Una entrada por tipo de accion (el compilador
 * la exige: una accion nueva no compila sin decir lo que nombra).
 */
import type { GameAction, GameActionKind, GameActionOf, GameState } from '../model';
import { unitById } from '../rules/queries';

/** Lo que nombra una accion: unidades y escuadras. */
interface ActionReferences {
  uids: readonly number[];
  squads: readonly number[];
}

type ReferencesOf<K extends GameActionKind> = (action: GameActionOf<K>) => Partial<ActionReferences>;

const NOTHING: Partial<ActionReferences> = {};
const theUnit = (action: { uid: number }): Partial<ActionReferences> => ({ uids: [action.uid] });
const theUnits = (action: { uids: number[] }): Partial<ActionReferences> => ({ uids: action.uids });
const theSquad = (action: { squad: number }): Partial<ActionReferences> => ({ squads: [action.squad] });

/** Lo que nombra cada tipo de accion. */
const ACTION_REFERENCES: { readonly [K in GameActionKind]: ReferencesOf<K> } = {
  move: theUnit,
  undoMove: theUnit,
  attack: (action) => ({ uids: [action.uid, action.target] }),
  capture: theUnit,
  merge: (action) => ({ uids: [action.uid, action.into] }),
  load: (action) => ({ uids: [action.uid, action.into] }),
  unload: (action) => ({ uids: [action.uid, action.passenger] }),
  supply: theUnit,
  wait: theUnit,
  deleteUnit: theUnit,
  buy: () => NOTHING,
  usePower: () => NOTHING,
  gotoStep: theUnit,
  giveStandingOrder: theUnits,
  cancelStandingOrder: theUnits,
  finishStandingOrder: theUnit,
  formSquad: theUnits,
  setGroup: theUnits,
  addToGroup: theUnits,
  leaveSquad: theUnits,
  renameSquad: theSquad,
  disbandSquad: theSquad,
  surrender: () => NOTHING,
  startTurn: () => NOTHING,
  endTurn: () => NOTHING,
};

/** Lo que nombra la accion (ver ActionReferences). */
export function referencesOfAction(action: GameAction): ActionReferences {
  // TypeScript no sabe que la entrada de cada tipo recibe la accion de ese mismo tipo.
  const extract = ACTION_REFERENCES[action.kind] as ReferencesOf<GameActionKind>;
  return { uids: [], squads: [], ...extract(action) };
}

/** Todo lo que nombra la accion esta en `known` (la partida tal como la sabe el equipo: su vista con niebla). */
export function refersOnlyToKnown(action: GameAction, known: GameState): boolean {
  const { uids, squads } = referencesOfAction(action);
  const knownSquads = known.squads ?? [];
  return uids.every((uid) => unitById(known, uid) !== undefined) && squads.every((id) => knownSquads.some((squad) => squad.id === id));
}
