/**
 * Lo que significa cada gesto del raton o del dedo en la partida. Que gesto es (toque, arrastre,
 * pellizco...) lo decide el adaptador (src/controls/pointer.ts); aqui solo se cumple, a traves de lo
 * que la escena ofrece en `PointerHost`.
 */
import type Phaser from 'phaser';
import { samePos } from '../../core/geom';
import { buildingAt, canBuyAt, unitAt } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/types';
import { smartAction, type ActionCtx, type ActionId, type CursorKind } from '../../controls/actions';
import type { PointerTarget, TapInfo } from '../../controls/pointer';
import { boxSelect, clickSelect } from '../../controls/selection';
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

export function pointerTarget(h: PointerHost): PointerTarget {
  return {
    later: (ms, fn) => {
      const ev = h.scene.time.delayedCall(ms, fn);
      return { cancel: () => ev.remove(false) };
    },
    ended: () => h.ended,
    busy: () => h.phase === 'busy',
    fastForward: () => h.skipAnimations(),
    carrying: () => h.carry.active,
    now: () => h.scene.time.now,
    // [CAMBIO] Con el raton, arrastrar desde una casilla sin unidad propia es recuadro (en el mapa o con
    // una unidad elegida); con el dedo, solo en "Elegir varias".
    canBox: (touch) => (touch ? h.selection.multi && h.phase === 'map' : h.phase === 'map' || h.phase === 'move'),
    pickAt: (x, y) => {
      // ¿Se coge una unidad propia? (en el mapa, o la que esta elegida al mover)
      const tile = h.view.tileAtScreen(x, y);
      const u = tile ? unitAt(h.state, tile.x, tile.y) : undefined;
      const pickable =
        !!u &&
        u.team === 0 &&
        u.active &&
        u.canMove &&
        u.carrier === null &&
        (h.phase === 'map' || (h.phase === 'move' && h.sel?.uid === u.uid));
      return pickable ? u.uid : null;
    },
    touchStart: () => touchHint(),
    rightClick: (x, y, mods) => {
      if (h.carry.active) return h.carry.cancel();
      const tile = h.view.tileAtScreen(x, y);
      // Sobre la propia unidad elegida sigue siendo atras.
      const onSel = !!tile && !!h.sel && h.phase !== 'map' && samePos(tile, h.sel);
      if (tile && !onSel && (h.phase === 'map' || h.phase === 'move') && h.selection.units().length) {
        // [CAMBIO] Alt + clic derecho: el menu completo. Si no, lo que toca en esa casilla (ver
        // controls/actions.ts); con Mayusculas, se deja como orden sin gastar el turno.
        if (mods.alt) return void h.openOrderMenu(tile);
        const ctx = h.actionCtx(tile);
        const a = ctx && smartAction(ctx);
        if (a) return void h.runAction(a.id, tile, { queue: mods.shift });
        if (h.openOrderMenu(tile)) return;
        return showToast(t('smartNone'));
      }
      if (tile && !onSel && h.openOrderMenu(tile)) return;
      // Clic derecho sobre una unidad en el mapa: ver su alcance (si no, atras).
      const u = tile && h.phase === 'map' ? unitAt(h.state, tile.x, tile.y) : undefined;
      if (u && u.carrier === null && (u.team === 0 || h.visible(u)) && u.uid !== h.inspectUid) return h.inspect(u);
      return h.back();
    },
    beginCarry: (uid, touch, held) => h.carry.begin(uid, touch, held),
    carryTo: (x, y) => h.carry.moveTo(x, y),
    dropCarry: (x, y, shift) => h.carry.drop(h.view.tileAtScreen(x, y), shift),
    cancelCarry: () => h.carry.cancel(),
    boxUpdate: (box) => h.view.setBox(box),
    boxEnd: (box) => {
      // [CAMBIO] Recuadro: las unidades propias de dentro (con Mayusculas o Ctrl, se añaden). Un clic
      // con Mayusculas o Ctrl (recuadro sin tamaño) añade o quita la de debajo.
      const picks = h.selection;
      h.view.setBox(null);
      if (h.phase !== 'map' && h.phase !== 'move') return h.refresh();
      if (Math.abs(box.x1 - box.x0) < 6 && Math.abs(box.y1 - box.y0) < 6) {
        const tile = h.view.tileAtScreen(box.x1, box.y1);
        const u = tile ? unitAt(h.state, tile.x, tile.y) : undefined;
        if (tile) h.moveCursorTo(tile, false);
        return picks.apply(
          clickSelect(picks.selection(), u && picks.selectable(u) ? u : null, { shift: true, ctrl: false, count: 1 }, () => []),
        );
      }
      const r = h.view.tilesInBox(box);
      const inside = h.state.units.filter((u) => picks.selectable(u) && u.x >= r.x0 && u.x <= r.x1 && u.y >= r.y0 && u.y <= r.y1);
      picks.apply(boxSelect(picks.selection(), inside, !!box.add));
    },
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
    longPress: (x, y) => {
      const tile = h.view.tileAtScreen(x, y);
      // [CAMBIO] Con una unidad o un grupo elegido, mantener pulsada la casilla de destino: ordenes alli.
      if (tile && h.openOrderMenu(tile)) {
        navigator.vibrate?.(12);
        return true;
      }
      // Pulsacion larga: llevar el cursor ahi (ficha de informacion) y ver el alcance si hay una unidad.
      if (h.phase !== 'map') return false;
      if (!tile) return true;
      navigator.vibrate?.(12);
      h.view.cursor = { ...tile };
      const u = unitAt(h.state, tile.x, tile.y);
      if (u && u.carrier === null && (u.team === 0 || h.visible(u))) h.inspect(u);
      else h.cursorMoved();
      return true;
    },
  };
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
  const now = h.scene.time.now;
  if (now < h.inputLockUntil) return;
  const { touch, shift } = info;
  const picks = h.selection;
  // (La barra superior y los menus son HTML: sus clics no llegan aqui.)
  const tile = h.view.tileAtScreen(x, y);
  // Doble clic en el destino: mover y esperar.
  if (h.phase === 'unitMenu' && h.sel && tile && samePos(tile, h.sel) && h.lastCommit && now - h.lastCommit.time < 450) {
    return h.waitSelected();
  }
  // Con el menu de grupo abierto, un clic en el mapa mueve el grupo ahi.
  if (h.phase === 'groupMenu' && tile && picks.group.size) {
    h.toMap();
    h.moveCursorTo(tile, false);
    return void h.groupMove(tile);
  }
  // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
  if (MENU_PHASES.includes(h.phase)) return h.back();
  if (!tile) return;
  // [CAMBIO] "Elegir varias" (para el dedo, sin recuadro): tocar una unidad propia la añade o la quita.
  if (h.phase === 'map' && picks.multi) {
    const own = unitAt(h.state, tile.x, tile.y);
    if (own && picks.selectable(own)) {
      h.moveCursorTo(tile, false);
      return picks.apply(clickSelect(picks.selection(), own, { shift: true, ctrl: false, count: 1 }, () => []));
    }
  }
  // [CAMBIO] Raton: seleccion como en los juegos de estrategia en tiempo real (ver controls/selection.ts).
  if (!touch && selectClick(h, tile, info)) return;
  // Dedo, en el mapa o con una unidad elegida: un toque hace directamente lo logico (ver ui/touch.ts).
  if (touch && (h.phase === 'map' || h.phase === 'move')) return touchTap(h, tile);
  if (h.phase === 'move') {
    // Al mover, un clic es como soltar: en un enemigo, ataca; en un edificio, se mueve (y sale el menu).
    h.moveCursorTo(tile, false);
    return void h.commit(tile, { wait: shift });
  }
  // Tactil, en el resto (elegir objetivo, descargar...): primer toque señala, segundo confirma.
  if (touch && !samePos(tile, h.view.cursor)) return h.moveCursorTo(tile, false);
  h.moveCursorTo(tile, false);
  h.accept();
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
  const mods = { shift: info.shift, ctrl: info.ctrl, count: info.count };
  const grouping = info.shift || info.ctrl || (info.count >= 2 && !!hit) || picks.group.size > 0;
  if (h.phase === 'move') {
    if (!h.sel || !hit) return false;
    // Sobre la propia elegida, un clic normal sigue siendo "quedarse aqui" (menu de acciones).
    if (hit.uid === h.sel.uid && !(info.shift || info.ctrl || info.count >= 2)) return false;
    if (!grouping && h.intentAt(tile).kind !== 'none') return false;
  } else if (!grouping) return false;
  h.moveCursorTo(tile, false);
  picks.apply(clickSelect(picks.selection(), hit, mods, (u) => picks.sameTypeOnScreen(u)));
  return true;
}

/** Un toque con el dedo en el mapa (fases map y move). */
function touchTap(h: PointerHost, tile: Pos): void {
  const u = unitAt(h.state, tile.x, tile.y);
  const own = u && u.team === 0 && u.active && u.carrier === null ? u : null;
  if (h.phase === 'move') {
    const it = h.intentAt(tile);
    const act = moveTap({
      intent: it.kind,
      atCursor: samePos(tile, h.view.cursor),
      otherOwnActive: !!own && own.uid !== h.sel?.uid,
    });
    switch (act) {
      case 'commit':
        h.moveCursorTo(tile, false);
        // [CAMBIO] Tocar otra vez la propia unidad abre su menu (esperar, ordenes...): con el dedo no
        // habia otra forma de llegar a el.
        if (it.kind === 'stay') return void h.commit(tile);
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
  const b = buildingAt(h.state, tile.x, tile.y);
  const act = mapTap({
    ownActive: !!own,
    buyHere: !u && !!b && b.owner === 0 && canBuyAt(h.state, b),
    visibleUnit: !!u && u.carrier === null && (u.team === 0 || h.visible(u)),
    inspectingThis: !!u && u.uid === h.inspectUid,
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
