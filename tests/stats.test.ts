import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { endRound } from '@core/rules/round';
import { newUnit } from '@core/measure';
import { deserialize, serialize } from '@core/save';
import { armyByDay, armyValue, recordEvent, sampleArmy, statsOf } from '@core/stats';
import { emptyTeamStats, teamState } from '@core/teams';
import { posOf } from '@core/geom';
import type { CombatInfo } from '@core/model';
import { act, blankState, unitTypeNamed } from './helpers';

describe('estadisticas', () => {
  it('cuenta compras, bajas y capturas por equipo', () => {
    const s = blankState();
    const unit = newUnit(s, unitTypeNamed('Tank'), 0, { x: 3, y: 3 });
    s.units.push(unit);
    recordEvent(s, { kind: 'spawn', actor: 0, uid: unit.uid, unitType: 'Tank', team: 0, at: { x: 3, y: 3 } });
    const combat = { attackerTeam: 0, defenderTeam: 1 } as CombatInfo;
    const at = { x: 4, y: 3 };
    const fight = { kind: 'attack', actor: 0, attacker: unit.uid, target: 99, at, counter: 0, attackerKilled: false, combat } as const;
    recordEvent(s, { ...fight, damage: 50, killed: true });
    recordEvent(s, { ...fight, damage: 10, killed: false });
    recordEvent(s, { kind: 'capture', actor: 1, uid: unit.uid, at: { x: 3, y: 3 }, owner: 1, left: 0, total: 20 });
    // El fin de ronda (sin actor) no cuenta.
    recordEvent(s, { kind: 'income', actor: null, team: 0, amount: 1000, source: 'buildings' });
    expect(statsOf(s, 0)).toEqual({ built: 1, spent: unitTypeNamed('Tank').cost, lost: 0, captured: 0, army: [] });
    expect(statsOf(s, 1)).toEqual({ built: 0, spent: 0, lost: 1, captured: 1, army: [] });
  });

  it('la baja es del equipo de la unidad atacada, aunque haya mas de dos', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const tank = newUnit(s, unitTypeNamed('Tank'), 0, { x: 3, y: 3 });
    const target = newUnit(s, unitTypeNamed('Soldier'), 2, { x: 4, y: 3 });
    const combat = { attackerTeam: 0, defenderTeam: 2 } as CombatInfo;
    const fight = {
      kind: 'attack',
      actor: 0,
      attacker: tank.uid,
      target: target.uid,
      at: posOf(target),
      counter: 0,
      attackerKilled: false,
      combat,
    } as const;
    recordEvent(s, { ...fight, damage: 10, killed: false });
    s.units = s.units.filter((unit) => unit.uid !== target.uid);
    recordEvent(s, { ...fight, damage: 90, killed: true });
    expect(s.teams.map((team) => team.stats.lost)).toEqual([0, 0, 1]);
  });

  it('el valor del ejercito se apunta cada dia para cada equipo', () => {
    const s = blankState();
    newUnit(s, unitTypeNamed('Tank'), 1, { x: 3, y: 3 });
    sampleArmy(s);
    s.day = 3;
    sampleArmy(s);
    expect(statsOf(s, 0).army).toEqual([0, 0, 0]);
    expect(statsOf(s, 1).army).toEqual(Array(3).fill(unitTypeNamed('Tank').cost));
  });

  it('se guardan con la partida y unas rotas se leen a cero', () => {
    const s = blankState();
    teamState(s, 0).stats.built = 4;
    expect(statsOf(deserialize(serialize(s), defaultContent())!, 0).built).toBe(4);
    const bad = JSON.parse(serialize(s)) as { teams: { stats: unknown }[] };
    bad.teams[0]!.stats = { built: 'x' };
    expect(statsOf(deserialize(JSON.stringify(bad), defaultContent())!, 0)).toEqual(emptyTeamStats());
  });
});

describe('las estadisticas salen de los sucesos, no de lo que se anima', () => {
  it('dispatch apunta cada accion (comprar) y el fin de ronda la muestra del ejercito del dia nuevo', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: 0, x: 4, y: 4 });
    act(s, 0, { kind: 'buy', at: { x: 4, y: 4 }, unitType: 'Soldier' });
    expect(statsOf(s, 0)).toMatchObject({ built: 1, spent: unitTypeNamed('Soldier').cost });
    endRound(s);
    expect(statsOf(s, 0).army).toHaveLength(2);
    expect(armyByDay(s, 0)).toHaveLength(2);
    expect(armyByDay(s, 0).at(-1)).toBe(armyValue(s, 0));
  });
});
