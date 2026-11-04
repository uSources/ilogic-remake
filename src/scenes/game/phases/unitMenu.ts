/**
 * Lo que hace la unidad elegida despues de moverse: su menu de acciones ('unitMenu') y lo que piden
 * algunas de ellas, elegir a quien atacar ('attack') y a quien descargar y donde ('unloadPick',
 * 'unloadTile').
 */
import { posKey, posOf } from '../../../core/geom';
import {
  attackEvent,
  attackTargets,
  buildingAt,
  capture,
  captureEvent,
  removeUnit,
  supply,
  unitActions,
  unitById,
  unload,
  unloadTiles,
  wait,
} from '../../../core/rules';
import { cancelStandingOrder, keepCapturing } from '../../../core/squads';
import type { StandingOrderKind, Unit } from '../../../core/model';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { t, unitLabel, type TextKey } from '../../../settings';
import { captureHintText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import type { MenuInput, MenuModel } from '../menuModel';
import { ACTION_ORDER, type ActionKey } from '../types';
import { markTiles, type PhaseHandler, type PhaseHost } from './phase';

/** En el menu de carga, la primera opcion es «Atras»; los pasajeros van detras. */
const BACK_ROW = 0;
const FIRST_PASSENGER_ROW = 1;

/** Lo que hace cada opcion del menu de la unidad (una por cada accion de unitActions). */
const UNIT_MENU_ACTIONS: { readonly [Action in ActionKey]: (h: PhaseHost, unit: Unit) => void } = {
  attack: pickAttackTarget,
  capture: captureHere,
  unload: (host) => {
    host.menuSel = FIRST_PASSENGER_ROW;
    host.phase = 'unloadPick';
    host.refresh();
  },
  supply: (host, unit) => {
    host.moves.clearUndo();
    supply(host.state, unit);
    host.afterAction();
  },
  wait: (host, unit) => {
    wait(unit);
    host.afterAction();
  },
  orderToAttack: (host, unit) => startOrder(host, unit, 'attack'),
  orderToCapture: (host, unit) => startOrder(host, unit, 'capture'),
  orderToDefend: (host, unit) => startOrder(host, unit, 'defend'),
  cancelOrder: (host, unit) => {
    cancelStandingOrder(host.state, [unit]);
    showToast(t('orderCancelled'));
    host.enter('unitMenu');
  },
  back: (host) => host.moves.undoMove(),
  delete: deleteUnit,
};

/** La orden pide despues la casilla; lo ya movido este turno se mantiene. */
function startOrder(h: PhaseHost, unit: Unit, kind: StandingOrderKind): void {
  h.orders.start(kind, [unit], true);
}

function pickAttackTarget(h: PhaseHost, unit: Unit): void {
  const targets = attackTargets(h.state, unit);
  h.moves.session!.attackTargets = new Map(targets.map((target) => [posKey(target), target.uid]));
  h.phase = 'attack';
  const first = targets[0];
  if (first) {
    h.view.cursor = posOf(first);
    h.view.ensureVisible(first, 3);
  }
  h.refresh();
}

/** Capturar el edificio en el que esta. */
function captureHere(h: PhaseHost, unit: Unit): void {
  const building = buildingAt(h.state, unit);
  const result = capture(h.state, unit);
  // [CAMBIO] Si a mitad de captura, que la acabe aunque tuviera otra orden (destacada).
  keepCapturing(h.state, unit);
  if (building && result) void h.play([captureEvent(unit, building, result)]).then(() => h.afterAction());
  else h.afterAction();
}

/** [CAMBIO] pedir confirmacion (en el original se borraba al instante). */
function deleteUnit(h: PhaseHost, unit: Unit): void {
  if (!h.deleteArmed) {
    h.deleteArmed = true;
    return showToast(t('confirmDelete'));
  }
  h.moves.clearUndo();
  removeUnit(h.state, unit.uid);
  h.afterAction();
}

export const unitMenuPhase: PhaseHandler = {
  enter: (host) => {
    const unit = host.moves.selected;
    if (!unit) return host.toMap();
    const can = unitActions(host.state, unit);
    // [CAMBIO] "Atras" siempre: deshace el movimiento (en el original no se podia).
    can.back = true;
    host.unitOptions = ACTION_ORDER.filter((action) => can[action]);
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
export function captureNow(h: PhaseHost): void {
  h.unitOptions = ['capture'];
  h.menuSel = 0;
  h.phase = 'unitMenu';
  unitMenuPhase.accept(h);
}

function unitMenuModel(input: MenuInput): MenuModel {
  const unit = input.sel;
  const items: MenuItemVM[] = input.actions.map((action) => ({
    id: action,
    label: t(action as TextKey),
    danger: action === 'delete',
    // "20→10": puntos del edificio antes y despues de capturar este turno (reglas nuevas).
    hint: action === 'capture' && unit ? captureHintText(input.s, unit) : undefined,
  }));
  return { kind: 'unit', title: unit ? unitLabel(input.s.content, unit.type) : undefined, items, at: unit ?? input.cursor };
}

export const attackPhase: PhaseHandler = {
  accept: (host) => {
    const unit = host.moves.selected;
    const cursor = host.view.cursor;
    const targetUid = host.moves.session?.attackTargets.get(posKey(cursor));
    if (!unit || targetUid === undefined) return host.enter('unitMenu');
    const target = unitById(host.state, targetUid)!;
    void host.play([attackEvent(host.state, unit, target, Math.random)]).then(() => host.afterAction());
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
  const carrier = input.sel;
  const cargo = carrier ? carrier.cargo.map((uid) => unitById(input.s, uid)) : [];
  const passengerItems = cargo.map((passenger, index): MenuItemVM => {
    const id = `c${index}`;
    if (!passenger) return { id, label: t('empty'), icon: null, disabled: true };
    const hasRoom = unloadTiles(input.s, carrier!, passenger).length > 0;
    return {
      id,
      label: unitLabel(input.s.content, passenger.type),
      icon: unitIconKey(input.s, passenger.type, true),
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
    if (!unload(host.state, session.unit, session.passenger, cursor)) return;
    host.moves.clearUndo();
    host.afterAction();
  },
  back: (host) => {
    host.phase = 'unloadPick';
    host.menuSel = BACK_ROW;
    host.refresh();
  },
  highlights: (input) => markTiles(input.unload, 'unload'),
};
