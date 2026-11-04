import { describe, expect, it } from 'vitest';
import { UNIT, UNIT_TYPES } from '@core/data';
import { AI_TEAM, PLAYER, canFight, isAlive, isCapturer, isEnemyOf, isOnMap, isPlayer, opponentOf } from '@core/util/predicates';

describe('preguntas con nombre', () => {
  it('bandos: jugador, rival y enemigos', () => {
    expect(isPlayer(PLAYER)).toBe(true);
    expect(isPlayer(AI_TEAM)).toBe(false);
    expect(isPlayer(null)).toBe(false);
    expect(opponentOf(PLAYER)).toBe(AI_TEAM);
    expect(opponentOf(AI_TEAM)).toBe(PLAYER);
    expect(isEnemyOf({ team: 0 }, { team: 1 })).toBe(true);
    expect(isEnemyOf({ team: 1 }, { team: 1 })).toBe(false);
  });

  it('en el mapa y con vida', () => {
    expect(isOnMap({ carrier: null })).toBe(true);
    expect(isOnMap({ carrier: 7 })).toBe(false);
    expect(isAlive({ life: 1 })).toBe(true);
    expect(isAlive({ life: 0 })).toBe(false);
  });

  it('luchar y capturar leen las tablas de units.json', () => {
    for (let type = 0; type < UNIT_TYPES; type++) {
      expect(canFight({ type })).toBe(!!UNIT.canfight[type]);
      expect(isCapturer({ type })).toBe(!!UNIT.cancapt[type]);
    }
  });
});
