import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { GameSession, humanController, passiveController } from '@core/session';
import type { GameEvent, Pos } from '@core/model';
import type { SoundId, SoundPort } from '../src/audio/sounds';
import { TurnControls } from '../src/view3d/systems/turn/turnControls';
import type { EventPlayer, TileMarks } from '../src/view3d/ports/turn';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** El turno 3D sin navegador: las marcas, los sucesos y los sonidos son puertos falsos que apuntan lo que se les pide. */

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');

/** Lo ultimo que se ha pedido enseñar en el tablero. */
class FakeMarks implements TileMarks {
  reach: readonly Pos[] = [];
  targets: readonly Pos[] = [];
  selected: Pos | null = null;
  showReach(tiles: readonly Pos[]): void {
    this.reach = tiles;
  }
  showTargets(tiles: readonly Pos[]): void {
    this.targets = tiles;
  }
  select(pos: Pos | null): void {
    this.selected = pos;
  }
}

/** Apunta cada tanda de sucesos; si `hold`, no acaba hasta `release()` (para ver el turno ocupado). */
class FakeEvents implements EventPlayer {
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

class FakeSounds implements SoundPort {
  readonly heard: SoundId[] = [];
  play(sound: SoundId): void {
    this.heard.push(sound);
  }
}

const kindsOf = (events: readonly GameEvent[]): string[] => events.map((event) => event.kind);

/** Una partida vacia con un soldado propio en (5,5), ya en el turno de la persona. */
async function myTurn() {
  const s = blankState();
  const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
  const marks = new FakeMarks();
  const events = new FakeEvents();
  const sounds = new FakeSounds();
  const session = new GameSession(s, [humanController(), passiveController()]);
  const controls = new TurnControls({ session, viewer: PLAYER, marks, events, sounds, refresh: () => {}, onOver: () => {} });
  await controls.runUntilInput();
  return { s, soldier, marks, events, sounds, controls };
}

describe('turno 3D con puertos', () => {
  it('tocar una unidad propia la elige: enseña a donde llega, la marca y suena', async () => {
    const { soldier, marks, sounds, controls } = await myTurn();
    await controls.tap(soldier);
    expect(marks.selected).toMatchObject({ x: 5, y: 5 });
    expect(marks.reach).toContainEqual({ x: 6, y: 5 });
    expect(sounds.heard).toContain('unit_select');
  });

  it('tocar una casilla azul la mueve: los sucesos van al reproductor y se abre su menu', async () => {
    const { soldier, marks, events, controls } = await myTurn();
    await controls.tap(soldier);
    await controls.tap({ x: 6, y: 5 });
    expect(events.played.map(kindsOf)).toContainEqual(expect.arrayContaining(['move']));
    expect(soldier).toMatchObject({ x: 6, y: 5 });
    expect(controls.menu()?.kind).toBe('unit');
    expect(marks.reach).toEqual([]);
  });

  it('mientras se ven los sucesos el turno esta ocupado y no atiende', async () => {
    const { soldier, events, controls } = await myTurn();
    await controls.tap(soldier);
    events.hold = true;
    const moving = controls.tap({ x: 6, y: 5 });
    expect(controls.busy).toBe(true);
    await controls.tap({ x: 5, y: 7 });
    expect(controls.cancel()).toBe(true);
    events.release();
    await moving;
    expect(controls.busy).toBe(false);
    expect(soldier).toMatchObject({ x: 6, y: 5 });
  });

  it('Esc despues de elegir quita las marcas; sin nada elegido dice que no habia nada', async () => {
    const { soldier, marks, controls } = await myTurn();
    await controls.tap(soldier);
    expect(controls.cancel()).toBe(true);
    expect(marks.reach).toEqual([]);
    expect(marks.selected).toBeNull();
    expect(controls.cancel()).toBe(false);
  });

  it('un enemigo al alcance sale en rojo y tocarlo mueve y ataca: dos tandas de sucesos', async () => {
    const { s, events, marks, controls } = await myTurn();
    const tank = newUnit(s, TANK, PLAYER, { x: 10, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 10, y: 13 });
    await controls.tap(tank);
    expect(marks.targets).toContainEqual(expect.objectContaining({ x: 10, y: 13 }));
    await controls.tap({ x: 10, y: 13 });
    expect(events.played.map(kindsOf)).toEqual([expect.arrayContaining(['move']), expect.arrayContaining(['attack'])]);
  });
});
