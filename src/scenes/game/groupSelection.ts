/**
 * [CAMBIO] Seleccion en la partida (ver controls/selection.ts, que decide la seleccion nueva): una
 * unidad elegida para moverla o un grupo (recuadro, «Elegir varias», escuadra o tecla de grupo), el
 * panel de lo elegido y las teclas de grupo con numero.
 */
import type Phaser from 'phaser';
import { unitById } from '../../core/rules';
import { addToGroup, setGroup, squadByKey, squadUnits } from '../../core/squads';
import type { GameState, Unit } from '../../core/types';
import type { GroupMode } from '../../controls/commands';
import { DOUBLE_MS } from '../../controls/pointer';
import { EMPTY, sameSelection, type Selection } from '../../controls/selection';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import type { MapView } from '../../ui/mapView';
import type { Phase } from './types';

/** Lo que la seleccion necesita de la escena. */
export interface SelectionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  readonly phase: Phase;
  /** La unidad elegida para moverla (o en su menu). */
  readonly sel: Unit | null;
  toMap(): void;
  selectUnit(u: Unit): void;
  /** Deja de enseñar el alcance de una unidad señalada. */
  stopInspect(): void;
  refresh(): void;
  cursorMoved(): void;
}

export class GroupSelection {
  /** Seleccion en grupo (recuadro, Mayusculas + clic...). */
  group = new Set<number>();
  /** [CAMBIO] Modo "Elegir varias" de la bandeja: cada toque en una unidad propia la añade al grupo. */
  multi = false;
  /** Ultima escuadra elegida (bandeja o tecla), para que elegirla dos veces seguidas lleve la camara. */
  private lastPick: { id: number; at: number } | null = null;
  /** La señalada con Tab en el panel de lo elegido. */
  private pickedFocus: number | null = null;

  constructor(private readonly h: SelectionHost) {}

  /** Partida nueva. */
  reset(): void {
    this.group = new Set();
  }

  /** Se puede elegir para un grupo: propia, viva y en el mapa (aunque ya se haya movido: para ordenes). */
  selectable(u: Unit): boolean {
    return u.team === 0 && u.carrier === null && u.life > 0;
  }

  /** Lo elegido ahora: el grupo o, si no hay, la unidad que se esta moviendo. */
  selection(): Selection {
    if (this.group.size) return this.group;
    const { sel, phase } = this.h;
    return sel && (phase === 'move' || phase === 'unitMenu') ? new Set([sel.uid]) : EMPTY;
  }

  units(): Unit[] {
    return [...this.selection()].map((uid) => unitById(this.h.state, uid)).filter((u): u is Unit => !!u && this.selectable(u));
  }

  /** Unidades del grupo elegido que siguen existiendo. */
  groupUnits(): Unit[] {
    return [...this.group].map((uid) => unitById(this.h.state, uid)).filter((u): u is Unit => !!u);
  }

  /**
   * Cambiar lo elegido. Una sola unidad que puede actuar queda elegida para moverla (como un clic
   * normal); varias, o una ya usada, forman el grupo (aro a los pies; clic derecho las manda).
   */
  apply(next: Selection): void {
    const h = this.h;
    const units = [...next].map((uid) => unitById(h.state, uid)).filter((u): u is Unit => !!u && this.selectable(u));
    if (h.phase === 'move' || h.phase === 'groupMenu') h.toMap();
    if (h.phase !== 'map') return h.refresh();
    h.stopInspect();
    const one = units.length === 1 ? units[0]! : null;
    if (one && one.active) {
      this.group.clear();
      this.multi = false;
      return h.selectUnit(one);
    }
    this.group = new Set(units.map((u) => u.uid));
    h.refresh();
  }

  /** Las elegibles del mismo tipo que se ven en pantalla (doble clic o Ctrl + clic). */
  sameTypeOnScreen(u: Unit): Unit[] {
    const sc = this.h.scene;
    const r = this.h.view.tilesInBox({ x0: 0, y0: 0, x1: sc.scale.width, y1: sc.scale.height });
    return this.h.state.units.filter(
      (o) => o.type === u.type && this.selectable(o) && o.x >= r.x0 && o.x <= r.x1 && o.y >= r.y0 && o.y <= r.y1,
    );
  }

  /** [CAMBIO] Elegir una escuadra (su boton o su tecla). Otra vez enseguida: la camara va alli. */
  pickSquad(id: number): void {
    const h = this.h;
    if (h.phase !== 'map' && h.phase !== 'move' && h.phase !== 'groupMenu') return;
    const units = squadUnits(h.state, id).filter((u) => this.selectable(u));
    if (!units.length) return;
    const now = h.scene.time.now;
    const again = this.lastPick?.id === id && now - this.lastPick.at <= DOUBLE_MS * 2;
    this.lastPick = { id, at: now };
    const ids = new Set(units.map((u) => u.uid));
    if (again && sameSelection(this.selection(), ids)) {
      // Al centro de la escuadra (la unidad mas cerca del medio).
      const cx = units.reduce((a, u) => a + u.x, 0) / units.length,
        cy = units.reduce((a, u) => a + u.y, 0) / units.length;
      const mid = units.reduce((a, u) => (Math.hypot(u.x - cx, u.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? u : a));
      h.view.cursor = { x: mid.x, y: mid.y };
      h.view.centerOn(mid);
      return h.cursorMoved();
    }
    h.view.cursor = { x: units[0]!.x, y: units[0]!.y };
    h.view.ensureVisible(units[0]!, 3);
    this.apply(ids);
  }

  /** [CAMBIO] Tecla de grupo n: elegir (n), hacer el grupo con lo elegido (Ctrl+n) o añadirlo (Mayusculas+n). */
  groupKey(n: number, mode: GroupMode): void {
    const h = this.h;
    if (h.phase !== 'map' && h.phase !== 'move' && h.phase !== 'groupMenu') return;
    if (mode === 'select') {
      const q = squadByKey(h.state, n);
      if (q) this.pickSquad(q.id);
      return;
    }
    const units = this.units();
    if (!units.length) return showToast(t('groupNone'));
    const q = mode === 'set' ? setGroup(h.state, units, n) : addToGroup(h.state, units, n);
    if (q) showToast(`${t(mode === 'set' ? 'groupSet' : 'groupAdded')} ${n} · ${q.name}`);
    h.refresh();
  }

  /** [CAMBIO] Las elegidas en el orden del panel: por tipo y, dentro, como estan en la partida. */
  pickedInOrder(): Unit[] {
    return this.groupUnits()
      .filter((u) => this.selectable(u))
      .sort((a, b) => a.type - b.type || a.uid - b.uid);
  }

  /** [CAMBIO] Tab con varias elegidas: llevar el cursor a la siguiente (su ficha se ve abajo). */
  nextPicked(): void {
    const list = this.pickedInOrder();
    if (!list.length) return;
    const i = list.findIndex((u) => u.uid === this.pickedFocus);
    const u = list[(i + 1) % list.length]!;
    this.pickedFocus = u.uid;
    this.h.view.cursor = { x: u.x, y: u.y };
    this.h.view.ensureVisible(u, 3);
    this.h.cursorMoved();
  }

  /** [CAMBIO] Retrato del panel: solo esa unidad, quitarla (Mayusculas) o solo las de su tipo (Ctrl). */
  pickInSelection(uid: number, shift: boolean, ctrl: boolean): void {
    const h = this.h;
    if (h.phase !== 'map' && h.phase !== 'groupMenu') return;
    const u = unitById(h.state, uid);
    if (!u || !this.group.has(uid)) return;
    if (shift) {
      const next = new Set(this.group);
      next.delete(uid);
      return this.apply(next);
    }
    if (ctrl)
      return this.apply(
        new Set(
          this.groupUnits()
            .filter((o) => o.type === u.type)
            .map((o) => o.uid),
        ),
      );
    h.view.cursor = { x: u.x, y: u.y };
    h.view.ensureVisible(u, 3);
    this.apply(new Set([uid]));
  }
}
