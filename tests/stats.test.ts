import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { defaultContent } from '@core/content/default';
import { newUnit } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { recordEvent, sampleArmy, statsOf } from '@core/stats';
import { emptyTeamStats, teamState } from '@core/teams';
import { posOf } from '@core/geom';
import type { CombatInfo } from '@core/model';
import { blankState, unitTypeNamed } from './helpers';

describe('estadisticas', () => {
  it('cuenta compras, bajas y capturas por equipo', () => {
    const s = blankState();
    const unit = newUnit(s, unitTypeNamed('Tank'), 0, { x: 3, y: 3 });
    s.units.push(unit);
    recordEvent(s, { kind: 'spawn', uid: unit.uid, at: { x: 3, y: 3 } }, 0);
    const combat = { attackerTeam: 0, defenderTeam: 1 } as CombatInfo;
    recordEvent(s, { kind: 'attack', attacker: unit.uid, target: { x: 4, y: 3 }, damage: 50, killed: true, combat }, 0);
    recordEvent(s, { kind: 'attack', attacker: unit.uid, target: { x: 4, y: 3 }, damage: 10, killed: false }, 0);
    recordEvent(s, { kind: 'capture', uid: unit.uid, at: { x: 3, y: 3 }, owner: null }, 1);
    expect(statsOf(s, 0)).toEqual({ built: 1, spent: unitTypeNamed('Tank').cost, lost: 0, captured: 0, army: [] });
    expect(statsOf(s, 1)).toEqual({ built: 0, spent: 0, lost: 1, captured: 1, army: [] });
  });

  it('la baja es del equipo de la unidad atacada, aunque haya mas de dos', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const tank = newUnit(s, unitTypeNamed('Tank'), 0, { x: 3, y: 3 });
    const target = newUnit(s, unitTypeNamed('Soldier'), 2, { x: 4, y: 3 });
    recordEvent(s, { kind: 'attack', attacker: tank.uid, target: posOf(target), damage: 10, killed: false }, 0);
    s.units = s.units.filter((unit) => unit.uid !== target.uid);
    const combat = { attackerTeam: 0, defenderTeam: 2 } as CombatInfo;
    recordEvent(s, { kind: 'attack', attacker: tank.uid, target: posOf(target), damage: 90, killed: true, combat }, 0);
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
    expect(statsOf(deserialize(serialize(s), saveContext(defaultContent()))!, 0).built).toBe(4);
    const bad = JSON.parse(serialize(s)) as { teams: { stats: unknown }[] };
    bad.teams[0]!.stats = { built: 'x' };
    expect(statsOf(deserialize(JSON.stringify(bad), saveContext(defaultContent()))!, 0)).toEqual(emptyTeamStats());
  });
});
