/**
 * Arrastrar y soltar una unidad (raton o dedo): se levanta, salta de casilla en casilla siguiendo al
 * puntero con el camino trazado y, al soltarla, se mueve, ataca, se une... o vuelve a su sitio.
 */
import type Phaser from 'phaser';
import { movementOf, canWalk, unitAt, unitById, canStillMove } from '../../core/rules';
import { samePos, posOf } from '../../core/geom';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import { TILE } from '../../layout';
import { reducedMotion } from '../../ui/fx';
import type { MapView } from '../../ui/mapView';
import { unitKey } from '../../ui/sprites';
import type { Intent, Phase } from './types';

/** Lo que arrastrar necesita de la escena. */
export interface CarryHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
  readonly phase: Phase;
  readonly selected: Unit | null;
  /** Unidades que no se dibujan (la cogida va en su propia imagen). */
  readonly hidden: Set<number>;
  toMap(): void;
  selectUnit(unit: Unit): void;
  updateTrail(tile: Pos): void;
  intentAt(tile: Pos): Intent;
  refresh(): void;
  /** Viaje de varios turnos hasta `goal` (travelTo). */
  giveTravel(unit: Unit, goal: Pos): Promise<void>;
  /** Confirmar el movimiento en una casilla (ver UnitMoves.commit). */
  commit(tile: Pos, options: { drop?: boolean; wait?: boolean }): Promise<void>;
}

interface Carried {
  uid: number;
  ghost: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Rectangle;
  touch: boolean;
  /** Cogida a proposito (raton, o dedo mantenido): soltar lejos da una orden de varios turnos. */
  held: boolean;
}

/** La unidad cogida se ve "levantada" estos pixeles, con su sombra en el suelo. */
const LIFT_PX = 3;
const SHADOW = { width: 22, height: 5, color: 0x000000, alpha: 0.35 };
/** Rojiza y medio transparente donde no se puede soltar. */
const INVALID_TINT = 0xff9090;
const INVALID_ALPHA = 0.7;
/** Vibracion corta al cogerla con el dedo (ms). */
const PICK_VIBRATION_MS = 10;
/** Vuelta a su sitio: duracion (ms) y pasos (movimiento a saltos, como los graficos del original). */
const SNAP_BACK_MS = 140;
const SNAP_BACK_STEPS = 4;

/** Punto de apoyo (centro de los pies) de una casilla, en pixeles del mapa. */
const footOf = (tile: Pos) => ({ x: tile.x * TILE + TILE / 2, y: (tile.y + 1) * TILE - LIFT_PX });

export class Carry {
  /** Unidad cogida para arrastrar y soltar. */
  private carried: Carried | null = null;

  constructor(private readonly host: CarryHost) {}

  /** Partida nueva. */
  reset(): void {
    this.carried = null;
  }

  get active(): boolean {
    return this.carried !== null;
  }

  /** La unidad cogida va con el dedo (no con el raton). */
  get touch(): boolean {
    return !!this.carried?.touch;
  }

  /**
   * Levantar la unidad de la pulsacion actual (arrastrar y soltar). `held`: con el dedo, se ha
   * mantenido pulsado antes de arrastrar (si no, el arrastre puede ser un desplazamiento del mapa
   * que empezo sobre la unidad, y soltar lejos no le da una orden de varios turnos).
   */
  begin(uid: number, touch: boolean, held: boolean): boolean {
    const host = this.host;
    const unit = unitById(host.state, uid);
    if (!unit || !canStillMove(unit)) return false;
    if (host.phase !== 'move' || host.selected?.uid !== unit.uid) this.selectToMove(unit);
    if (touch) navigator.vibrate?.(PICK_VIBRATION_MS);
    const textureKey = unitKey(host.scene.textures, host.state, unit, host.viewer);
    if (!textureKey) return true;
    const foot = footOf(unit);
    const shadow = host.scene.add.rectangle(foot.x, foot.y, SHADOW.width, SHADOW.height, SHADOW.color, SHADOW.alpha);
    host.view.addFx(shadow);
    const ghost = host.view.ghost(textureKey, unit);
    ghost.y -= LIFT_PX;
    this.carried = { uid: unit.uid, ghost, shadow, touch, held: held || !touch };
    host.hidden.add(unit.uid);
    host.refresh();
    return true;
  }

  private selectToMove(unit: Unit): void {
    const host = this.host;
    if (host.phase !== 'map') host.toMap();
    host.view.cursor = posOf(unit);
    host.selectUnit(unit);
  }

  /** El puntero se mueve con la unidad cogida: la unidad salta de casilla en casilla y el camino la sigue. */
  moveTo(x: number, y: number): void {
    const host = this.host;
    const carried = this.carried;
    if (!carried) return;
    const tile = host.view.tileAtScreen(x, y);
    if (!tile || samePos(tile, host.view.cursor)) return;
    host.view.cursor = { ...tile };
    host.updateTrail(tile);
    const intent = host.intentAt(tile);
    // Sobre un enemigo, la unidad se coloca en la casilla desde la que atacaria (y el cursor marca al enemigo).
    const foot = footOf(intent.kind === 'attack' ? intent.from : tile);
    carried.ghost.setPosition(foot.x, foot.y);
    carried.shadow.setPosition(foot.x, foot.y);
    if (intent.kind === 'none') carried.ghost.setTint(INVALID_TINT).setAlpha(INVALID_ALPHA);
    else carried.ghost.clearTint().setAlpha(1);
    host.refresh();
  }

  /** Soltar la unidad cogida. Fuera del alcance (o en su sitio) vuelve sin hacer nada. */
  drop(tile: Pos | null, shift: boolean): void {
    const host = this.host;
    const carried = this.carried;
    if (!carried) return;
    this.carried = null;
    host.hidden.delete(carried.uid);
    const intent: Intent = tile ? host.intentAt(tile) : { kind: 'none' };
    if (tile && host.selected && intent.kind === 'none' && carried.held && this.canReachSomeday(host.selected, tile)) {
      destroyImages(carried);
      return void host.giveTravel(host.selected, tile);
    }
    if (!tile || intent.kind === 'none' || intent.kind === 'stay') {
      void this.snapBack(carried);
      return host.toMap();
    }
    destroyImages(carried);
    host.view.cursor = { ...tile };
    void host.commit(tile, { drop: true, wait: shift });
  }

  /** Soltar lejos, fuera del alcance, en una casilla a la que se puede llegar algun dia: orden de varios turnos. */
  private canReachSomeday(unit: Unit, tile: Pos): boolean {
    const s = this.host.state;
    return !unitAt(s, tile) && canWalk(s, tile, movementOf(s, unit));
  }

  cancel(): void {
    const carried = this.carried;
    if (!carried) return;
    this.carried = null;
    this.host.hidden.delete(carried.uid);
    void this.snapBack(carried);
    this.host.toMap();
  }

  /** Animacion de "vuelve a su sitio" de la unidad cogida. */
  private async snapBack(carried: Carried): Promise<void> {
    const unit = unitById(this.host.state, carried.uid);
    carried.shadow.destroy();
    if (!unit || reducedMotion()) return void carried.ghost.destroy();
    carried.ghost.clearTint();
    await new Promise<void>((resolve) =>
      this.host.scene.tweens.add({
        targets: carried.ghost,
        x: unit.x * TILE + TILE / 2,
        y: (unit.y + 1) * TILE,
        duration: SNAP_BACK_MS,
        ease: 'Stepped',
        easeParams: [SNAP_BACK_STEPS],
        onComplete: () => resolve(),
      }),
    );
    carried.ghost.destroy();
  }
}

function destroyImages(carried: Carried): void {
  carried.ghost.destroy();
  carried.shadow.destroy();
}
