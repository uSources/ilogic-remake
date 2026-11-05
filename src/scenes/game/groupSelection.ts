/**
 * [CAMBIO] Seleccion en la partida (ver controls/selection.ts, que decide la seleccion nueva): una
 * unidad elegida para moverla o un grupo (recuadro, «Elegir varias», escuadra o tecla de grupo), el
 * panel de lo elegido y las teclas de grupo con numero.
 */
import type Phaser from 'phaser';
import { unitById } from '../../core/rules';
import { addToGroup, setGroup, squadByKey, squadUnits } from '../../core/squads';
import { minBy } from '../../core/util/pick';
import type { GameState, Pos, Unit } from '../../core/model';
import type { GroupMode } from '../../controls/inputCommands';
import { DOUBLE_MS } from '../../controls/pointer';
import { EMPTY, sameSelection, type Selection } from '../../controls/selection';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import type { MapView } from '../../ui/mapView';
import type { Phase } from './types';
import { posOf } from '../../core/geom';

/** Lo que la seleccion necesita de la escena. */
export interface SelectionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  readonly phase: Phase;
  /** La unidad elegida para moverla (o en su menu). */
  readonly selected: Unit | null;
  toMap(): void;
  selectUnit(unit: Unit): void;
  /** Deja de enseñar el alcance de una unidad señalada. */
  stopInspect(): void;
  refresh(): void;
  cursorMoved(): void;
}

/** Elegir la misma escuadra otra vez antes de esto (ms) lleva la camara alli. */
const SQUAD_AGAIN_MS = DOUBLE_MS * 2;
/** Casillas de margen al llevar la camara a una unidad. */
const FOLLOW_MARGIN = 3;

/** La unidad mas cerca del centro del grupo. */
function middleUnit(units: readonly Unit[]): Unit {
  const centerX = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
  const centerY = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
  return minBy(units, (unit) => Math.hypot(unit.x - centerX, unit.y - centerY))!;
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

  constructor(private readonly host: SelectionHost) {}

  /** Partida nueva. */
  reset(): void {
    this.group = new Set();
  }

  /** Se puede elegir para un grupo: propia, viva y en el mapa (aunque ya se haya movido: para ordenes). */
  selectable(unit: Unit): boolean {
    return unit.team === 0 && unit.carrier === null && unit.life > 0;
  }

  /** Lo elegido ahora: el grupo o, si no hay, la unidad que se esta moviendo. */
  selection(): Selection {
    if (this.group.size) return this.group;
    const { selected, phase } = this.host;
    return selected && (phase === 'move' || phase === 'unitMenu') ? new Set([selected.uid]) : EMPTY;
  }

  units(): Unit[] {
    return this.existing(this.selection()).filter((unit) => this.selectable(unit));
  }

  /** Unidades del grupo elegido que siguen existiendo. */
  groupUnits(): Unit[] {
    return this.existing(this.group);
  }

  private existing(uids: Iterable<number>): Unit[] {
    return [...uids].map((uid) => unitById(this.host.state, uid)).filter((unit): unit is Unit => !!unit);
  }

  /**
   * Cambiar lo elegido. Una sola unidad que puede actuar queda elegida para moverla (como un clic
   * normal); varias, o una ya usada, forman el grupo (aro a los pies; clic derecho las manda).
   */
  apply(next: Selection): void {
    const host = this.host;
    const units = this.existing(next).filter((unit) => this.selectable(unit));
    if (host.phase === 'move' || host.phase === 'groupMenu') host.toMap();
    if (host.phase !== 'map') return host.refresh();
    host.stopInspect();
    const onlyOne = units.length === 1 ? units[0]! : null;
    if (onlyOne?.active) {
      this.group.clear();
      this.multi = false;
      return host.selectUnit(onlyOne);
    }
    this.group = new Set(units.map((unit) => unit.uid));
    host.refresh();
  }

  /** Las elegibles del mismo tipo que se ven en pantalla (doble clic o Ctrl + clic). */
  sameTypeOnScreen(like: Unit): Unit[] {
    const screen = this.host.scene.scale;
    const area = this.host.view.tilesInBox({ x0: 0, y0: 0, x1: screen.width, y1: screen.height });
    const isOnScreen = (unit: Unit) => unit.x >= area.x0 && unit.x <= area.x1 && unit.y >= area.y0 && unit.y <= area.y1;
    return this.host.state.units.filter((unit) => unit.type === like.type && this.selectable(unit) && isOnScreen(unit));
  }

  /** En estas fases se puede elegir una escuadra o usar las teclas de grupo. */
  private canPickGroups(): boolean {
    const phase = this.host.phase;
    return phase === 'map' || phase === 'move' || phase === 'groupMenu';
  }

  /** [CAMBIO] Elegir una escuadra (su boton o su tecla). Otra vez enseguida: la camara va alli. */
  pickSquad(id: number): void {
    const host = this.host;
    if (!this.canPickGroups()) return;
    const units = squadUnits(host.state, id).filter((unit) => this.selectable(unit));
    if (!units.length) return;
    const now = host.scene.time.now;
    const isAgain = this.lastPick?.id === id && now - this.lastPick.at <= SQUAD_AGAIN_MS;
    this.lastPick = { id, at: now };
    const uids = new Set(units.map((unit) => unit.uid));
    if (isAgain && sameSelection(this.selection(), uids)) return this.cameraTo(middleUnit(units));
    this.moveCursorTo(units[0]!);
    this.apply(uids);
  }

  private cameraTo(unit: Unit): void {
    this.host.view.cursor = posOf(unit);
    this.host.view.centerOn(unit);
    this.host.cursorMoved();
  }

  private moveCursorTo(pos: Pos): void {
    this.host.view.cursor = posOf(pos);
    this.host.view.ensureVisible(pos, FOLLOW_MARGIN);
  }

  /** [CAMBIO] Tecla de grupo n: elegir (n), hacer el grupo con lo elegido (Ctrl+n) o añadirlo (Mayusculas+n). */
  groupKey(group: number, mode: GroupMode): void {
    const host = this.host;
    if (!this.canPickGroups()) return;
    if (mode === 'select') {
      const squad = squadByKey(host.state, group);
      if (squad) this.pickSquad(squad.id);
      return;
    }
    const units = this.units();
    if (!units.length) return showToast(t('groupNone'));
    const squad = mode === 'set' ? setGroup(host.state, units, group) : addToGroup(host.state, units, group);
    if (squad) showToast(`${t(mode === 'set' ? 'groupSet' : 'groupAdded')} ${group} · ${squad.name}`);
    host.refresh();
  }

  /** [CAMBIO] Las elegidas en el orden del panel: por tipo y, dentro, como estan en la partida. */
  pickedInOrder(): Unit[] {
    return this.groupUnits()
      .filter((unit) => this.selectable(unit))
      .sort((firstUnit, secondUnit) => firstUnit.type - secondUnit.type || firstUnit.uid - secondUnit.uid);
  }

  /** [CAMBIO] Tab con varias elegidas: llevar el cursor a la siguiente (su ficha se ve abajo). */
  nextPicked(): void {
    const list = this.pickedInOrder();
    if (!list.length) return;
    const focusIndex = list.findIndex((unit) => unit.uid === this.pickedFocus);
    const next = list[(focusIndex + 1) % list.length]!;
    this.pickedFocus = next.uid;
    this.moveCursorTo(next);
    this.host.cursorMoved();
  }

  /** [CAMBIO] Retrato del panel: solo esa unidad, quitarla (Mayusculas) o solo las de su tipo (Ctrl). */
  pickInSelection(uid: number, shift: boolean, ctrl: boolean): void {
    const host = this.host;
    if (host.phase !== 'map' && host.phase !== 'groupMenu') return;
    const unit = unitById(host.state, uid);
    if (!unit || !this.group.has(uid)) return;
    if (shift) return this.apply(new Set([...this.group].filter((other) => other !== uid)));
    if (ctrl)
      return this.apply(
        new Set(
          this.groupUnits()
            .filter((other) => other.type === unit.type)
            .map((other) => other.uid),
        ),
      );
    this.moveCursorTo(unit);
    this.apply(new Set([uid]));
  }
}
