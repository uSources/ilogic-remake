/**
 * Lo que hace la unidad elegida despues de moverse: su menu de acciones ('unitMenu') y lo que piden
 * algunas de ellas, elegir a quien atacar ('attack') y a quien descargar y donde ('unloadPick',
 * 'unloadTile').
 */
import { posKey } from '../../../core/geom';
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
  unload: (h) => {
    h.menuSel = FIRST_PASSENGER_ROW;
    h.phase = 'unloadPick';
    h.refresh();
  },
  supply: (h, unit) => {
    h.moves.clearUndo();
    supply(h.state, unit);
    h.afterAction();
  },
  wait: (h, unit) => {
    wait(unit);
    h.afterAction();
  },
  cmdAttack: (h, unit) => startOrder(h, unit, 'attack'),
  cmdCapture: (h, unit) => startOrder(h, unit, 'capture'),
  cmdDefend: (h, unit) => startOrder(h, unit, 'defend'),
  cmdCancel: (h, unit) => {
    cancelStandingOrder(h.state, [unit]);
    showToast(t('orderCancelled'));
    h.enter('unitMenu');
  },
  back: (h) => h.moves.undoMove(),
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
    h.view.cursor = { x: first.x, y: first.y };
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
  enter: (h) => {
    const unit = h.moves.selected;
    if (!unit) return h.toMap();
    const can = unitActions(h.state, unit);
    // [CAMBIO] "Atras" siempre: deshace el movimiento (en el original no se podia).
    can.back = true;
    h.unitOptions = ACTION_ORDER.filter((action) => can[action]);
    // Encima de un edificio que se puede capturar, lo normal es capturar.
    h.menuSel = Math.max(0, h.unitOptions.indexOf('capture'));
    h.deleteArmed = false;
    h.phase = 'unitMenu';
    h.view.cursor = { x: unit.x, y: unit.y };
    h.refresh();
  },
  accept: (h) => {
    const unit = h.moves.selected;
    const action = h.unitOptions[h.menuSel];
    if (unit && action) UNIT_MENU_ACTIONS[action](h, unit);
  },
  back: (h) => h.moves.undoMove(),
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
  return { kind: 'unit', title: unit ? unitLabel(unit.type) : undefined, items, at: unit ?? input.cursor };
}

export const attackPhase: PhaseHandler = {
  accept: (h) => {
    const unit = h.moves.selected;
    const cursor = h.view.cursor;
    const targetUid = h.moves.session?.attackTargets.get(posKey(cursor));
    if (!unit || targetUid === undefined) return h.enter('unitMenu');
    const target = unitById(h.state, targetUid)!;
    void h.play([attackEvent(h.state, unit, target, Math.random)]).then(() => h.afterAction());
  },
  back: (h) => h.enter('unitMenu'),
  highlights: (input) => markTiles(input.attack.keys(), 'attack'),
};

export const unloadPickPhase: PhaseHandler = {
  accept: (h) => {
    if (h.menuSel === BACK_ROW) return h.enter('unitMenu');
    const session = h.moves.session;
    if (!session) return;
    const carrier = session.unit;
    const passenger = unitById(h.state, carrier.cargo[h.menuSel - FIRST_PASSENGER_ROW] ?? null);
    if (!passenger) return;
    const tiles = unloadTiles(h.state, carrier, passenger);
    if (!tiles.length) return;
    session.passenger = passenger;
    session.unloadTiles = new Set(tiles.map(posKey));
    h.phase = 'unloadTile';
    h.view.cursor = { ...tiles[0]! };
    h.refresh();
  },
  back: (h) => h.enter('unitMenu'),
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
    return { id, label: unitLabel(passenger.type), icon: unitIconKey(passenger.type, true), hint: `${passenger.life}`, disabled: !hasRoom };
  });
  const items: MenuItemVM[] = [{ id: 'back', label: t('back'), icon: null }, ...passengerItems];
  return { kind: 'cargo', title: t('unload'), items, at: carrier ?? input.cursor };
}

export const unloadTilePhase: PhaseHandler = {
  accept: (h) => {
    const session = h.moves.session;
    if (!session?.passenger) return;
    const cursor = h.view.cursor;
    if (!session.unloadTiles.has(posKey(cursor))) {
      h.phase = 'unloadPick';
      return h.refresh();
    }
    if (!unload(h.state, session.unit, session.passenger, cursor)) return;
    h.moves.clearUndo();
    h.afterAction();
  },
  back: (h) => {
    h.phase = 'unloadPick';
    h.menuSel = BACK_ROW;
    h.refresh();
  },
  highlights: (input) => markTiles(input.unload, 'unload'),
};
