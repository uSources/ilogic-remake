import { afterEach, describe, expect, it } from 'vitest';
import { aiTurn } from '../src/core/ai';
import { HQ, DEFAULT_RULES, setMapSize, useRules, Movement } from '../src/core/data';
import { grid, seededRng } from '../src/core/geom';
import { buildMission, checkMission, missionRules, MISSIONS } from '../src/core/missions';
import { endRound, groundDistance, outcome } from '../src/core/rules';
import { deserialize, serialize } from '../src/core/save';

afterEach(() => {
  setMapSize(32);
  useRules(DEFAULT_RULES);
});

describe('misiones', () => {
  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s: mapa valido y bases conectadas', (_id, m) => {
    expect(checkMission(m)).toEqual([]);
    useRules(missionRules(m));
    const s = buildMission(m);
    const hq0 = s.buildings.find((b) => b.owner === 0 && b.type === HQ)!;
    const hq1 = s.buildings.find((b) => b.owner === 1 && b.type === HQ)!;
    expect(groundDistance(s, hq0, 0, grid(false))[hq1.x]![hq1.y], 'a pie de base a base').toBeGreaterThan(0);
    expect(outcome(s)).toBe('playing');
    const obj = s.mission!.objective;
    if (obj.kind === 'escort') {
      const vip = s.units.find((u) => u.uid === obj.uid)!;
      expect(groundDistance(s, vip, Movement.of(vip.type), grid(false))[obj.to.x]![obj.to.y], 'el convoy puede llegar').toBeGreaterThan(0);
    }
    // Guardar y cargar conserva la mision.
    expect(deserialize(serialize(s))!.mission).toEqual(s.mission);
  });

  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s: se juega IA contra IA sin errores', (_id, m) => {
    useRules(missionRules(m));
    const s = buildMission(m);
    const rng = seededRng(5);
    for (let d = 0; d < 20 && outcome(s) === 'playing'; d++) {
      for (const team of [0, 1] as const) {
        for (const _ of aiTurn(s, rng, team)) if (outcome(s) !== 'playing') break;
        if (outcome(s) !== 'playing') break;
      }
      endRound(s);
    }
    expect(['playing', 'won', 'lost']).toContain(outcome(s));
  });

  it('objetivos: aguantar, capturar, destruir y escoltar', () => {
    const byId = (id: string) => MISSIONS.find((m) => m.id === id)!;
    useRules(missionRules(byId('hold')));
    const hold = buildMission(byId('hold'));
    hold.day = 9;
    expect(outcome(hold)).toBe('won');

    const bh = buildMission(byId('bridgehead'));
    for (const b of bh.buildings) if (b.type === 0 && b.owner === null) b.owner = 0;
    expect(outcome(bh)).toBe('won');
    const bh2 = buildMission(byId('bridgehead'));
    bh2.day = 15;
    expect(outcome(bh2)).toBe('lost');

    const cl = buildMission(byId('cleanup'));
    cl.units = cl.units.filter((u) => u.team === 0);
    expect(outcome(cl)).toBe('won');

    const es = buildMission(byId('escort'));
    const obj = es.mission!.objective as { kind: 'escort'; uid: number; to: { x: number; y: number } };
    const vip = es.units.find((u) => u.uid === obj.uid)!;
    expect(outcome(es)).toBe('playing');
    vip.x = obj.to.x;
    vip.y = obj.to.y;
    expect(outcome(es)).toBe('won');
    es.units = es.units.filter((u) => u.uid !== obj.uid);
    expect(outcome(es)).toBe('lost');
  });
});
