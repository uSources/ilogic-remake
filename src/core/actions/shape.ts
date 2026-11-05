/**
 * La forma de una accion, antes de mirar la partida: que su `kind` existe y que sus campos son lo
 * que dice GameAction (uids enteros, casillas con x e y enteros, textos donde van textos). Una
 * accion puede venir de fuera (una repeticion, un cliente roto, la partida por texto), asi que
 * dispatch la comprueba la primera (ACTION_GUARDS) en vez de fallar con un TypeError dentro de su
 * `validate`. ACTION_SHAPES tiene una comprobacion por cada campo de cada tipo de accion, y el tipo
 * lo obliga: un campo nuevo en GameAction no compila sin la suya.
 */
import { isStandingOrderKind } from '../squads/standingOrders';
import { isObject, isPos, isUid } from '../util/validation';
import type { GameAction, GameActionKind, GameActionOf } from '../model';

/** Si un campo tiene la forma que toca. */
type FieldCheck = (value: unknown) => boolean;
/** Una comprobacion por cada campo de la accion de ese tipo (menos `kind`), tambien los opcionales. */
type ShapeOf<K extends GameActionKind> = { readonly [Field in Exclude<keyof GameActionOf<K>, 'kind'>]-?: FieldCheck };

const isUidList: FieldCheck = (value) => Array.isArray(value) && value.every(isUid);
const isText: FieldCheck = (value) => typeof value === 'string';
const optional =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === undefined || check(value);
const isPosOrNull: FieldCheck = (value) => value === null || isPos(value);
const isPath: FieldCheck = (value) => Array.isArray(value) && value.every(isPos);
const isStandingOrder: FieldCheck = (value) => isObject(value) && isStandingOrderKind(value.kind) && isPos(value.at);
/** Teclas de grupo: un entero (cuales valen, de 1 a SQUAD_KEYS, lo dice la accion, con 'badKey'). */
const isKey: FieldCheck = (value) => Number.isInteger(value);

const unitOnly = { uid: isUid } as const;
const unitAndInto = { uid: isUid, into: isUid } as const;
const unitList = { uids: isUidList } as const;
const squadOnly = { squad: isUid } as const;

/** Por cada tipo de accion, la forma de cada uno de sus campos. */
export const ACTION_SHAPES: { readonly [K in GameActionKind]: ShapeOf<K> } = {
  move: { uid: isUid, to: isPos, path: optional(isPath) },
  undoMove: unitOnly,
  attack: { uid: isUid, target: isUid },
  capture: unitOnly,
  merge: unitAndInto,
  load: unitAndInto,
  unload: { uid: isUid, passenger: isUid, to: isPos },
  supply: unitOnly,
  wait: unitOnly,
  deleteUnit: unitOnly,
  buy: { at: isPos, unitType: isText },
  usePower: { power: isText, target: isPosOrNull },
  travel: { uid: isUid, to: isPosOrNull },
  travelStep: unitOnly,
  giveStandingOrder: { uids: isUidList, order: isStandingOrder },
  cancelStandingOrder: unitList,
  finishStandingOrder: unitOnly,
  formSquad: { uids: isUidList, name: optional(isText), key: optional(isKey) },
  setGroup: { uids: isUidList, key: isKey },
  addToGroup: { uids: isUidList, key: isKey },
  leaveSquad: unitList,
  renameSquad: { squad: isUid, name: isText },
  disbandSquad: squadOnly,
};

const isActionKind = (kind: unknown): kind is GameActionKind => typeof kind === 'string' && Object.hasOwn(ACTION_SHAPES, kind);

/** El valor tiene la forma de una GameAction (no dice si vale ahora: eso es `actionProblem`). */
export function isGameAction(value: unknown): value is GameAction {
  if (!isObject(value) || !isActionKind(value.kind)) return false;
  const shape: Readonly<Record<string, FieldCheck>> = ACTION_SHAPES[value.kind];
  return Object.entries(shape).every(([field, check]) => check(value[field]));
}
