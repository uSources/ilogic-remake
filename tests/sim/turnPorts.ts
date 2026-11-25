/**
 * Los puertos del turno 3D, falsos: apuntan lo que se les pide (las marcas, los sucesos, la flecha, los
 * sonidos y las piezas del tablero), para probar el turno sin navegador (tests/turnControls.test.ts, tests/onlinePlay.test.ts).
 */
import type { GameEvent, GameState, Pos } from '@core/model';
import { isOnMap } from '@core/rules';
import type { SoundName, SoundPort } from '../../src/audio/sounds';
import type { EventPlayer, MoveLook, MovePreview, ShotLook, TileMarks } from '../../src/view3d/ports/turn';

/** Lo ultimo que se ha pedido enseñar en el tablero. */
export class FakeMarks implements TileMarks {
  reach: readonly Pos[] = [];
  attackReach: readonly Pos[] = [];
  targets: readonly Pos[] = [];
  selected: Pos | null = null;
  group: readonly Pos[] = [];
  showReach(tiles: readonly Pos[]): void {
    this.reach = tiles;
  }
  showAttackReach(tiles: readonly Pos[]): void {
    this.attackReach = tiles;
  }
  showTargets(tiles: readonly Pos[]): void {
    this.targets = tiles;
  }
  select(pos: Pos | null): void {
    this.selected = pos;
  }
  showGroup(tiles: readonly Pos[]): void {
    this.group = tiles;
  }
}

/** Las piezas del tablero: las unidades que habia en el mapa en el ultimo `sync` (lo que hace `refresh`). */
export class FakeBoard {
  pieces: ReadonlySet<number> = new Set();
  constructor(private readonly s: GameState) {}
  sync(): void {
    this.pieces = new Set(this.s.units.filter(isOnMap).map((unit) => unit.uid));
  }
}

/**
 * Apunta cada tanda de sucesos (y, con `board`, las piezas que habia al empezar a animarla); si
 * `hold`, no acaba hasta `release()` (para ver el turno ocupado).
 */
export class FakeEvents implements EventPlayer {
  readonly played: (readonly GameEvent[])[] = [];
  readonly piecesWhenPlayed: ReadonlySet<number>[] = [];
  hold = false;
  private pending: (() => void) | null = null;
  constructor(private readonly board: FakeBoard | null = null) {}
  play(events: readonly GameEvent[]): Promise<void> {
    this.played.push(events);
    if (this.board) this.piecesWhenPlayed.push(this.board.pieces);
    if (!this.hold) return Promise.resolve();
    return new Promise((resolve) => (this.pending = resolve));
  }
  release(): void {
    this.pending?.();
    this.pending = null;
  }
}

/** Lo ultimo que se ha pedido enseñar de a donde llegaria la unidad (null: nada). */
export class FakePreview implements MovePreview {
  look: MoveLook | null = null;
  shot: ShotLook | null = null;
  show(look: MoveLook | null): void {
    this.look = look;
  }
  aim(shot: ShotLook | null): void {
    this.shot = shot;
  }
}

export class FakeSounds implements SoundPort {
  readonly heard: SoundName[] = [];
  play(sound: SoundName): void {
    this.heard.push(sound);
  }
}
