import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { aiTurn } from '@core/ai';
import { DEFAULT_RULES, rulesWith } from '@core/data';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/geom';
import { createLayer } from '@core/mapGrid';
import { buildMission, checkMission, missionRules, MISSIONS } from '@core/missions';
import { endRound, groundDistance, outcome } from '@core/rules';
import { deserialize, serialize } from '@core/save';

const { UNIT, HQ } = defaultContent().tables;

describe('misiones', () => {
  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s: mapa valido y bases conectadas', (_id, m) => {
    expect(checkMission(m, defaultContent())).toEqual([]);
    const s = buildMission(m, defaultContent());
    const hq0 = s.buildings.find((b) => b.owner === 0 && b.type === HQ)!;
    const hq1 = s.buildings.find((b) => b.owner === 1 && b.type === HQ)!;
    expect(groundDistance(s, hq0, 0, createLayer(s, false)).at(hq1), 'a pie de base a base').toBeGreaterThan(0);
    expect(outcome(s)).toBe('playing');
    const obj = s.mission!.objective;
    if (obj.kind === 'escort') {
      const vip = s.units.find((u) => u.uid === obj.uid)!;
      expect(groundDistance(s, vip, UNIT.movtype[vip.type]!, createLayer(s, false)).at(obj.to), 'el convoy puede llegar').toBeGreaterThan(
        0,
      );
    }
    // Guardar y cargar conserva la mision.
    expect(deserialize(serialize(s), saveContext())!.mission).toEqual(s.mission);
  });

  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s: guardada y cargada sigue con sus reglas (fallo K1)', (_id, m) => {
    const s = buildMission(m, defaultContent());
    expect(s.rules).toEqual(missionRules(m));
    expect(s.rules).not.toEqual(DEFAULT_RULES); // sin mantenimiento, ni puntos de mando, ni clima
    expect(deserialize(serialize(s), saveContext())!.rules).toEqual(missionRules(m));
    // Las guardadas antes del arreglo no llevaban reglas: se recuperan las de su mision.
    const old = JSON.parse(serialize(s)) as { rules?: unknown };
    delete old.rules;
    expect(deserialize(JSON.stringify(old), saveContext())!.rules).toEqual(missionRules(m));
  });

  it.each(MISSIONS.map((m) => [m.id, m] as const))(
    '%s: guardada con las reglas de escaramuza, se juega con las suyas (fallo K1)',
    (_id, m) => {
      // Las guardadas con el fallo llevaban las reglas de siempre: no se distinguen de unas elegidas,
      // asi que una mision conocida se juega siempre con las suyas.
      const saved = JSON.parse(serialize(buildMission(m, defaultContent()))) as { rules: unknown };
      saved.rules = rulesWith();
      expect(saved.rules).toEqual(DEFAULT_RULES);
      expect(deserialize(JSON.stringify(saved), saveContext())!.rules).toEqual(missionRules(m));
    },
  );

  it('una mision que ya no existe se carga con las reglas que guardo', () => {
    const saved = JSON.parse(serialize(buildMission(MISSIONS[0]!, defaultContent()))) as { mission: { id: string }; rules: unknown };
    saved.mission.id = 'ya-no-existe';
    saved.rules = rulesWith({ fog: true, upkeep: 0.1 });
    expect(deserialize(JSON.stringify(saved), saveContext())!.rules).toEqual(rulesWith({ fog: true, upkeep: 0.1 }));
  });

  it.each(MISSIONS.map((m) => [m.id, m] as const))('%s: se juega IA contra IA sin errores', (_id, m) => {
    const s = buildMission(m, defaultContent());
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
    const hold = buildMission(byId('hold'), defaultContent());
    hold.day = 9;
    expect(outcome(hold)).toBe('won');

    const bh = buildMission(byId('bridgehead'), defaultContent());
    for (const b of bh.buildings) if (b.type === 0 && b.owner === null) b.owner = 0;
    expect(outcome(bh)).toBe('won');
    const bh2 = buildMission(byId('bridgehead'), defaultContent());
    bh2.day = 15;
    expect(outcome(bh2)).toBe('lost');

    const cl = buildMission(byId('cleanup'), defaultContent());
    cl.units = cl.units.filter((u) => u.team === 0);
    expect(outcome(cl)).toBe('won');

    const es = buildMission(byId('escort'), defaultContent());
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
