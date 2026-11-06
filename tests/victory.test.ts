import { describe, expect, it } from 'vitest';
import { GAME_MODES, gameModeOf } from '@core/modes';
import { isWinner, matchResult, VICTORY_RULES } from '@core/rules';
import { buildMission, missionById } from '@core/missions';
import { defaultContent } from '@core/content/default';
import type { GameModeId, VictoryRuleId } from '@core/model';
import { act, blankState, BLANK_DICE_SEED, hqId, resultFor } from './helpers';

/** Quita al equipo su Base (con eso ha perdido). */
const takeHeadquarters = (s: ReturnType<typeof blankState>, team: number) => {
  s.buildings = s.buildings.filter((building) => !(building.owner === team && building.type === hqId()));
};

describe('como acaba una partida (rules/victory.ts, VICTORY_RULES)', () => {
  it('cada modo dice sus formas de acabar, y todas existen', () => {
    const modes = Object.keys(GAME_MODES) as GameModeId[];
    for (const mode of modes) {
      expect(GAME_MODES[mode].id).toBe(mode);
      for (const rule of GAME_MODES[mode].victory) expect(VICTORY_RULES[rule as VictoryRuleId]).toBeDefined();
    }
    expect(GAME_MODES.skirmish.victory).toEqual(['lastAllianceStanding', 'dayLimit']);
    expect(GAME_MODES.sandbox.victory).toEqual([]);
  });

  it('el resultado es igual para todos: gana una alianza entera, con sus equipos caidos', () => {
    const s = blankState({}, [
      { controller: 'human', alliance: 0 },
      { controller: 'ai', alliance: 1 },
      { controller: 'ai', alliance: 0 },
    ]);
    takeHeadquarters(s, 2);
    expect(matchResult(s).status).toBe('playing');
    takeHeadquarters(s, 1);
    const result = matchResult(s);
    expect(result).toEqual({ status: 'decided', winners: [0, 2], reason: 'hq' });
    expect([isWinner(result, 0), isWinner(result, 1), isWinner(result, 2)]).toEqual([true, false, true]);
  });

  it('[CAMBIO] si caen todos a la vez, empate (en 2013 perdia el jugador)', () => {
    const s = blankState();
    takeHeadquarters(s, 0);
    takeHeadquarters(s, 1);
    expect(matchResult(s)).toEqual({ status: 'draw', winners: [], reason: 'hq' });
  });

  it('rendirse es una accion: el equipo cuenta como derrotado y la partida acaba por eso', () => {
    const s = blankState();
    const [event] = act(s, 0, { kind: 'surrender' });
    expect(event).toEqual({ kind: 'surrender', actor: 0 });
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [1], reason: 'surrender' });
    expect(resultFor(s, 0)).toBe('lost');
  });

  it('una partida para mirar (sandbox) no acaba sola, aunque no quede nadie', () => {
    const s = blankState();
    s.mode = 'sandbox';
    takeHeadquarters(s, 0);
    takeHeadquarters(s, 1);
    expect(gameModeOf(s).victory).toEqual([]);
    expect(matchResult(s).status).toBe('playing');
  });

  it('mision: si su dueño falla el objetivo, ganan sus enemigos', () => {
    const s = buildMission(missionById('bridgehead')!, defaultContent(), BLANK_DICE_SEED);
    const objective = s.mission!.objective;
    if (objective.kind !== 'capture') throw new Error('bridgehead es de capturar');
    s.day = objective.days + 1;
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [1], reason: 'objective' });
  });
});
