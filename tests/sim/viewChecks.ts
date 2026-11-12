import { expect } from 'vitest';
import type { GameEvent, GameState, TeamId } from '@core/model';
import { sightOf, unitById } from '@core/rules';
import { areAllied, emptyTeamStats } from '@core/teams';
import { referencesOf } from './eventReferences';

/**
 * Comprobaciones de lo que sabe un equipo (para la niebla de los sucesos y la sala): una partida tal
 * como la sabe `team` no cuenta nada que no deba, y unos sucesos solo nombran lo que el equipo
 * conoce antes o despues del paso.
 */

/** La partida `view` es lo que sabe `team` y nada mas (lo que quita FOG, playerView.ts). */
export function expectFoggedView(view: GameState, team: TeamId): void {
  const sees = sightOf(view, team);
  const isAlly = (other: TeamId) => areAllied(view, team, other);
  for (const unit of view.units) {
    if (isAlly(unit.team)) continue;
    expect(unit.carrier, `enemigo ${unit.uid} dentro de un transporte`).toBeNull();
    expect(sees(unit), `enemigo ${unit.uid} en (${unit.x}, ${unit.y}) sin verse`).toBe(true);
    expect(unit.standingOrder, `orden del enemigo ${unit.uid}`).toBeUndefined();
    expect(unit.squad, `escuadra del enemigo ${unit.uid}`).toBeUndefined();
    expect(
      unit.cargo.every((slot) => slot === null),
      `carga del enemigo ${unit.uid}`,
    ).toBe(true);
  }
  for (const squad of view.squads ?? []) expect(isAlly(squad.team), `escuadra enemiga ${squad.id}`).toBe(true);
  for (const move of view.undoableMoves ?? []) expect(unitById(view, move.uid)?.team).toBe(team);
  for (const building of view.buildings) {
    const capturer = building.capture?.team;
    if (capturer !== undefined && !isAlly(capturer))
      expect(sees(building), `captura enemiga en (${building.x}, ${building.y}) sin verse`).toBe(true);
  }
  for (const other of view.teams) {
    if (isAlly(other.id)) continue;
    expect(other.stats).toEqual(emptyTeamStats());
    expect(other.funds, `dinero del enemigo ${other.id}`).toBe(0);
    expect(other.general?.charge ?? 0, `carga del general del enemigo ${other.id}`).toBe(0);
  }
  expect([view.dice, view.decisionSeed, view.setup]).toEqual([0, 0, undefined]);
}

/**
 * Cada suceso de `events` solo nombra unidades que `team` conoce y casillas que ve en `before` o en
 * `after` (sus dos vistas), y lo privado es de su alianza.
 */
export function expectReferencesKnown(events: readonly GameEvent[], before: GameState, after: GameState, team: TeamId): void {
  const sees = [sightOf(before, team), sightOf(after, team)];
  for (const event of events) {
    const { uids, tiles, privateTo } = referencesOf(event);
    // Por donde pasa su alianza lo sabe entero (el camino de una unidad suya pasa por donde no ve).
    const isOwnDoing = event.actor !== null && areAllied(after, team, event.actor);
    for (const uid of uids) {
      const known = unitById(before, uid) !== undefined || unitById(after, uid) !== undefined;
      expect(known, `${event.kind}: la unidad ${uid} no se conoce`).toBe(true);
    }
    for (const tile of isOwnDoing ? [] : tiles)
      expect(
        sees.some((sight) => sight(tile)),
        `${event.kind}: la casilla (${tile.x}, ${tile.y}) no se ve`,
      ).toBe(true);
    for (const other of privateTo) expect(areAllied(after, team, other), `${event.kind}: es privado del equipo ${other}`).toBe(true);
  }
}
