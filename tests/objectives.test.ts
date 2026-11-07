import { afterEach, describe, expect, it } from 'vitest';
import { objectiveStatusText, objectiveText } from '../src/campaign';
import { settings } from '../src/settings';
import { defaultContent } from '@core/content/default';
import { buildMission } from '@core/missions';
import { isValidObjective, measureObjective, missionObjectives, objectiveOf, objectiveStatus } from '@core/objectives';
import { isDefeated, objectiveProgress } from '@core/rules';
import { teamIds } from '@core/teams';
import { mapGrid } from '@core/mapGrid';
import type { GameState } from '@core/model';
import { BLANK_SEEDS, resultFor } from './helpers';

/** Las misiones de la campaña (las del contenido del juego). */
const MISSIONS = defaultContent().missions.list;

afterEach(() => {
  settings.lang = 'es';
});

/** Partidas de cada mision en momentos distintos: al empezar, al acabar el plazo, sin enemigos, con todo capturado... */
function statesOf(id: string): GameState[] {
  const mission = defaultContent().missions.byId[id]!;
  const fresh = () => buildMission(mission, defaultContent(), BLANK_SEEDS);
  /** El objetivo de quien juega (el equipo 0 en todas las misiones de la campaña). */
  const playerGoal = (s: GameState) => objectiveOf(s, 0)!;
  const lastDay = (s: GameState) => {
    const goal = playerGoal(s);
    return 'days' in goal ? goal.days : 20;
  };
  const states: GameState[] = [];
  const atStart = fresh();
  states.push(atStart);
  for (const dayOffset of [0, 1]) {
    const late = fresh();
    late.day = lastDay(late) + dayOffset;
    states.push(late);
  }
  const noEnemies = fresh();
  noEnemies.units = noEnemies.units.filter((unit) => unit.team === 0);
  states.push(noEnemies);
  const everythingOwned = fresh();
  for (const building of everythingOwned.buildings) if (building.owner === null) building.owner = 0;
  states.push(everythingOwned);
  const noPlayerUnits = fresh();
  noPlayerUnits.units = noPlayerUnits.units.filter((unit) => unit.team === 1);
  states.push(noPlayerUnits);
  const objective = playerGoal(atStart);
  if (objective.kind === 'escort') {
    const arrived = fresh();
    const vip = arrived.units.find((unit) => unit.uid === objective.uid)!;
    vip.x = objective.to.x;
    vip.y = objective.to.y;
    states.push(arrived);
    const carried = fresh();
    const truck = carried.units.find((unit) => unit.uid === objective.uid)!;
    const carrier = carried.units.find((unit) => unit.team === 0 && unit.uid !== objective.uid)!;
    truck.carrier = carrier.uid;
    carrier.x = objective.to.x;
    carrier.y = objective.to.y;
    states.push(carried);
  }
  return states;
}

/** Lo que da el objetivo a su dueño: cumplido, gana; fallado, pierde; si no, se sigue. */
const STATUS_FOR_OWNER = { achieved: 'won', failed: 'lost', pending: 'playing' } as const;

/** Perder la Base o quedarse sin nada se mira antes que el objetivo (la regla 'lastAllianceStanding'). */
function isAnyoneDefeated(s: GameState): boolean {
  return teamIds(s).some((team) => isDefeated(s, team));
}

describe('objetivos de mision', () => {
  it.each(MISSIONS.map((mission) => [mission.id] as const))('%s: mismo resultado y progreso que las reglas', (id) => {
    for (const s of statesOf(id)) {
      for (const objective of missionObjectives(s)) {
        const team = objective.owner;
        expect(measureObjective(s, objective)).toEqual(objectiveProgress(s, team));
        if (objective.kind === 'hq' || isAnyoneDefeated(s)) continue;
        expect(resultFor(s, team)).toBe(STATUS_FOR_OWNER[objectiveStatus(s, objective)]);
      }
    }
  });

  it('cada equipo de la mision lleva su objetivo, o ninguno; la partida los guarda por equipo', () => {
    for (const mission of MISSIONS) {
      const s = buildMission(mission, defaultContent(), BLANK_SEEDS);
      const owners = missionObjectives(s).map((objective) => objective.owner);
      expect(owners).toEqual(mission.teams.flatMap((team, id) => (team.objective ? [id] : [])));
      expect(objectiveOf(s, 1)).toBeUndefined();
    }
  });

  it('textos del objetivo y del progreso, como antes', () => {
    const texts = MISSIONS.map((mission) => {
      const s = buildMission(mission, defaultContent(), BLANK_SEEDS);
      const viewer = { s, team: 0 };
      return [objectiveText(mission), objectiveText(mission, viewer), objectiveText(null, viewer), objectiveStatusText(viewer)];
    });
    expect(objectiveText(null)).toBe('Conquista la Base enemiga.');
    settings.lang = 'en';
    expect(objectiveText(MISSIONS[1]!)).toBe('Own 6 citys before day 14 ends.');
    expect(objectiveStatusText({ s: buildMission(MISSIONS[4]!, defaultContent(), BLANK_SEEDS), team: 0 })).toBe('Left: 8 · Day 1 of 10');
    settings.lang = 'es';
    expect(texts).toEqual([
      ['Conquista la Base enemiga.', 'Conquista la Base enemiga.', 'Conquista la Base enemiga.', null],
      [
        'Ten 6 ciudades antes de que acabe el día 14.',
        'Ten 6 ciudades antes de que acabe el día 14.',
        'Ten 6 ciudades antes de que acabe el día 14.',
        '1/6 · Día 1 de 14',
      ],
      ['Aguanta hasta el final del día 8.', 'Aguanta hasta el final del día 8.', 'Aguanta hasta el final del día 8.', 'Día 1 de 8'],
      [
        'Lleva el camión de suministros a la ciudad marcada antes de que acabe el día 12.',
        'Lleva el camión de suministros a la ciudad marcada antes de que acabe el día 12.',
        'Lleva el camión de suministros a la ciudad marcada antes de que acabe el día 12.',
        'Día 1 de 12',
      ],
      [
        'Destruye todas las unidades enemigas antes de que acabe el día 10.',
        'Destruye todas las unidades enemigas antes de que acabe el día 10.',
        'Destruye todas las unidades enemigas antes de que acabe el día 10.',
        'Quedan: 8 · Día 1 de 10',
      ],
      ['Conquista la Base enemiga.', 'Conquista la Base enemiga.', 'Conquista la Base enemiga.', null],
    ]);
  });
});

describe('objetivo de una partida guardada: cada tipo comprueba sus campos', () => {
  it('isValidObjective', () => {
    const s = buildMission(MISSIONS[0]!, defaultContent(), BLANK_SEEDS);
    const where = { content: s.content, board: mapGrid(s) };
    expect(isValidObjective(where, { kind: 'hq' })).toBe(true);
    expect(isValidObjective(where, { kind: 'survive', days: 5 })).toBe(true);
    expect(isValidObjective(where, { kind: 'survive', days: 0 })).toBe(false);
    expect(isValidObjective(where, { kind: 'capture', count: 3, type: 'City', days: 9 })).toBe(true);
    expect(isValidObjective(where, { kind: 'capture', count: 3, type: 'Castle', days: 9 })).toBe(false);
    expect(isValidObjective(where, { kind: 'escort', uid: 1, to: { x: -1, y: 0 }, days: 9 })).toBe(false);
    expect(isValidObjective(where, { kind: 'conquer' })).toBe(false);
  });
});
