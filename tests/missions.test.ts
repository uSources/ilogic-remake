import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { aiTurn } from '@core/ai';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/geom';
import { createLayer } from '@core/mapGrid';
import { buildMission, checkMission, missionRules, MISSIONS } from '@core/missions';
import { endRound, groundDistance, outcome } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { savedByVersion1 } from './helpers';

const { UNIT, HQ } = defaultContent().tables;

describe('misiones', () => {
  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))('%s: mapa valido y bases conectadas', (_id, mission) => {
    expect(checkMission(mission, defaultContent())).toEqual([]);
    const s = buildMission(mission, defaultContent());
    const hq0 = s.buildings.find((building) => building.owner === 0 && building.type === HQ)!;
    const hq1 = s.buildings.find((building) => building.owner === 1 && building.type === HQ)!;
    expect(groundDistance(s, hq0, 0, createLayer(s, false)).at(hq1), 'a pie de base a base').toBeGreaterThan(0);
    expect(outcome(s)).toBe('playing');
    const objective = s.mission!.objective;
    if (objective.kind === 'escort') {
      const vip = s.units.find((unit) => unit.uid === objective.uid)!;
      expect(
        groundDistance(s, vip, UNIT.movtype[vip.type]!, createLayer(s, false)).at(objective.to),
        'el convoy puede llegar',
      ).toBeGreaterThan(0);
    }
    // Guardar y cargar conserva la mision.
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.mission).toEqual(s.mission);
  });

  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))(
    '%s: guardada y cargada sigue con sus reglas (fallo K1)',
    (_id, mission) => {
      const s = buildMission(mission, defaultContent());
      expect(s.rules).toEqual(missionRules(mission, defaultContent()));
      expect(s.rules).not.toEqual(defaultContent().tables.DEFAULT_RULES); // sin mantenimiento, ni puntos de mando, ni clima
      expect(deserialize(serialize(s), saveContext(defaultContent()))!.rules).toEqual(missionRules(mission, defaultContent()));
      // Las guardadas antes del arreglo (version 1) a veces no llevaban reglas: se recuperan las de su mision.
      const old = JSON.parse(serialize(s)) as { rules?: unknown };
      delete old.rules;
      expect(deserialize(savedByVersion1(JSON.stringify(old)), saveContext(defaultContent()))!.rules).toEqual(
        missionRules(mission, defaultContent()),
      );
      // Una guardada despues sin reglas esta rota.
      expect(deserialize(JSON.stringify(old), saveContext(defaultContent()))).toBeNull();
    },
  );

  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))(
    '%s: guardada con las reglas de escaramuza, se juega con las suyas (fallo K1)',
    (_id, mission) => {
      // Las guardadas con el fallo (version 1) llevaban las reglas de siempre: no se distinguen de unas
      // elegidas, asi que una mision conocida de antes del arreglo se juega con las suyas.
      const saved = JSON.parse(serialize(buildMission(mission, defaultContent()))) as { rules: unknown };
      saved.rules = rulesWith(defaultContent());
      expect(saved.rules).toEqual(defaultContent().tables.DEFAULT_RULES);
      expect(deserialize(savedByVersion1(JSON.stringify(saved)), saveContext(defaultContent()))!.rules).toEqual(
        missionRules(mission, defaultContent()),
      );
    },
  );

  it('las misiones son de solo lectura tambien en los tipos', () => {
    const mission = MISSIONS[0]!;
    const changeFunds = () => {
      // @ts-expect-error las misiones no se pueden cambiar
      mission.funds[0] = 1;
    };
    const moveUnit = () => {
      // @ts-expect-error ni lo de dentro
      mission.units[0]![2] = 0;
    };
    expect(changeFunds).toThrow(TypeError);
    expect(moveUnit).toThrow(TypeError);
  });
  it('una mision guardada despues del arreglo (version 2) se carga con las reglas que guardo', () => {
    const s = buildMission(MISSIONS[0]!, defaultContent());
    s.rules = rulesWith(defaultContent(), { fog: true, upkeep: 0.1 });
    const back = deserialize(serialize(s), saveContext(defaultContent()))!;
    expect(back.rules).toEqual(rulesWith(defaultContent(), { fog: true, upkeep: 0.1 }));
    expect(back.rules).not.toEqual(missionRules(MISSIONS[0]!, defaultContent()));
  });

  it('unas reglas guardadas rotas se rechazan, de una mision o no (en la version 2 no se arreglan)', () => {
    const saved = JSON.parse(serialize(buildMission(MISSIONS[0]!, defaultContent()))) as { rules: Record<string, unknown> };
    saved.rules.fog = 'mucha';
    expect(deserialize(JSON.stringify(saved), saveContext(defaultContent()))).toBeNull();
    delete saved.rules.fog;
    expect(deserialize(JSON.stringify(saved), saveContext(defaultContent()))).toBeNull();
  });

  it('una mision que ya no existe se carga con las reglas que guardo', () => {
    const saved = JSON.parse(serialize(buildMission(MISSIONS[0]!, defaultContent()))) as { mission: { id: string }; rules: unknown };
    saved.mission.id = 'ya-no-existe';
    saved.rules = rulesWith(defaultContent(), { fog: true, upkeep: 0.1 });
    expect(deserialize(JSON.stringify(saved), saveContext(defaultContent()))!.rules).toEqual(
      rulesWith(defaultContent(), { fog: true, upkeep: 0.1 }),
    );
  });

  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))('%s: se juega IA contra IA sin errores', (_id, mission) => {
    const s = buildMission(mission, defaultContent());
    const rng = seededRng(5);
    for (let day = 0; day < 20 && outcome(s) === 'playing'; day++) {
      for (const team of [0, 1] as const) {
        for (const _ of aiTurn(s, rng, team)) if (outcome(s) !== 'playing') break;
        if (outcome(s) !== 'playing') break;
      }
      endRound(s);
    }
    expect(['playing', 'won', 'lost']).toContain(outcome(s));
  });

  it('objetivos: aguantar, capturar, destruir y escoltar', () => {
    const byId = (id: string) => MISSIONS.find((mission) => mission.id === id)!;
    const hold = buildMission(byId('hold'), defaultContent());
    hold.day = 9;
    expect(outcome(hold)).toBe('won');

    const bh = buildMission(byId('bridgehead'), defaultContent());
    for (const building of bh.buildings) if (building.type === 0 && building.owner === null) building.owner = 0;
    expect(outcome(bh)).toBe('won');
    const bh2 = buildMission(byId('bridgehead'), defaultContent());
    bh2.day = 15;
    expect(outcome(bh2)).toBe('lost');

    const cl = buildMission(byId('cleanup'), defaultContent());
    cl.units = cl.units.filter((unit) => unit.team === 0);
    expect(outcome(cl)).toBe('won');

    const es = buildMission(byId('escort'), defaultContent());
    const objective = es.mission!.objective as { kind: 'escort'; uid: number; to: { x: number; y: number } };
    const vip = es.units.find((unit) => unit.uid === objective.uid)!;
    expect(outcome(es)).toBe('playing');
    vip.x = objective.to.x;
    vip.y = objective.to.y;
    expect(outcome(es)).toBe('won');
    es.units = es.units.filter((unit) => unit.uid !== objective.uid);
    expect(outcome(es)).toBe('lost');
  });
});
