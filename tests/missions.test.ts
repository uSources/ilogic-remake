import { matchSeedsFrom } from '@core/util/random';
import { MoveType } from '@core/content';
import { changeSettings } from '@core/gameState';
import { unitTypeOf } from '@core/gameContent';
import { describe, expect, it } from 'vitest';
import { settingsWith } from '@core/matchSettings';
import { defaultContent } from '@core/content/default';
import { buildMission, checkMission, missionSettings, MISSIONS } from '@core/missions';

/** Semilla de los dados de las misiones de prueba (no importa cual: no hay combates). */
const MISSION_SEEDS = matchSeedsFrom(1);
import { distanceMap } from '@core/rules';
import { aiController } from '@core/controllers';
import { GameSession, runMatch } from '@core/session';
import { deserialize, serialize } from '@core/save';
import { hqId, resultFor } from './helpers';

const HQ = hqId();

describe('misiones', () => {
  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))('%s: mapa valido y bases conectadas', (_id, mission) => {
    expect(checkMission(mission, defaultContent())).toEqual([]);
    const s = buildMission(mission, defaultContent(), MISSION_SEEDS);
    const hq0 = s.buildings.find((building) => building.owner === 0 && building.type === HQ)!;
    const hq1 = s.buildings.find((building) => building.owner === 1 && building.type === HQ)!;
    expect(distanceMap(s, hq0, MoveType.FOOT).at(hq1), 'a pie de base a base').toBeLessThan(Infinity);
    expect(resultFor(s, 0)).toBe('playing');
    const objective = s.mission!.objective;
    if (objective.kind === 'escort') {
      const vip = s.units.find((unit) => unit.uid === objective.uid)!;
      expect(distanceMap(s, vip, unitTypeOf(s, vip).movement).at(objective.to), 'el convoy puede llegar').toBeLessThan(Infinity);
    }
    // Guardar y cargar conserva la mision.
    expect(deserialize(serialize(s), defaultContent())!.mission).toEqual(s.mission);
  });

  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))(
    '%s: guardada y cargada sigue con sus reglas (fallo K1)',
    (_id, mission) => {
      const s = buildMission(mission, defaultContent(), MISSION_SEEDS);
      expect(s.settings).toEqual(missionSettings(mission, defaultContent()));
      expect(s.settings).not.toEqual(defaultContent().defaultSettings); // sin mantenimiento, ni puntos de mando, ni clima
      expect(deserialize(serialize(s), defaultContent())!.settings).toEqual(missionSettings(mission, defaultContent()));
      // Sin reglas esta rota: no se ponen las de su mision.
      const withoutSettings = JSON.parse(serialize(s)) as { settings?: unknown };
      delete withoutSettings.settings;
      expect(deserialize(JSON.stringify(withoutSettings), defaultContent())).toBeNull();
    },
  );

  it('las misiones son de solo lectura tambien en los tipos', () => {
    const mission = MISSIONS[0]!;
    const changeFunds = () => {
      // @ts-expect-error las misiones no se pueden cambiar
      mission.teams[0]!.funds = 1;
    };
    const moveUnit = () => {
      // @ts-expect-error ni lo de dentro
      mission.units[0]![2] = 0;
    };
    expect(changeFunds).toThrow(TypeError);
    expect(moveUnit).toThrow(TypeError);
  });

  it('una mision guardada se carga con las reglas que guardo', () => {
    const s = buildMission(MISSIONS[0]!, defaultContent(), MISSION_SEEDS);
    changeSettings(s, settingsWith(defaultContent(), { fog: true, upkeep: 0.1 }));
    const back = deserialize(serialize(s), defaultContent())!;
    expect(back.settings).toEqual(settingsWith(defaultContent(), { fog: true, upkeep: 0.1 }));
    expect(back.settings).not.toEqual(missionSettings(MISSIONS[0]!, defaultContent()));
  });

  it('unas reglas guardadas rotas se rechazan, de una mision o no (no se arreglan)', () => {
    const saved = JSON.parse(serialize(buildMission(MISSIONS[0]!, defaultContent(), MISSION_SEEDS))) as {
      settings: Record<string, unknown>;
    };
    saved.settings.fog = 'mucha';
    expect(deserialize(JSON.stringify(saved), defaultContent())).toBeNull();
    delete saved.settings.fog;
    expect(deserialize(JSON.stringify(saved), defaultContent())).toBeNull();
  });

  it('una mision que ya no existe se carga con las reglas que guardo', () => {
    const saved = JSON.parse(serialize(buildMission(MISSIONS[0]!, defaultContent(), MISSION_SEEDS))) as {
      mission: { id: string };
      settings: unknown;
    };
    saved.mission.id = 'ya-no-existe';
    saved.settings = settingsWith(defaultContent(), { fog: true, upkeep: 0.1 });
    expect(deserialize(JSON.stringify(saved), defaultContent())!.settings).toEqual(
      settingsWith(defaultContent(), { fog: true, upkeep: 0.1 }),
    );
  });

  it.each(MISSIONS.map((mission) => [mission.id, mission] as const))('%s: se juega IA contra IA sin errores', (_id, mission) => {
    const s = buildMission(mission, defaultContent(), MISSION_SEEDS);
    runMatch(
      new GameSession(
        s,
        s.teams.map(() => aiController()),
      ),
      { until: (state) => state.day > 20 },
    );
    expect(['playing', 'won', 'lost']).toContain(resultFor(s, 0));
  });

  it('objetivos: aguantar, capturar, destruir y escoltar', () => {
    const byId = (id: string) => MISSIONS.find((mission) => mission.id === id)!;
    const hold = buildMission(byId('hold'), defaultContent(), MISSION_SEEDS);
    hold.day = 9;
    expect(resultFor(hold, 0)).toBe('won');

    const bh = buildMission(byId('bridgehead'), defaultContent(), MISSION_SEEDS);
    for (const building of bh.buildings) if (building.type === 'City' && building.owner === null) building.owner = 0;
    expect(resultFor(bh, 0)).toBe('won');
    const bh2 = buildMission(byId('bridgehead'), defaultContent(), MISSION_SEEDS);
    bh2.day = 15;
    expect(resultFor(bh2, 0)).toBe('lost');

    const cl = buildMission(byId('cleanup'), defaultContent(), MISSION_SEEDS);
    cl.units = cl.units.filter((unit) => unit.team === 0);
    expect(resultFor(cl, 0)).toBe('won');

    const es = buildMission(byId('escort'), defaultContent(), MISSION_SEEDS);
    const objective = es.mission!.objective as { kind: 'escort'; uid: number; to: { x: number; y: number } };
    const vip = es.units.find((unit) => unit.uid === objective.uid)!;
    expect(resultFor(es, 0)).toBe('playing');
    vip.x = objective.to.x;
    vip.y = objective.to.y;
    expect(resultFor(es, 0)).toBe('won');
    es.units = es.units.filter((unit) => unit.uid !== objective.uid);
    expect(resultFor(es, 0)).toBe('lost');
  });
});
