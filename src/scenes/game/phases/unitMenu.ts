/**
 * Lo que hace la unidad elegida despues de moverse: su menu de acciones ('unitMenu') y lo que piden
 * algunas de ellas, elegir a quien atacar ('attack') y a quien descargar y donde ('unloadPick',
 * 'unloadTile').
 */
import { unitTypeOf } from '../../../core/gameContent';
import { posKey, posOf } from '../../../core/geom';
import { attackTargets, unitById, unloadTiles } from '../../../core/rules';
import { availableActions, type UnitMenuOption } from '../../../core/actions';
import type { StandingOrderKind, Unit } from '../../../core/model';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { t, nameOf, type TextKey } from '../../../settings';
import { captureHintText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import type { MenuInput, MenuModel } from '../menuModel';
import { BACK_GOES_BEFORE, type ActionKey } from '../types';
import { markTiles, type PhaseHandler, type PhaseHost } from './phase';

/** En el menu de carga, la primera opcion es «Atras»; los pasajeros van detras. */
const BACK_ROW = 0;
const FIRST_PASSENGER_ROW = 1;

/** Lo que hace cada opcion del menu de la unidad (una por cada opcion de availableActions, y «Atras»). */
const UNIT_MENU_ACTIONS: { readonly [Action in ActionKey]: (host: PhaseHost, unit: Unit) => void } = {
  attack: pickAttackTarget,
  capture: captureHere,
  unload: (host) => {
    host.menuSel = FIRST_PASSENGER_ROW;
    host.phase = 'unloadPick';
    host.refresh();
  },
  supply: (host, unit) => {
    host.act({ kind: 'supply', uid: unit.uid });
    host.afterAction();
  },
  wait: (host, unit) => {
    host.act({ kind: 'wait', uid: unit.uid });
    host.afterAction();
  },
  orderToAttack: (host, unit) => startOrder(host, unit, 'attack'),
  orderToCapture: (host, unit) => startOrder(host, unit, 'capture'),
  orderToDefend: (host, unit) => startOrder(host, unit, 'defend'),
  cancelOrder: (host, unit) => {
    host.act({ kind: 'cancelStandingOrder', uids: [unit.uid] });
    showToast(t('orderCancelled'));
    host.enter('unitMenu');
  },
  back: (host) => host.moves.undoMove(),
  delete: deleteUnit,
};

/** Las opciones del nucleo, en su orden, con «Atras» en su sitio (BACK_GOES_BEFORE). */
export function withBack(options: readonly UnitMenuOption[]): ActionKey[] {
  const at = options.indexOf(BACK_GOES_BEFORE);
  const cut = at < 0 ? options.length : at;
  return [...options.slice(0, cut), 'back', ...options.slice(cut)];
}

/** La orden pide despues la casilla; lo ya movido este turno se mantiene. */
function startOrder(host: PhaseHost, unit: Unit, kind: StandingOrderKind): void {
  host.orders.start(kind, [unit], true);
}

function pickAttackTarget(host: PhaseHost, unit: Unit): void {
  const targets = attackTargets(host.state, unit);
  host.moves.session!.attackTargets = new Map(targets.map((target) => [posKey(target), target.uid]));
  host.phase = 'attack';
  const first = targets[0];
  if (first) {
    host.view.cursor = posOf(first);
    host.view.ensureVisible(first, 3);
  }
  host.refresh();
}

/** Capturar el edificio en el que esta (si llevaba otra orden, la de capturar este manda: ver la accion). */
function captureHere(host: PhaseHost, unit: Unit): void {
  void host.perform({ kind: 'capture', uid: unit.uid }).then(() => host.afterAction());
}

/** [CAMBIO] pedir confirmacion (en el original se borraba al instante). */
function deleteUnit(host: PhaseHost, unit: Unit): void {
  if (!host.deleteArmed) {
    host.deleteArmed = true;
    return showToast(t('confirmDelete'));
  }
  host.act({ kind: 'deleteUnit', uid: unit.uid });
  host.afterAction();
}

export const unitMenuPhase: PhaseHandler = {
  enter: (host) => {
    const unit = host.moves.selected;
    if (!unit) return host.toMap();
    // [CAMBIO] «Atras» siempre (en el original no se podia deshacer): ver ActionKey.
    host.unitOptions = withBack(availableActions(host.state, host.viewer, unit));
    // Encima de un edificio que se puede capturar, lo normal es capturar.
    host.menuSel = Math.max(0, host.unitOptions.indexOf('capture'));
    host.deleteArmed = false;
    host.phase = 'unitMenu';
    host.view.cursor = posOf(unit);
    host.refresh();
  },
  accept: (host) => {
    const unit = host.moves.selected;
    const action = host.unitOptions[host.menuSel];
    if (unit && action) UNIT_MENU_ACTIONS[action](host, unit);
  },
  back: (host) => host.moves.undoMove(),
  menu: unitMenuModel,
};

/** Al soltarla encima de un edificio que se puede tomar: como elegir «Capturar» en su menu. */
export function captureNow(host: PhaseHost): void {
  host.unitOptions = ['capture'];
  host.menuSel = 0;
  host.phase = 'unitMenu';
  unitMenuPhase.accept(host);
}

function unitMenuModel(input: MenuInput): MenuModel {
  const unit = input.selected;
  const items: MenuItemVM[] = input.actions.map((action) => ({
    id: action,
    label: t(action as TextKey),
    danger: action === 'delete',
    // "20→10": puntos del edificio antes y despues de capturar este turno (reglas nuevas).
    hint: action === 'capture' && unit ? captureHintText(input.s, unit) : undefined,
  }));
  return { kind: 'unit', title: unit ? nameOf(unitTypeOf(input.s, unit)) : undefined, items, at: unit ?? input.cursor };
}

export const attackPhase: PhaseHandler = {
  accept: (host) => {
    const unit = host.moves.selected;
    const cursor = host.view.cursor;
    const targetUid = host.moves.session?.attackTargets.get(posKey(cursor));
    if (!unit || targetUid === undefined) return host.enter('unitMenu');
    void host.perform({ kind: 'attack', uid: unit.uid, target: targetUid }).then(() => host.afterAction());
  },
  back: (host) => host.enter('unitMenu'),
  highlights: (input) => markTiles(input.attack.keys(), 'attack'),
};

export const unloadPickPhase: PhaseHandler = {
  accept: (host) => {
    if (host.menuSel === BACK_ROW) return host.enter('unitMenu');
    const session = host.moves.session;
    if (!session) return;
    const carrier = session.unit;
    const passenger = unitById(host.state, carrier.cargo[host.menuSel - FIRST_PASSENGER_ROW] ?? null);
    if (!passenger) return;
    const tiles = unloadTiles(host.state, carrier, passenger);
    if (!tiles.length) return;
    session.passenger = passenger;
    session.unloadTiles = new Set(tiles.map(posKey));
    host.phase = 'unloadTile';
    host.view.cursor = { ...tiles[0]! };
    host.refresh();
  },
  back: (host) => host.enter('unitMenu'),
  menu: cargoMenuModel,
};

/** Menu de carga: los pasajeros (desactivados si no hay donde dejarlos). */
function cargoMenuModel(input: MenuInput): MenuModel {
  const carrier = input.selected;
  const cargo = carrier ? carrier.cargo.map((uid) => unitById(input.s, uid)) : [];
  const passengerItems = cargo.map((passenger, index): MenuItemVM => {
    const id = `c${index}`;
    if (!passenger) return { id, label: t('empty'), icon: null, disabled: true };
    const hasRoom = unloadTiles(input.s, carrier!, passenger).length > 0;
    return {
      id,
      label: nameOf(unitTypeOf(input.s, passenger)),
      icon: unitIconKey(unitTypeOf(input.s, passenger), true),
      hint: `${passenger.life}`,
      disabled: !hasRoom,
    };
  });
  const items: MenuItemVM[] = [{ id: 'back', label: t('back'), icon: null }, ...passengerItems];
  return { kind: 'cargo', title: t('unload'), items, at: carrier ?? input.cursor };
}

export const unloadTilePhase: PhaseHandler = {
  accept: (host) => {
    const session = host.moves.session;
    if (!session?.passenger) return;
    const cursor = host.view.cursor;
    if (!session.unloadTiles.has(posKey(cursor))) {
      host.phase = 'unloadPick';
      return host.refresh();
    }
    if (!host.act({ kind: 'unload', uid: session.unit.uid, passenger: session.passenger.uid, to: posOf(cursor) })) return;
    host.afterAction();
  },
  back: (host) => {
    host.phase = 'unloadPick';
    host.menuSel = BACK_ROW;
    host.refresh();
  },
  highlights: (input) => markTiles(input.unload, 'unload'),
};
