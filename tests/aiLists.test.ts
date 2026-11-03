import { describe, expect, it } from 'vitest';
import { ATTACK_SCORE_TERMS } from '@core/ai/scoring';
import { UNIT_BEHAVIOURS } from '@core/ai/unitTurn';

/**
 * Las listas de la IA deciden por su orden: el primer comportamiento que usa la unidad gana, y los
 * terminos del valor de un ataque se suman de arriba abajo (otro orden cambia el redondeo). Cambiar
 * el orden cambia como juega la IA, asi que tiene que ser a proposito (y con la huella nueva).
 */
describe('listas de la IA', () => {
  it('prioridades de cada unidad, en su orden', () => {
    expect(UNIT_BEHAVIOURS.map((behaviour) => behaviour.id)).toEqual([
      'finishCapture',
      'stepOffEnemyHq',
      'retreat',
      'attack',
      'capture',
      'advance',
      'randomMove',
    ]);
  });

  it('terminos del valor de un ataque, en su orden', () => {
    expect(ATTACK_SCORE_TERMS.map((term) => term.id)).toEqual(['damage', 'kill', 'counterattack', 'hqDefender', 'stopCapture']);
  });
});
