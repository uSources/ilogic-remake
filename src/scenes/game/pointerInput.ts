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
  visible(p: Pos): boolean;
  intentAt(t: Pos): Intent;
  actionCtx(at: Pos | null): ActionCtx | null;
  runAction(id: ActionId, at: Pos | null, opts: { queue: boolean }): Promise<void>;
  openOrderMenu(at: Pos): boolean;
  inspect(u: Unit): void;
  accept(): void;
  back(): void;
  toMap(): void;
  refresh(): void;
  refreshHud(): void;
  cursorMoved(): void;
  moveCursorTo(p: Pos, follow: boolean): void;
  setPointer(kind: CursorKind): void;
  updatePointer(tile: Pos | null): void;
  commit(t: Pos, opts?: { drop?: boolean; wait?: boolean }): Promise<void>;
  waitSelected(): void;
  groupMove(goal: Pos): Promise<void>;
  selectUnit(u: Unit): void;
  acceptMap(c: Pos): void;
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
const isVisibleOnMap = (h: PointerHost, unit: Unit) => unit.carrier === null && (isPlayer(unit) || h.visible(unit));

/** Añadir o quitar `unit` de lo elegido, como un clic con Mayusculas. */
function toggleInSelection(picks: GroupSelection, unit: Unit | null): void {
  picks.apply(clickSelect(picks.selection(), unit, TOGGLE_ONE, () => []));
}

export function pointerTarget(h: PointerHost): PointerTarget {
  return {
    later: (ms, fn) => {
      const event = h.scene.time.delayedCall(ms, fn);
      return { cancel: () => event.remove(false) };
    },
    ended: () => h.ended,
    busy: () => h.phase === 'busy',
    fastForward: () => h.skipAnimations(),
    carrying: () => h.carry.active,
    now: () => h.scene.time.now,
    // [CAMBIO] Con el raton, arrastrar desde una casilla sin unidad propia es recuadro (en el mapa o con
    // una unidad elegida); con el dedo, solo en "Elegir varias".
    canBox: (touch) => (touch ? h.selection.multi && h.phase === 'map' : h.phase === 'map' || h.phase === 'move'),
    pickAt: (x, y) => pickableUnitAt(h, h.view.tileAtScreen(x, y)),
    touchStart: () => touchHint(),
    rightClick: (x, y, mods) => rightClick(h, h.view.tileAtScreen(x, y), mods),
    beginCarry: (uid, touch, held) => h.carry.begin(uid, touch, held),
    carryTo: (x, y) => h.carry.moveTo(x, y),
    dropCarry: (x, y, shift) => h.carry.drop(h.view.tileAtScreen(x, y), shift),
    cancelCarry: () => h.carry.cancel(),
    boxUpdate: (box) => h.view.setBox(box),
    boxEnd: (box) => boxEnd(h, box),
    pan: (dx, dy) => {
      h.view.scrollBy(dx, dy);
      h.refreshHud();
    },
    carryTouch: () => h.carry.touch,
    edgeScrollable: () => !MENU_PHASES.includes(h.phase),
    // Sin rehacer el HUD: update() recoloca los bocadillos si la camara se ha movido.
    edgeScroll: (dx, dy) => h.view.scrollBy(dx, dy),
    zoomAt: (dir, x, y, wheel) => {
      h.view.zoomStep(dir, x, y);
      // La rueda llega muchas veces seguidas: el HUD, una vez al final del fotograma.
      if (wheel) h.scene.time.delayedCall(0, () => h.refreshHud());
      else h.refreshHud();
    },
    hover: (x, y) => {
      if (h.phase === 'busy') return h.setPointer('default');
      const tile = h.view.tileAtScreen(x, y);
      if (tile && CURSOR_PHASES.includes(h.phase)) h.moveCursorTo(tile, false);
      h.updatePointer(tile);
    },
    tap: (x, y, info) => pointerTap(h, x, y, info),
    longPress: (x, y) => longPress(h, h.view.tileAtScreen(x, y)),
  };
}

/** ¿Se coge la unidad de esta casilla? Una propia que se puede mover (en el mapa, o la que esta elegida). */
function pickableUnitAt(h: PointerHost, tile: Pos | null): number | null {
  const unit = tile ? unitAt(h.state, tile.x, tile.y) : undefined;
  if (!unit || !isPlayer(unit) || !unit.active || !unit.canMove || unit.carrier !== null) return null;
  const isSelectedOrFree = h.phase === 'map' || (h.phase === 'move' && h.sel?.uid === unit.uid);
  return isSelectedOrFree ? unit.uid : null;
}

/** Clic derecho: con algo elegido, la accion de esa casilla; sobre una unidad, su alcance; si no, atras. */
function rightClick(h: PointerHost, tile: Pos | null, mods: { alt: boolean; shift: boolean }): void {
  if (h.carry.active) return h.carry.cancel();
  // Sobre la propia unidad elegida sigue siendo atras.
  const isOnSelected = !!tile && !!h.sel && h.phase !== 'map' && samePos(tile, h.sel);
  const canAct = (h.phase === 'map' || h.phase === 'move') && h.selection.units().length > 0;
  if (tile && !isOnSelected && canAct) return smartRightClick(h, tile, mods);
  if (tile && !isOnSelected && h.openOrderMenu(tile)) return;
  // Clic derecho sobre una unidad en el mapa: ver su alcance (si no, atras).
  const unit = tile && h.phase === 'map' ? unitAt(h.state, tile.x, tile.y) : undefined;
  if (unit && isVisibleOnMap(h, unit) && unit.uid !== h.inspectUid) return h.inspect(unit);
  h.back();
}

/**
 * [CAMBIO] Clic derecho con lo elegido: lo que toca en esa casilla (ver controls/actions.ts); con
 * Mayusculas, se deja como orden sin gastar el turno; con Alt, el menu completo.
 */
function smartRightClick(h: PointerHost, tile: Pos, mods: { alt: boolean; shift: boolean }): void {
  if (mods.alt) return void h.openOrderMenu(tile);
  const ctx = h.actionCtx(tile);
  const action = ctx && smartAction(ctx);
  if (action) return void h.runAction(action.id, tile, { queue: mods.shift });
  if (h.openOrderMenu(tile)) return;
  showToast(t('smartNone'));
}

/**
 * [CAMBIO] Recuadro: las unidades propias de dentro (con Mayusculas o Ctrl, se añaden). Un clic
 * con Mayusculas o Ctrl (recuadro sin tamaño) añade o quita la de debajo.
 */
function boxEnd(h: PointerHost, box: { x0: number; y0: number; x1: number; y1: number; add?: boolean }): void {
  const picks = h.selection;
  h.view.setBox(null);
  if (h.phase !== 'map' && h.phase !== 'move') return h.refresh();
  const isClick = Math.abs(box.x1 - box.x0) < MIN_BOX_PX && Math.abs(box.y1 - box.y0) < MIN_BOX_PX;
  if (isClick) return toggleAtScreen(h, box.x1, box.y1);
  const area = h.view.tilesInBox(box);
  const isInside = (unit: Unit) => unit.x >= area.x0 && unit.x <= area.x1 && unit.y >= area.y0 && unit.y <= area.y1;
  const inside = h.state.units.filter((unit) => picks.selectable(unit) && isInside(unit));
  picks.apply(boxSelect(picks.selection(), inside, !!box.add));
}

function toggleAtScreen(h: PointerHost, x: number, y: number): void {
  const picks = h.selection;
  const tile = h.view.tileAtScreen(x, y);
  const unit = tile ? unitAt(h.state, tile.x, tile.y) : undefined;
  if (tile) h.moveCursorTo(tile, false);
  toggleInSelection(picks, unit && picks.selectable(unit) ? unit : null);
}

/** Mantener pulsado: con lo elegido, ordenes en esa casilla; si no, el cursor alli y el alcance de la unidad. */
function longPress(h: PointerHost, tile: Pos | null): boolean {
  // [CAMBIO] Con una unidad o un grupo elegido, mantener pulsada la casilla de destino: ordenes alli.
  if (tile && h.openOrderMenu(tile)) {
    navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
    return true;
  }
  if (h.phase !== 'map') return false;
  if (!tile) return true;
  navigator.vibrate?.(LONG_PRESS_VIBRATION_MS);
  h.view.cursor = { ...tile };
  const unit = unitAt(h.state, tile.x, tile.y);
  if (unit && isVisibleOnMap(h, unit)) h.inspect(unit);
  else h.cursorMoved();
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
function pointerTap(h: PointerHost, x: number, y: number, info: TapInfo): void {
  if (h.scene.time.now < h.inputLockUntil) return;
  // (La barra superior y los menus son HTML: sus clics no llegan aqui.)
  const tile = h.view.tileAtScreen(x, y);
  if (tile && isDoubleClickOnMoved(h, tile)) return h.waitSelected();
  // Con el menu de grupo abierto, un clic en el mapa mueve el grupo ahi.
  if (h.phase === 'groupMenu' && tile && h.selection.group.size) return moveGroupTo(h, tile);
  // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
  if (MENU_PHASES.includes(h.phase)) return h.back();
  if (!tile) return;
  if (h.phase === 'map' && h.selection.multi && toggleOwnAt(h, tile)) return;
  // [CAMBIO] Raton: seleccion como en los juegos de estrategia en tiempo real (ver controls/selection.ts).
  if (!info.touch && selectClick(h, tile, info)) return;
  // Dedo, en el mapa o con una unidad elegida: un toque hace directamente lo logico (ver ui/touch.ts).
  if (info.touch && (h.phase === 'map' || h.phase === 'move')) return touchTap(h, tile);
  if (h.phase === 'move') {
    // Al mover, un clic es como soltar: en un enemigo, ataca; en un edificio, se mueve (y sale el menu).
    h.moveCursorTo(tile, false);
    return void h.commit(tile, { wait: info.shift });
  }
  // Tactil, en el resto (elegir objetivo, descargar...): primer toque señala, segundo confirma.
  if (info.touch && !samePos(tile, h.view.cursor)) return h.moveCursorTo(tile, false);
  h.moveCursorTo(tile, false);
  h.accept();
}

/** Doble clic en el destino recien alcanzado (con el menu de la unidad abierto). */
function isDoubleClickOnMoved(h: PointerHost, tile: Pos): boolean {
  const last = h.lastCommit;
  if (h.phase !== 'unitMenu' || !h.sel || !samePos(tile, h.sel) || !last) return false;
  return h.scene.time.now - last.time < MOVE_AND_WAIT_MS;
}

function moveGroupTo(h: PointerHost, tile: Pos): void {
  h.toMap();
  h.moveCursorTo(tile, false);
  void h.groupMove(tile);
}

/** [CAMBIO] "Elegir varias" (para el dedo, sin recuadro): tocar una unidad propia la añade o la quita. */
function toggleOwnAt(h: PointerHost, tile: Pos): boolean {
  const own = unitAt(h.state, tile.x, tile.y);
  if (!own || !h.selection.selectable(own)) return false;
  h.moveCursorTo(tile, false);
  toggleInSelection(h.selection, own);
  return true;
}

/**
 * [CAMBIO] Clic de raton que elige unidades (en el mapa, o con una unidad elegida). true si lo ha
 * resuelto. Con Mayusculas o Ctrl, doble clic o un grupo ya elegido, cambia la seleccion; con una
 * unidad elegida, clic en otra propia a la que no se puede ir (ni unirse ni subir) la elige a ella.
 */
function selectClick(h: PointerHost, tile: Pos, info: TapInfo): boolean {
  if (h.phase !== 'map' && h.phase !== 'move') return false;
  const picks = h.selection;
  const here = unitAt(h.state, tile.x, tile.y);
  const hit = here && picks.selectable(here) ? here : null;
  const hasModifier = info.shift || info.ctrl || info.count >= 2;
  const isGrouping = info.shift || info.ctrl || (info.count >= 2 && !!hit) || picks.group.size > 0;
  if (h.phase === 'move' && !clickPicksAnother(h, tile, hit, hasModifier, isGrouping)) return false;
  if (h.phase === 'map' && !isGrouping) return false;
  h.moveCursorTo(tile, false);
  const mods = { shift: info.shift, ctrl: info.ctrl, count: info.count };
  const next: Selection = clickSelect(picks.selection(), hit, mods, (unit) => picks.sameTypeOnScreen(unit));
  picks.apply(next);
  return true;
}

/** Moviendo una unidad: ¿el clic cambia lo elegido, o es "ir alli" (atacar, unirse...)? */
function clickPicksAnother(h: PointerHost, tile: Pos, hit: Unit | null, hasModifier: boolean, isGrouping: boolean): boolean {
  if (!h.sel || !hit) return false;
  // Sobre la propia elegida, un clic normal sigue siendo "quedarse aqui" (menu de acciones).
  if (hit.uid === h.sel.uid && !hasModifier) return false;
  return isGrouping || h.intentAt(tile).kind === 'none';
}

/** Un toque con el dedo en el mapa (fases map y move). */
function touchTap(h: PointerHost, tile: Pos): void {
  const unit = unitAt(h.state, tile.x, tile.y);
  const own = unit && isPlayer(unit) && unit.active && unit.carrier === null ? unit : null;
  if (h.phase === 'move') return touchTapMoving(h, tile, own);
  const building = buildingAt(h.state, tile.x, tile.y);
  const act = mapTap({
    ownActive: !!own,
    buyHere: !unit && !!building && building.owner === 0 && canBuyAt(h.state, building),
    visibleUnit: !!unit && isVisibleOnMap(h, unit),
    inspectingThis: !!unit && unit.uid === h.inspectUid,
  });
  h.moveCursorTo(tile, false);
  if (act === 'point') {
    if (h.inspectUid === null) return;
    h.inspectUid = null;
    return h.refresh();
  }
  if (h.selection.group.size) h.selection.group.clear();
  h.acceptMap(tile);
}

/** Un toque con el dedo mientras se mueve una unidad. */
function touchTapMoving(h: PointerHost, tile: Pos, own: Unit | null): void {
  const intent = h.intentAt(tile);
  const act = moveTap({
    intent: intent.kind,
    atCursor: samePos(tile, h.view.cursor),
    otherOwnActive: !!own && own.uid !== h.sel?.uid,
  });
  switch (act) {
    case 'commit':
      h.moveCursorTo(tile, false);
      // [CAMBIO] Tocar otra vez la propia unidad abre su menu (esperar, ordenes...): con el dedo no
      // habia otra forma de llegar a el.
      if (intent.kind === 'stay') return void h.commit(tile);
      // Como soltar arrastrando: captura directamente, y espera sola si no hay nada mas que hacer.
      return void h.commit(tile, { drop: true });
    case 'preview':
      return h.moveCursorTo(tile, false);
    case 'reselect':
      h.toMap();
      h.view.cursor = { ...tile };
      return h.selectUnit(own!);
    case 'deselect':
      h.toMap();
      return h.moveCursorTo(tile, false);
    default:
      return;
  }
}
