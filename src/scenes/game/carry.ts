/**
 * Arrastrar y soltar una unidad (raton o dedo): se levanta, salta de casilla en casilla siguiendo al
 * puntero con el camino trazado y, al soltarla, se mueve, ataca, se une... o vuelve a su sitio.
 */
import type Phaser from 'phaser';
import { Movement } from '../../core/data';
import { samePos } from '../../core/geom';
import { canWalk, unitAt, unitById } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/types';
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
  readonly phase: Phase;
  readonly sel: Unit | null;
  /** Unidades que no se dibujan (la cogida va en su propia imagen). */
  readonly hidden: Set<number>;
  toMap(): void;
  selectUnit(u: Unit): void;
  updateTrail(t: Pos): void;
  intentAt(t: Pos): Intent;
  refresh(): void;
  /** Orden de varios turnos hasta `goal`. */
  giveOrder(u: Unit, goal: Pos): Promise<void>;
  /** Confirmar el movimiento en una casilla (ver GameScene.commit). */
  commit(t: Pos, opts: { drop?: boolean; wait?: boolean }): Promise<void>;
}

interface Carried {
  uid: number;
  ghost: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Rectangle;
  touch: boolean;
  /** Cogida a proposito (raton, o dedo mantenido): soltar lejos da una orden de varios turnos. */
  held: boolean;
}

export class Carry {
  /** Unidad cogida para arrastrar y soltar. */
  private carry: Carried | null = null;

  constructor(private readonly h: CarryHost) {}

  /** Partida nueva. */
  reset(): void {
    this.carry = null;
  }

  get active(): boolean {
    return this.carry !== null;
  }

  /** La unidad cogida va con el dedo (no con el raton). */
  get touch(): boolean {
    return !!this.carry?.touch;
  }

  /**
   * Levantar la unidad de la pulsacion actual (arrastrar y soltar). `held`: con el dedo, se ha
   * mantenido pulsado antes de arrastrar (si no, el arrastre puede ser un desplazamiento del mapa
   * que empezo sobre la unidad, y soltar lejos no le da una orden de varios turnos).
   */
  begin(uid: number, touch: boolean, held: boolean): boolean {
    const h = this.h;
    const u = unitById(h.state, uid);
    if (!u || !u.active || !u.canMove) return false;
    if (h.phase !== 'move' || h.sel?.uid !== u.uid) {
      if (h.phase !== 'map') h.toMap();
      h.view.cursor = { x: u.x, y: u.y };
      h.selectUnit(u);
    }
    if (touch) navigator.vibrate?.(10);
    const key = unitKey(h.scene.textures, h.state, u);
    if (!key) return true;
    // Sombra en el suelo y la unidad "levantada" 3 pixeles.
    const shadow = h.scene.add.rectangle(u.x * TILE + TILE / 2, (u.y + 1) * TILE - 3, 22, 5, 0x000000, 0.35);
    h.view.addFx(shadow);
    const ghost = h.view.ghost(key, u);
    ghost.y -= 3;
    this.carry = { uid: u.uid, ghost, shadow, touch, held: held || !touch };
    h.hidden.add(u.uid);
    h.refresh();
    return true;
  }

  /** El puntero se mueve con la unidad cogida: la unidad salta de casilla en casilla y el camino la sigue. */
  moveTo(x: number, y: number): void {
    const h = this.h;
    const c = this.carry;
    if (!c) return;
    const tile = h.view.tileAtScreen(x, y);
    if (!tile || samePos(tile, h.view.cursor)) return;
    h.view.cursor = { ...tile };
    h.updateTrail(tile);
    const it = h.intentAt(tile);
    // Sobre un enemigo, la unidad se coloca en la casilla desde la que atacaria (y el cursor marca al enemigo).
    const at = it.kind === 'attack' ? it.from : tile;
    c.ghost.setPosition(at.x * TILE + TILE / 2, (at.y + 1) * TILE - 3);
    c.shadow.setPosition(at.x * TILE + TILE / 2, (at.y + 1) * TILE - 3);
    if (it.kind === 'none') c.ghost.setTint(0xff9090).setAlpha(0.7);
    else c.ghost.clearTint().setAlpha(1);
    h.refresh();
  }

  /** Soltar la unidad cogida. Fuera del alcance (o en su sitio) vuelve sin hacer nada. */
  drop(tile: Pos | null, shift: boolean): void {
    const h = this.h;
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    h.hidden.delete(c.uid);
    const it = tile ? h.intentAt(tile) : { kind: 'none' as const };
    // Soltar lejos, fuera del alcance, en una casilla a la que se puede llegar algun dia: orden de varios turnos.
    if (
      it.kind === 'none' &&
      c.held &&
      tile &&
      h.sel &&
      !unitAt(h.state, tile.x, tile.y) &&
      canWalk(h.state, tile.x, tile.y, Movement.of(h.sel.type))
    ) {
      c.ghost.destroy();
      c.shadow.destroy();
      return void h.giveOrder(h.sel, tile);
    }
    if (it.kind === 'none' || it.kind === 'stay') {
      void this.snapBack(c);
      return h.toMap();
    }
    c.ghost.destroy();
    c.shadow.destroy();
    h.view.cursor = { ...tile! };
    void h.commit(tile!, { drop: true, wait: shift });
  }

  cancel(): void {
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    this.h.hidden.delete(c.uid);
    void this.snapBack(c);
    this.h.toMap();
  }

  /** Animacion de "vuelve a su sitio" de la unidad cogida. */
  private async snapBack(c: Carried): Promise<void> {
    const u = unitById(this.h.state, c.uid);
    c.shadow.destroy();
    if (!u || reducedMotion()) return void c.ghost.destroy();
    c.ghost.clearTint();
    await new Promise<void>((resolve) =>
      this.h.scene.tweens.add({
        targets: c.ghost,
        x: u.x * TILE + TILE / 2,
        y: (u.y + 1) * TILE,
        duration: 140,
        ease: 'Stepped',
        easeParams: [4],
        onComplete: () => resolve(),
      }),
    );
    c.ghost.destroy();
  }
}
