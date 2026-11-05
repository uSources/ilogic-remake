/**
 * La forma de una accion, antes de mirar la partida: que su `kind` existe y que sus campos son lo
 * que dice GameAction (uids enteros, casillas con x e y enteros, textos donde van textos). Una
 * accion puede venir de fuera (una repeticion, un cliente roto, la partida por texto), asi que
 * dispatch la comprueba la primera (ACTION_GUARDS) en vez de fallar con un TypeError dentro de su
 * `validate`. Una accion nueva es una entrada mas en ACTION_SHAPES (el tipo la pide).
 */
import { isStandingOrderKind } from '../squads/standingOrders';
import { isInt, isObject, isPos } from '../util/validation';
import type { GameAction, GameActionKind } from '../model';

/** El mayor uid que puede tener una unidad o una escuadra (los da un contador que solo sube). */
const MAX_UID = Number.MAX_SAFE_INTEGER;

type Fields = Record<string, unknown>;

const isUid = (value: unknown): value is number => isInt(value, 1, MAX_UID);
const isUidList = (value: unknown): boolean => Array.isArray(value) && value.every(isUid);
const isText = (value: unknown): value is string => typeof value === 'string';
const isOptional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || check(value);
const isPosOrNull = (value: unknown): boolean => value === null || isPos(value);
const isPath = (value: unknown): boolean => Array.isArray(value) && value.every(isPos);
const isStandingOrder = (value: unknown): boolean => isObject(value) && isStandingOrderKind(value.kind) && isPos(value.at);
/** Teclas de grupo: un entero (cual vale lo dice la accion, con 'badKey'). */
const isKey = (value: unknown): boolean => isInt(value, 0, MAX_UID);

const unitOnly = (action: Fields): boolean => isUid(action.uid);
const unitAndInto = (action: Fields): boolean => isUid(action.uid) && isUid(action.into);
const unitList = (action: Fields): boolean => isUidList(action.uids);
const squadOnly = (action: Fields): boolean => isUid(action.squad);

/** Por cada tipo de accion, si sus campos tienen la forma de GameAction. */
export const ACTION_SHAPES: { readonly [K in GameActionKind]: (action: Fields) => boolean } = {
  move: (action) => isUid(action.uid) && isPos(action.to) && isOptional(action.path, isPath),
  undoMove: unitOnly,
  attack: (action) => isUid(action.uid) && isUid(action.target),
  capture: unitOnly,
  merge: unitAndInto,
  load: unitAndInto,
  unload: (action) => isUid(action.uid) && isUid(action.passenger) && isPos(action.to),
  supply: unitOnly,
  wait: unitOnly,
  deleteUnit: unitOnly,
  buy: (action) => isPos(action.at) && isText(action.unitType),
  usePower: (action) => isText(action.power) && isPosOrNull(action.target),
  travel: (action) => isUid(action.uid) && isPosOrNull(action.to),
  giveStandingOrder: (action) => isUidList(action.uids) && isStandingOrder(action.order),
  cancelStandingOrder: unitList,
  finishStandingOrder: unitOnly,
  formSquad: (action) => isUidList(action.uids) && isOptional(action.name, isText) && isOptional(action.key, isKey),
  setGroup: (action) => isUidList(action.uids) && isKey(action.key),
  addToGroup: (action) => isUidList(action.uids) && isKey(action.key),
  leaveSquad: unitList,
  renameSquad: (action) => squadOnly(action) && isText(action.name),
  disbandSquad: squadOnly,
};

const isActionKind = (kind: unknown): kind is GameActionKind => typeof kind === 'string' && Object.hasOwn(ACTION_SHAPES, kind);

/** El valor tiene la forma de una GameAction (no dice si vale ahora: eso es `actionProblem`). */
export function isGameAction(value: unknown): value is GameAction {
  return isObject(value) && isActionKind(value.kind) && ACTION_SHAPES[value.kind](value);
}
