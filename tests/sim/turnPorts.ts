/**
 * Los puertos del turno 3D, falsos: apuntan lo que se les pide (las marcas, los sucesos, la flecha y
 * los sonidos), para probar el turno sin navegador (tests/turnControls.test.ts, tests/onlinePlay.test.ts).
 */
import type { GameEvent, Pos } from '@core/model';
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

/** Apunta cada tanda de sucesos; si `hold`, no acaba hasta `release()` (para ver el turno ocupado). */
export class FakeEvents implements EventPlayer {
  readonly played: (readonly GameEvent[])[] = [];
  hold = false;
  private pending: (() => void) | null = null;
  play(events: readonly GameEvent[]): Promise<void> {
    this.played.push(events);
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
