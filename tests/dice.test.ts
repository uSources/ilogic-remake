import { describe, expect, it } from 'vitest';
import { diceOf } from '@core/dice';
import { loadGame } from '@core/defaultGames';
import { serialize } from '@core/save';
import { isRandomState, randomStep, seedFromDraw, seededRng } from '@core/util/random';
import { act, blankState, unitTypeNamed } from './helpers';
import { newUnit } from '@core/measure';

describe('los dados de la partida', () => {
  it('cada tirada avanza su estado, que es un entero de 32 bits', () => {
    const s = blankState();
    const before = s.dice;
    const roll = diceOf(s).roll();
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(roll).toBeLessThan(1);
    expect(s.dice).not.toBe(before);
    expect(isRandomState(s.dice)).toBe(true);
  });

  it('van con la partida: guardada y cargada, sigue tirando lo mismo', () => {
    const s = blankState();
    diceOf(s).roll();
    const copy = loadGame(serialize(s))!;
    expect(diceOf(copy).roll()).toBe(diceOf(s).roll());
  });

  it('un combate tira de ellos: el mismo estado da el mismo combate', () => {
    const combatWithDice = (dice: number) => {
      const s = blankState();
      s.dice = dice;
      const attacker = newUnit(s, unitTypeNamed('Tank'), 0, { x: 5, y: 5 });
      const defender = newUnit(s, unitTypeNamed('Tank'), 1, { x: 6, y: 5 });
      return act(s, 0, { kind: 'attack', uid: attacker.uid, target: defender.uid });
    };
    expect(combatWithDice(7)).toEqual(combatWithDice(7));
  });
});

describe('util/random', () => {
  it('seededRng es mulberry32 paso a paso', () => {
    const rng = seededRng(42);
    const first = randomStep(42);
    expect(rng()).toBe(first.value);
    expect(rng()).toBe(randomStep(first.next).value);
  });

  it('seedFromDraw recupera los 32 bits de una tirada', () => {
    const draw = seededRng(9)();
    expect(seedFromDraw(draw) / 2 ** 32).toBe(draw);
  });
});
