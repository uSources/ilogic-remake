import { describe, expect, it } from 'vitest';
import { foesInMind } from '@core/ai/memory';
import { influenceOf } from '@core/ai/influence';
import { newUnit } from '@core/measure';
import { playerView } from '@core/playerView';
import { rememberSightings } from '@core/rules/sightings';
import { deserialize, serialize } from '@core/save';
import { defaultContent } from '@core/content/default';
import { teamState } from '@core/teams';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

const TANK = unitTypeNamed('Tank');
const FAR_AWAY = { x: 20, y: 20 };

/** Con niebla: un tanque propio que ha visto a uno enemigo y se ha ido lejos (ya no lo ve). */
function lostSight() {
  const s = blankState({ fog: true, weather: false });
  const mine = newUnit(s, TANK, PLAYER, { x: 2, y: 2 });
  const foe = newUnit(s, TANK, ENEMY, { x: 4, y: 2 });
  rememberSightings(s);
  Object.assign(mine, FAR_AWAY);
  rememberSightings(s);
  return { s, mine, foe };
}

const sightingsOf = (s: ReturnType<typeof blankState>, team: number) => teamState(s, team).sightings;

describe('memoria con la niebla (docs/PLAN-IA.md, fase 3)', () => {
  it('recuerda donde vio por ultima vez a un enemigo que ya no ve', () => {
    const { s, foe } = lostSight();
    expect(sightingsOf(s, PLAYER)).toEqual([expect.objectContaining({ uid: foe.uid, x: 4, y: 2, day: s.day })]);
  });

  it('lo olvida al volver a mirar alli y ver la casilla vacia', () => {
    const { s, mine, foe } = lostSight();
    Object.assign(foe, { x: 12, y: 12 });
    Object.assign(mine, { x: 2, y: 2 });
    rememberSightings(s);
    expect(sightingsOf(s, PLAYER)).toEqual([]);
  });

  it('sin niebla no hay nada que recordar', () => {
    const s = blankState({ fog: false, weather: false });
    newUnit(s, TANK, PLAYER, { x: 2, y: 2 });
    newUnit(s, TANK, ENEMY, { x: 4, y: 2 });
    rememberSightings(s);
    expect(sightingsOf(s, PLAYER)).toEqual([]);
  });

  it('solo la sabe su equipo: la niebla la quita a los demas', () => {
    const { s } = lostSight();
    expect(playerView(s, PLAYER).state.teams[PLAYER]!.sightings).toHaveLength(1);
    expect(playerView(s, ENEMY).state.teams[PLAYER]!.sightings).toEqual([]);
  });

  it('un recuerdo pesa menos cuanto mas viejo y pasados memoryDays dias no cuenta', () => {
    const { s } = lostSight();
    expect(foesInMind(s, PLAYER, 0)).toEqual([]);
    expect(foesInMind(s, PLAYER, 1).map((foe) => foe.weight)).toEqual([1]);
    s.day += 1;
    expect(foesInMind(s, PLAYER, 1).map((foe) => foe.weight)).toEqual([0.5]);
    s.day += 1;
    expect(foesInMind(s, PLAYER, 1)).toEqual([]);
  });

  it('el peligro cuenta al enemigo recordado si el perfil se acuerda', () => {
    const { s, mine } = lostSight();
    expect(influenceOf(s, PLAYER, 0).dangerFor(mine, { x: 5, y: 2 })).toBe(0);
    expect(influenceOf(s, PLAYER, 1).dangerFor(mine, { x: 5, y: 2 })).toBeGreaterThan(0);
  });

  it('se guarda con la partida, y un recuerdo roto se olvida', () => {
    const { s } = lostSight();
    expect(deserialize(serialize(s), defaultContent())!.teams[PLAYER]!.sightings).toEqual(sightingsOf(s, PLAYER));
    sightingsOf(s, PLAYER).push({ uid: -1, type: 'Tank', team: ENEMY, x: 0, y: 0, life: 100, day: 1 });
    expect(deserialize(serialize(s), defaultContent())!.teams[PLAYER]!.sightings).toHaveLength(1);
  });
});
