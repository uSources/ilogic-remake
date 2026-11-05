/**
 * La unidad elegida y lo que se calcula al elegirla: alcance, adonde se puede unir o subir, camino
 * trazado, peligro, de donde venia (para deshacer) y los objetivos de su menu (atacar, descargar).
 * Vive desde que se elige la unidad hasta que se vuelve al mapa. Sin Phaser.
 */
import { posKey, posOf } from '../../core/geom';
import { extendTrail } from '../../core/trail';
import { attackZone, loadTargets, mergeTargets, moveRange, passMap, threatMap, type MoveRange } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { intentAt, trailTo, type MovePlan } from './intent';
import { type Intent, type MoveUndo } from './types';

/** Mapa de casillas → uid de la unidad que hay en ella. */
const byTile = (units: readonly Unit[]) => new Map(units.map((unit) => [posKey(unit), unit.uid]));

export class MoveSession {
  /** Alcance de la unidad (null: ya se ha movido, o no se puede mover). */
  range: MoveRange | null = null;
  /** Casillas con una unidad a la que unirse o subir ("x,y" → uid). */
  merge = new Map<string, number>();
  load = new Map<string, number>();
  /** Camino que se esta trazando, de la unidad al cursor (incluye la casilla de salida). */
  trail: Pos[] = [];
  /** Casillas que le cierran el paso (enemigos que se ven). */
  private block: Grid<boolean> | null = null;
  /** Casillas que el enemigo visible puede atacar el turno siguiente. */
  danger: Grid<boolean> | null = null;
  /** Adonde podria atacar desde lo que alcanza. */
  attackZone: Grid<boolean> | null = null;
  /** Donde estaba antes de moverla este turno (para "Atras" en su menu). */
  undo: MoveUndo | null = null;
  /** Enemigos a los que puede atacar ahora (fase 'attack', "x,y" → uid). */
  attackTargets = new Map<string, number>();
  /** Pasajero que se va a descargar y casillas donde se puede dejar (fase 'unloadTile'). */
  passenger: Unit | null = null;
  unloadTiles = new Set<string>();

  private constructor(readonly unit: Unit) {}

  /** Una unidad que ya se ha movido: solo su menu de acciones. */
  static alreadyMoved(unit: Unit): MoveSession {
    return new MoveSession(unit);
  }

  /** Una unidad que se va a mover: todo lo que hace falta para trazar el camino y soltarla. */
  static toMove(s: GameState, unit: Unit): MoveSession {
    const session = new MoveSession(unit);
    const range = moveRange(s, unit);
    session.range = range;
    session.merge = byTile(mergeTargets(s, unit, range));
    session.load = byTile(loadTargets(s, unit, range));
    session.trail = [posOf(unit)];
    session.block = passMap(s, unit).block;
    session.danger = threatMap(s, unit.team);
    session.attackZone = attackZone(s, unit, range);
    return session;
  }

  /** La unidad y su alcance para intent.ts (null si ya no se esta moviendo). */
  plan(): MovePlan | null {
    const range = this.range;
    return range ? { unit: this.unit, range, merge: this.merge, load: this.load, trail: this.trail } : null;
  }

  /** Que pasaria al soltar (o pulsar) la unidad en una casilla. */
  intentAt(s: GameState, tile: Pos, visible: (pos: Pos) => boolean): Intent {
    return intentAt(s, this.plan(), tile, visible);
  }

  /** Camino hasta `dest`: el trazado si acaba ahi, si no el mas corto. Solo mientras se mueve. */
  trailTo(dest: Pos): Pos[] {
    return trailTo(this.plan()!, dest);
  }

  /** Alarga, recorta o rehace el camino trazado al pasar el cursor por una casilla. */
  followCursor(s: GameState, tile: Pos): void {
    if (!this.range || !this.block) return;
    this.trail = extendTrail(s, this.unit, this.range, this.block, this.trail, tile);
  }

  /** Quita la ultima casilla del camino trazado; devuelve la nueva ultima (null si no habia camino). */
  stepBack(): Pos | null {
    if (this.trail.length <= 1) return null;
    this.trail = this.trail.slice(0, -1);
    return this.trail[this.trail.length - 1]!;
  }
}
