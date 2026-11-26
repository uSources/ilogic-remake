import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { buildingShare, standingVM } from '../src/ui/hudModels';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

describe('«Cómo va» de la pausa', () => {
  /** Una partida con dos unidades propias, una enemiga, la Base de cada uno y una ciudad neutral. */
  function matchWithArmies(fog: boolean) {
    const s = blankState({ fog });
    newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 1, y: 1 });
    newUnit(s, unitTypeNamed('Tank'), PLAYER, { x: 2, y: 1 });
    newUnit(s, unitTypeNamed('Soldier'), ENEMY, { x: 9, y: 9 });
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    return s;
  }

  it('sin niebla cuenta las unidades de los dos lados', () => {
    expect(standingVM(matchWithArmies(false), PLAYER).units).toEqual([2, 1]);
  });

  it('con niebla no se sabe cuantas unidades tiene el enemigo (las que se ven no son todas)', () => {
    expect(standingVM(matchWithArmies(true), PLAYER).units).toEqual([2, null]);
  });

  it('los edificios y lo que pagan son de quien son, con niebla o sin ella', () => {
    const s = matchWithArmies(true);
    const standing = standingVM(s, PLAYER);
    expect(standing.buildings).toEqual([1, 1]);
    expect(standing.income[0]).toBeGreaterThan(0);
    expect(standing.income[1]).toBe(standing.income[0]);
  });

  it('en el final, los edificios de su alianza de todos los del mapa', () => {
    const s = matchWithArmies(false);
    expect(buildingShare(s, PLAYER)).toEqual({ own: 1, total: 3 });
  });
});
