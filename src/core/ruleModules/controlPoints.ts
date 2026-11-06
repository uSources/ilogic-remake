/**
 * [CAMBIO] Puntos de control (ajuste `controlPoints`, cuantos pone el generador de mapas; las reglas
 * en rules/control.ts): pagan al acabar cada ronda a quien los tiene sin disputa.
 */
import { controlRound } from '../rules/control';
import type { RuleModule } from './hooks';

export const CONTROL_POINTS: RuleModule = {
  id: 'controlPoints',
  isOn: (settings) => settings.controlPoints > 0,
  hooks: {
    // Pagan despues de los edificios (se suman al mismo ingreso).
    roundPhases: [{ id: 'control', stage: 'income', run: controlRound }],
  },
};
