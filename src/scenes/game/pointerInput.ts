/**
 * Lo que significa cada gesto del raton o del dedo en la partida. Que gesto es (toque, arrastre,
 * pellizco...) lo decide el adaptador (src/controls/pointer.ts); aqui solo se cumple, a traves de lo
 * que la escena ofrece en `PointerHost`.
 */
import type Phaser from 'phaser';
import { samePos } from '../../core/geom';
import { buildingAt, canBuyAt, unitAt } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/model';
import { smartAction, type ActionCtx, type ActionId, type CursorKind } from '../../controls/actions';
import type { PointerTarget, TapInfo } from '../../controls/pointer';
import { boxSelect, clickSelect, type Selection } from '../../controls/selection';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import type { MapView } from '../../ui/mapView';
import { mapTap, moveTap } from '../../ui/touch';
import type { Carry } from './carry';
import type { GroupSelection } from './groupSelection';
import { CURSOR_PHASES, MENU_PHASES, type Intent, type Phase } from './types';

/** Lo que los gestos necesitan de la escena. */
export interface PointerHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  readonly phase: Phase;
  readonly ended: boolean;
  /** La unidad elegida para moverla (o en su menu). */
  readonly sel: Unit | null;
  /** Ignorar clics hasta este instante (tras el turno enemigo). */
  readonly inputLockUntil: number;
  /** Ultimo movimiento confirmado (para el doble clic: mover y esperar). */
  readonly lastCommit: { at: Pos; time: number } | null;
  /** Unidad cuyo alcance se esta mostrando. */
  inspectUid: number | null;
  readonly selection: GroupSelection;
  readonly carry: Carry;
  /** Saltarse las animaciones que esten en marcha. */
  skipAnimations(): void;
  visible(pos: Pos): boolean;
  intentAt(tile: Pos): Intent;
  actionCtx(at: Pos | null): ActionCtx | null;
  runAction(id: ActionId, at: Pos | null, opts: { queue: boolean }): Promise<void>;
  openOrderMenu(at: Pos): boolean;
  inspect(unit: Unit): void;
  accept(): void;
  back(): void;
  toMap(): void;
  refresh(): void;
  refreshHud(): void;
  cursorMoved(): void;
  moveCursorTo(pos: Pos, follow: boolean): void;
  setPointer(kind: CursorKind): void;
  updatePointer(tile: Pos | null): void;
  commit(tile: Pos, opts?: { drop?: boolean; wait?: boolean }): Promise<void>;
  waitSelected(): void;
  groupMove(goal: Pos): Promise<void>;
  selectUnit(unit: Unit): void;
  acceptMap(tile: Pos): void;
}

/** Doble clic en la unidad recien movida: mover y esperar (ms entre el movimiento y el clic). */
const MOVE_AND_WAIT_MS = 450;
/** Un recuadro mas pequeño (en pixeles) es un clic con Mayusculas o Ctrl, no un recuadro. */
const MIN_BOX_PX = 6;
/** Vibracion corta al coger una unidad o mantener pulsado (ms). */
const LONG_PRESS_VIBRATION_MS = 12;

/** Con Mayusculas: añadir o quitar esta unidad de lo elegido. */
const TOGGLE_ONE = { shift: true, ctrl: false, count: 1 };

const isPlayer = (unit: Unit) => unit.team === 0;

/** Una unidad que el jugador puede ver en el mapa (suya, o enemiga a la vista). */
const isVisibleOnMap = (pointerHost: PointerHost, unit: Unit) => unit.carrier === null && (isPlayer(unit) || pointerHost.visible(unit));

/** Añadir o quitar `unit` de lo elegido, como un clic con Mayusculas. */
function toggleInSelection(picks: GroupSelection, unit: Unit | null): void {
  picks.apply(clickSelect(picks.selection(), unit, TOGGLE_ONE, () => []));
}

export function pointerTarget(host: PointerHost): PointerTarget {
  return {
    later: (ms, fn) => {
      const event = host.scene.time.delayedCall(ms, fn);
      return { cancel: () => event.remove(false) };
    },
    ended: () => host.ended,
    busy: () => host.phase === 'busy',
    fastForward: () => host.skipAnimations(),
    carrying: () => host.carry.active,
    now: () => host.scene.time.now,
    // [CAMBIO] Con el raton, arrastrar desde una casilla sin unidad propia es recuadro (en el mapa o con
    // una unidad elegida); con el dedo, solo en "Elegir varias".
    canBox: (touch) => (touch ? host.selection.multi && host.phase === 'map' : host.phase === 'map' || host.phase === 'move'),
    pickAt: (x, y) => pickableUnitAt(host, host.view.tileAtScreen(x, y)),
    touchStart: () => touchHint(),
    rightClick: (x, y, mods) => rightClick(host, host.view.tileAtScreen(x, y), mods),
    beginCarry: (uid, touch, held) => host.carry.begin(uid, touch, held),
    carryTo: (x, y) => host.carry.moveTo(x, y),
    dropCarry: (x, y, shift) => host.carry.drop(host.view.tileAtScreen(x, y), shift),
    cancelCarry: () => host.carry.cancel(),
    boxUpdate: (box) => host.view.setBox(box),
    boxEnd: (box) => boxEnd(host, box),
    pan: (dx, dy) => {
      host.view.scrollBy(dx, dy);
      host.refreshHud();
    },
    carryTouch: () => host.carry.touch,
    edgeScrollable: () => !MENU_PHASES.includes(host.phase),
    // Sin rehacer el HUD: update() recoloca los bocadillos si la camara se ha movido.
    edgeScroll: (dx, dy) => host.view.scrollBy(dx, dy),
    zoomAt: (dir, x, y, wheel) => {
      host.view.zoomStep(dir, x, y);
      // La rueda llega muchas veces seguidas: el HUD, una vez al final del fotograma.
      if (wheel) host.scene.time.delayedCall(0, () => host.refreshHud());
      else host.refreshHud();
    },
    hover: (x, y) => {
      if (host.phase === 'busy') return host.setPointer('default');
      const tile = host.view.tileAtScreen(x, y);
      if (tile && CURSOR_PHASES.includes(host.phase)) host.moveCursorTo(tile, false);
      host.updatePointer(tile);
    },
    tap: (x, y, info) => pointerTap(host, x, y, info),
    longPress: (x, y) => longPress(host, host.view.tileAtScreen(x, y)),
  };
}

/** ¿Se coge la unidad de esta casilla? Una propia que se puede mover (en el mapa, o la que esta elegida). */
function pickableUnitAt(host: PointerHost, tile: Pos | null): number | null {
  const unit = tile ? unitAt(host.state, tile) : undefined;
  if (!unit || !isPlayer(unit) || !unit.active || !unit.canMove || unit.carrier !== null) return null;
  const isSelectedOrFree = host.phase === 'map' || (host.phase === 'move' && host.sel?.uid === unit.uid);
  return isSelectedOrFree ? unit.uid : null;
}

/** Clic derecho: con algo elegido, la accion de esa casilla; sobre una unidad, su alcance; si no, atras. */
function rightClick(host: PointerHost, tile: Pos | null, mods: { alt: boolean; shift: boolean }): void {
  if (host.carry.active) return host.carry.cancel();
  // Sobre la propia unidad elegida sigue siendo atras.
  const isOnSelected = !!tile && !!host.sel && host.phase !== 'map' && samePos(tile, host.sel);
  const canAct = (host.phase === 'map' || host.phase === 'move') && host.selection.units().length > 0;
  if (tile && !isOnSelected && canAct) return smartRightClick(host, tile, mods);
  if (tile && !isOnSelected && host.openOrderMenu(tile)) return;
  // Clic derecho sobre una unidad en el mapa: ver su alcance (si no, atras).
  const unit = tile && host.phase === 'map' ? unitAt(host.state, tile) : undefined;
  if (unit && isVisibleOnMap(host, unit) && unit.uid !== host.inspectUid) return host.inspect(unit);
  host.back();
}

/**
 * [CAMBIO] Clic derecho con lo elegido: lo que toca en esa casilla (ver controls/actions.ts); con
 * Mayusculas, se deja como orden sin gastar el turno; con Alt, el menu completo.
 */
function smartRightClick(host: PointerHost, tile: Pos, mods: { alt: boolean; shift: boolean }): void {
  if (mods.alt) return void host.openOrderMenu(tile);
  const ctx = host.actionCtx(tile);
  const action = ctx && smartAction(ctx);
  if (action) return void host.runAction(action.id, tile, { queue: mods.shift });
  if (host.openOrderMenu(tile)) return;
  showToast(t('smartNone'));
}

/**
 * [CAMBIO] Recuadro: las unidades propias de dentro (con Mayusculas o Ctrl, se añaden). Un clic
 * con Mayusculas o Ctrl (recuadro sin tamaño) añade o quita la de debajo.
 */
function boxEnd(host: PointerHost, box: { x0: number; y0: number; x1: number; y1: number; add?: boolean }): void {
  const picks = host.selection;
  host.view.setBox(null);
  if (host.phase !== 'map' && host.phase !== 'move') return host.refresh();
  const isClick = Math.abs(box.x1 - box.x0) < MIN_BOX_PX && Math.abs(box.y1 - box.y0) < MIN_BOX_PX;
  if (isClick) return toggleAtScreen(host, box.x1, box.y1);
  const area = host.view.tilesInBox(box);
  const isInside = (unit: Unit) => unit.x >= area.x0 && unit.x <= area.x1 && unit.y >= area.y0 && unit.y <= area.y1;
  const inside = host.state.units.filter((unit) => picks.selectable(unit) && isInside(unit));
  picks.apply(boxSelect(picks.selection(), inside, !!box.add));
}

function toggleAtScreen(host: PointerHost, x: number, y: number): void {
  const picks = host.selection;
  const tile = host.view.tileAtScreen(x, y);
  const unit = tile ? unitAt(host.state, tile) : undefined;
  if (tile) host.moveCursorTo(tile, false);
  toggleInSelection(picks, unit && picks.selectable(unit) ? unit : null);
}

/** Mantener pulsado: con lo elegido, ordenes en esa casilla; si no, el cursor alli y el alcance de la unidad. */
function longPress(host: PointerHost, tile: Pos | null): boolean {
  // [CAMBIO] Con una unidad o un grupo elegido, mantener pulsada la casilla de destino: ordenes alli.
  if (tile && host.openOrderMenu(tile)) {
    navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
    return true;
  }
  if (host.phase !== 'map') return false;
  if (!tile) return true;
  navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
  host.view.cursor = { ...tile };
  const unit = unitAt(host.state, tile);
  if (unit && isVisibleOnMap(host, unit)) host.inspect(unit);
  else host.cursorMoved();
  return true;
}

/** La primera vez que se juega con el dedo, explicar los gestos. */
function touchHint(): void {
  try {
    if (localStorage.getItem('ilogic.touchHint')) return;
    localStorage.setItem('ilogic.touchHint', '1');
  } catch {
    return;
  }
  showToast(t('touchHint'));
}

/** Un toque o un clic sin arrastrar. */
function pointerTap(host: PointerHost, x: number, y: number, info: TapInfo): void {
  if (host.scene.time.now < host.inputLockUntil) return;
  // (La barra superior y los menus son HTML: sus clics no llegan aqui.)
  const tile = host.view.tileAtScreen(x, y);
  if (tile && isDoubleClickOnMoved(host, tile)) return host.waitSelected();
  // Con el menu de grupo abierto, un clic en el mapa mueve el grupo ahi.
  if (host.phase === 'groupMenu' && tile && host.selection.group.size) return moveGroupTo(host, tile);
  // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
  if (MENU_PHASES.includes(host.phase)) return host.back();
  if (!tile) return;
  if (host.phase === 'map' && host.selection.multi && toggleOwnAt(host, tile)) return;
  // [CAMBIO] Raton: seleccion como en los juegos de estrategia en tiempo real (ver controls/selection.ts).
  if (!info.touch && selectClick(host, tile, info)) return;
  // Dedo, en el mapa o con una unidad elegida: un toque hace directamente lo logico (ver ui/touch.ts).
  if (info.touch && (host.phase === 'map' || host.phase === 'move')) return touchTap(host, tile);
  if (host.phase === 'move') {
    // Al mover, un clic es como soltar: en un enemigo, ataca; en un edificio, se mueve (y sale el menu).
    host.moveCursorTo(tile, false);
    return void host.commit(tile, { wait: info.shift });
  }
  // Tactil, en el resto (elegir objetivo, descargar...): primer toque señala, segundo confirma.
  if (info.touch && !samePos(tile, host.view.cursor)) return host.moveCursorTo(tile, false);
  host.moveCursorTo(tile, false);
  host.accept();
}

/** Doble clic en el destino recien alcanzado (con el menu de la unidad abierto). */
function isDoubleClickOnMoved(host: PointerHost, tile: Pos): boolean {
  const last = host.lastCommit;
  if (host.phase !== 'unitMenu' || !host.sel || !samePos(tile, host.sel) || !last) return false;
  return host.scene.time.now - last.time < MOVE_AND_WAIT_MS;
}

function moveGroupTo(host: PointerHost, tile: Pos): void {
  host.toMap();
  host.moveCursorTo(tile, false);
  void host.groupMove(tile);
}

/** [CAMBIO] "Elegir varias" (para el dedo, sin recuadro): tocar una unidad propia la añade o la quita. */
function toggleOwnAt(host: PointerHost, tile: Pos): boolean {
  const own = unitAt(host.state, tile);
  if (!own || !host.selection.selectable(own)) return false;
  host.moveCursorTo(tile, false);
  toggleInSelection(host.selection, own);
  return true;
}

/**
 * [CAMBIO] Clic de raton que elige unidades (en el mapa, o con una unidad elegida). true si lo ha
 * resuelto. Con Mayusculas o Ctrl, doble clic o un grupo ya elegido, cambia la seleccion; con una
 * unidad elegida, clic en otra propia a la que no se puede ir (ni unirse ni subir) la elige a ella.
 */
function selectClick(host: PointerHost, tile: Pos, info: TapInfo): boolean {
  if (host.phase !== 'map' && host.phase !== 'move') return false;
  const picks = host.selection;
  const here = unitAt(host.state, tile);
  const hit = here && picks.selectable(here) ? here : null;
  const hasModifier = info.shift || info.ctrl || info.count >= 2;
  const isGrouping = info.shift || info.ctrl || (info.count >= 2 && !!hit) || picks.group.size > 0;
  if (host.phase === 'move' && !clickPicksAnother(host, tile, hit, hasModifier, isGrouping)) return false;
  if (host.phase === 'map' && !isGrouping) return false;
  host.moveCursorTo(tile, false);
  const mods = { shift: info.shift, ctrl: info.ctrl, count: info.count };
  const next: Selection = clickSelect(picks.selection(), hit, mods, (unit) => picks.sameTypeOnScreen(unit));
  picks.apply(next);
  return true;
}

/** Moviendo una unidad: ¿el clic cambia lo elegido, o es "ir alli" (atacar, unirse...)? */
function clickPicksAnother(host: PointerHost, tile: Pos, hit: Unit | null, hasModifier: boolean, isGrouping: boolean): boolean {
  if (!host.sel || !hit) return false;
  // Sobre la propia elegida, un clic normal sigue siendo "quedarse aqui" (menu de acciones).
  if (hit.uid === host.sel.uid && !hasModifier) return false;
  return isGrouping || host.intentAt(tile).kind === 'none';
}

/** Un toque con el dedo en el mapa (fases map y move). */
function touchTap(host: PointerHost, tile: Pos): void {
  const unit = unitAt(host.state, tile);
  const own = unit && isPlayer(unit) && unit.active && unit.carrier === null ? unit : null;
  if (host.phase === 'move') return touchTapMoving(host, tile, own);
  const building = buildingAt(host.state, tile);
  const act = mapTap({
    ownActive: !!own,
    buyHere: !unit && !!building && building.owner === 0 && canBuyAt(host.state, building),
    visibleUnit: !!unit && isVisibleOnMap(host, unit),
    inspectingThis: !!unit && unit.uid === host.inspectUid,
  });
  host.moveCursorTo(tile, false);
  if (act === 'point') {
    if (host.inspectUid === null) return;
    host.inspectUid = null;
    return host.refresh();
  }
  if (host.selection.group.size) host.selection.group.clear();
  host.acceptMap(tile);
}

/** Un toque con el dedo mientras se mueve una unidad. */
function touchTapMoving(host: PointerHost, tile: Pos, own: Unit | null): void {
  const intent = host.intentAt(tile);
  const act = moveTap({
    intent: intent.kind,
    atCursor: samePos(tile, host.view.cursor),
    otherOwnActive: !!own && own.uid !== host.sel?.uid,
  });
  switch (act) {
    case 'commit':
      host.moveCursorTo(tile, false);
      // [CAMBIO] Tocar otra vez la propia unidad abre su menu (esperar, ordenes...): con el dedo no
      // habia otra forma de llegar a el.
      if (intent.kind === 'stay') return void host.commit(tile);
      // Como soltar arrastrando: captura directamente, y espera sola si no hay nada mas que hacer.
      return void host.commit(tile, { drop: true });
    case 'preview':
      return host.moveCursorTo(tile, false);
    case 'reselect':
      host.toMap();
      host.view.cursor = { ...tile };
      return host.selectUnit(own!);
    case 'deselect':
      host.toMap();
      return host.moveCursorTo(tile, false);
    default:
      return;
  }
}
