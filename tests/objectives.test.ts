import { afterEach, describe, expect, it } from 'vitest';
import { objectiveStatus, objectiveText } from '../src/campaign';
import { settings } from '../src/settings';
import { defaultContent } from '@core/content/default';
import { buildMission, MISSIONS } from '@core/missions';
import { measureObjective, objectiveOutcome } from '@core/objectives';
import { isDefeated, objectiveProgress, outcome } from '@core/rules';
import { teamIds } from '@core/teams';
import type { GameState } from '@core/model';

afterEach(() => {
  settings.lang = 'es';
});

/** Partidas de cada mision en momentos distintos: al empezar, al acabar el plazo, sin enemigos, con todo capturado... */
function statesOf(id: string): GameState[] {
  const mission = MISSIONS.find((candidate) => candidate.id === id)!;
  const fresh = () => buildMission(mission, defaultContent());
  const lastDay = (s: GameState) => ('days' in s.mission!.objective ? s.mission!.objective.days : 20);
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
  const objective = atStart.mission!.objective;
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

/** Perder la Base o quedarse sin nada se mira antes que el objetivo (en `outcome`). */
function isAnyoneDefeated(s: GameState): boolean {
  return teamIds(s).some((team) => isDefeated(s, team));
}

describe('objetivos de mision', () => {
  it.each(MISSIONS.map((mission) => [mission.id] as const))('%s: mismo resultado y progreso que las reglas', (id) => {
    for (const s of statesOf(id)) {
      const { objective, team } = s.mission!;
      expect(measureObjective(s, team, objective)).toEqual(objectiveProgress(s));
      if (objective.kind !== 'hq' && !isAnyoneDefeated(s)) expect(objectiveOutcome(s, team, objective)).toBe(outcome(s, team));
    }
  });

  it('textos del objetivo y del progreso, como antes', () => {
    const texts = MISSIONS.map((mission) => {
      const s = buildMission(mission, defaultContent());
      return [objectiveText(mission), objectiveText(mission, s), objectiveText(null, s), objectiveStatus(s)];
    });
    expect(objectiveText(null)).toBe('Conquista la Base enemiga.');
    settings.lang = 'en';
    expect(objectiveText(MISSIONS[1]!)).toBe('Own 6 citys before day 14 ends.');
    expect(objectiveStatus(buildMission(MISSIONS[4]!, defaultContent()))).toBe('Left: 8 · Day 1 of 10');
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
