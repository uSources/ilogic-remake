import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { blankState } from './helpers';
import { areEnemies, canFight, isAlive, isCapturer, isOnMap } from '@core/util/predicates';

describe('preguntas con nombre', () => {
  it('enemigos: de alianzas distintas (ningun numero de equipo es especial)', () => {
    const s = blankState({}, [
      { controller: 'ai', alliance: 0 },
      { controller: 'human', alliance: 1 },
      { controller: 'ai', alliance: 0 },
    ]);
    expect(areEnemies(s, { team: 0 }, { team: 1 })).toBe(true);
    expect(areEnemies(s, { team: 1 }, { team: 1 })).toBe(false);
    expect(areEnemies(s, { team: 0 }, { team: 2 })).toBe(false);
    expect(areEnemies(s, { team: 2 }, { team: 1 })).toBe(true);
  });

  it('en el mapa y con vida', () => {
    expect(isOnMap({ carrier: null })).toBe(true);
    expect(isOnMap({ carrier: 7 })).toBe(false);
    expect(isAlive({ life: 1 })).toBe(true);
    expect(isAlive({ life: 0 })).toBe(false);
  });

  it('luchar y capturar leen las tablas de units.json', () => {
    const s = blankState();
    defaultContent().units.list.forEach((unitType) => {
      expect(canFight(s, { type: unitType.id })).toBe(unitType.attack !== null);
      expect(isCapturer(s, { type: unitType.id })).toBe(unitType.canCapture);
    });
  });
});
