/**
 * [CAMBIO] Lo que hace cada accion del registro al elegirla. Cuando vale, su texto y su cursor estan
 * en controls/actions.ts (puro, sin escena); aqui, que pasa en la partida. El tipo de ACTION_RUNNERS
 * pide una entrada por cada `ActionId`: una accion nueva sin la suya no compila.
 */
import { cancelCommand, disbandSquad, formSquad, leaveSquad, pruneSquads, squadById, SQUAD_NAME_MAX } from '../../core/squads';
import type { CommandKind, GameState, Pos, Unit } from '../../core/model';
import { exactSquad, type ActionId } from '../../controls/actions';
import { showToast, ui } from '../../hud/store';
import { t } from '../../settings';

/** Una accion que se va a cumplir: con quien y donde. */
export interface ActionRun {
  units: Unit[];
  /** La casilla (null: desde el menu de grupo o de la unidad, sin casilla). */
  at: Pos | null;
  /** La unidad elegida que se esta moviendo, si la accion es solo suya (null con un grupo). */
  moving: Unit | null;
  /** Viene del menu de una unidad: la orden respeta lo ya movido. Sin decir, cuenta si se esta moviendo. */
  fromUnitMenu?: boolean;
}

/** Lo que las acciones necesitan para cumplirse (se lo da Orders). */
export interface ActionRunHost {
  readonly state: GameState;
  moveCursorTo(p: Pos, follow: boolean): void;
  /** Soltar la unidad elegida en `at` (como al arrastrarla); `drop`: hacer ya lo logico (capturar...). */
  commit(at: Pos, opts: { drop?: boolean }): Promise<void>;
  groupMove(goal: Pos): Promise<void>;
  /** Orden de varios turnos para la unidad elegida. */
  giveOrder(unit: Unit, goal: Pos): Promise<void>;
  /** Orden con destino sin casilla: ahora se elige en el mapa (fase 'target'). */
  pickOrderTarget(kind: CommandKind, units: Unit[], fromUnitMenu: boolean): void;
  /** Orden con destino en `at`: se da y las que pueden la empiezan ya. */
  placeOrder(kind: CommandKind, units: Unit[], fromUnitMenu: boolean, at: Pos): Promise<void>;
  /** La accion ya esta hecha: cerrar el menu del que salio y redibujar. */
  finish(): void;
}

export interface ActionRunner {
  /**
   * Con Mayusculas + clic derecho la accion no se hace ahora: queda como esta orden, que se cumple al
   * terminar el turno. Sin ella, la accion no se puede dejar para despues.
   */
  queueAs?: CommandKind;
  run(action: ActionRun, host: ActionRunHost): void | Promise<void>;
}

/** Soltar la unidad elegida en la casilla, como al arrastrarla hasta alli. */
function commitMoving(action: ActionRun, host: ActionRunHost, opts: { drop?: boolean } = {}): Promise<void> {
  host.moveCursorTo(action.at!, false);
  return host.commit(action.at!, opts);
}

/** Atacar o capturar en la casilla: la unidad elegida va; un grupo recibe la orden y la empieza ya. */
function attackOrCapture(kind: 'attack' | 'capture') {
  return (action: ActionRun, host: ActionRunHost) => {
    if (!action.at) return;
    if (action.moving) return commitMoving(action, host, { drop: kind === 'capture' });
    return host.placeOrder(kind, action.units, false, action.at);
  };
}

/** Unirse o subir: solo valen con la unidad elegida (ver `ok` en ACTIONS). */
function joinTile(action: ActionRun, host: ActionRunHost) {
  if (!action.at || !action.moving) return;
  return commitMoving(action, host);
}

/** Orden con destino desde un menu: sin casilla, se pide despues; con ella, se da ya. */
function orderWithTarget(kind: CommandKind) {
  return (action: ActionRun, host: ActionRunHost) => {
    const fromUnitMenu = action.fromUnitMenu ?? !!action.moving;
    if (!action.at) return host.pickOrderTarget(kind, action.units, fromUnitMenu);
    return host.placeOrder(kind, action.units, fromUnitMenu, action.at);
  };
}

/** Accion inmediata sobre la partida (quitar ordenes, escuadras): se hace, y se cierra el menu. */
function instant(change: (s: GameState, units: Unit[]) => void) {
  return (action: ActionRun, host: ActionRunHost) => {
    change(host.state, action.units);
    host.finish();
  };
}

function cancelOrders(s: GameState, units: Unit[]): void {
  cancelCommand(s, units);
  showToast(t('orderCancelled'));
}

function announceNewSquad(s: GameState, units: Unit[]): void {
  const squad = formSquad(s, units);
  if (!squad) return;
  const keyHint = squad.key ? ` · ${t('squadKeyHint')} ${squad.key}` : '';
  showToast(`${t('squadFormed')}: ${squad.name}${keyHint}`);
}

function leaveSquads(s: GameState, units: Unit[]): void {
  for (const unit of units) leaveSquad(s, unit);
  pruneSquads(s);
}

/** Abre el cuadro para escribir el nombre (hud/overlays/RenameSquad.tsx). */
function askSquadName(s: GameState, units: Unit[]): void {
  const id = exactSquad(s, units);
  if (id !== null) ui.set({ rename: { id, name: squadById(s, id)?.name ?? '', max: SQUAD_NAME_MAX } });
}

function disbandWholeSquad(s: GameState, units: Unit[]): void {
  const id = exactSquad(s, units);
  if (id !== null) disbandSquad(s, id);
}

export const ACTION_RUNNERS: { readonly [Id in ActionId]: ActionRunner } = {
  attack: { queueAs: 'attack', run: attackOrCapture('attack') },
  capture: { queueAs: 'capture', run: attackOrCapture('capture') },
  merge: { run: joinTile },
  load: { run: joinTile },
  move: {
    // Ir y quedarse alli: con Mayusculas, una orden de defender la casilla.
    queueAs: 'defend',
    run: (action, host) => {
      if (!action.at) return;
      if (action.moving) return commitMoving(action, host);
      host.moveCursorTo(action.at, false);
      return host.groupMove(action.at);
    },
  },
  go: {
    queueAs: 'defend',
    run: (action, host) => {
      if (action.at && action.moving) return host.giveOrder(action.moving, action.at);
    },
  },
  cmdAttack: { run: orderWithTarget('attack') },
  cmdCapture: { run: orderWithTarget('capture') },
  cmdDefend: { run: orderWithTarget('defend') },
  cmdCancel: { run: instant(cancelOrders) },
  squadForm: { run: instant(announceNewSquad) },
  squadLeave: { run: instant(leaveSquads) },
  squadRename: { run: instant(askSquadName) },
  squadDisband: { run: instant(disbandWholeSquad) },
};
