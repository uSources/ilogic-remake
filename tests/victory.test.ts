import { describe, expect, it } from 'vitest';
import { GAME_MODES, gameModeOf } from '@core/modes';
import { currentDefeat, isWinner, matchResult, newUnit, restoreInvariants, VICTORY_RULES } from '@core/rules';
import { buildMission, missionById } from '@core/missions';
import { defaultContent } from '@core/content/default';
import type { GameModeId, VictoryRuleId } from '@core/model';
import { act, blankState, BLANK_DICE_SEED, expectRejected, hqId, resultFor, unitTypeNamed } from './helpers';

/** Quita al equipo su Base (con eso ha perdido) y le deja una unidad: ha caido por la Base, no por quedarse sin nada. */
const takeHeadquarters = (s: ReturnType<typeof blankState>, team: number) => {
  s.buildings = s.buildings.filter((building) => !(building.owner === team && building.type === hqId()));
  newUnit(s, unitTypeNamed('Soldier'), team, { x: 1 + team, y: 10 });
  // Como tras una accion o una ronda: las INVARIANTS apuntan la caida (el resultado solo lee eso).
  restoreInvariants(s, null);
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

  it('el motivo es el de la caida que decide, no el de una de antes (dos personas y la IA)', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]);
    act(s, 0, { kind: 'surrender' });
    expect(s.teams[0]!.fell).toEqual({ order: 1, reason: 'surrender' });
    expect(matchResult(s).status).toBe('playing');
    // Despues, el 1 le captura la Base a la IA (la caida se apunta en la accion en que pasa).
    newUnit(s, unitTypeNamed('Soldier'), 2, { x: 8, y: 8 });
    const hq = s.buildings.find((building) => building.owner === 2 && building.type === hqId())!;
    const unit = newUnit(s, unitTypeNamed('Soldier'), 1, hq);
    hq.capture = { team: 1, uid: unit.uid, left: 1 };
    s.turn = 1;
    const events = act(s, 1, { kind: 'capture', uid: unit.uid });
    expect(events.at(-1)).toEqual({ kind: 'teamDefeated', actor: 1, team: 2, reason: 'hq' });
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [1], reason: 'hq' });
  });

  it('con dos personas, la que se rinde decide la partida: la otra gana por eso', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'human' }]);
    act(s, 0, { kind: 'surrender' });
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [1], reason: 'surrender' });
  });

  it('por que cae un equipo: rendirse, sin nada (antes que sin Base) o sin Base; en pie, null', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    expect(currentDefeat(s, 1)).toBeNull();
    s.buildings = s.buildings.filter((building) => building.owner !== 1);
    expect(currentDefeat(s, 1)).toBe('wipeout');
    newUnit(s, unitTypeNamed('Soldier'), 1, { x: 4, y: 4 });
    expect(currentDefeat(s, 1)).toBe('hq');
    act(s, 2, { kind: 'surrender' });
    expect(currentDefeat(s, 2)).toBe('surrender');
  });

  it('el resultado solo lee las caidas apuntadas: una partida cambiada sin las INVARIANTS es un fallo', () => {
    const s = blankState();
    s.buildings = s.buildings.filter((building) => !(building.owner === 1 && building.type === hqId()));
    expect(() => matchResult(s)).toThrow(/sin ninguna caida apuntada/);
  });

  it('rendirse no vale donde la partida no se puede perder (el laboratorio)', () => {
    const s = blankState();
    s.mode = 'sandbox';
    expectRejected(s, 0, { kind: 'surrender' }, 'cannotLose');
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
