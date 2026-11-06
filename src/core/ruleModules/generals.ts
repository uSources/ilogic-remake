/**
 * [CAMBIO] Los generales (core/generals.ts) se enchufan a las reglas desde aqui: su ventaja fija en el
 * acierto y lo que hacen al empezar cada ronda. Siempre esta: que un equipo tenga general lo dice su `TeamState`, no los ajustes.
 */
import { generalHitFactor, generalsNewRound } from '../generals';
import { quietly } from '../util/quietly';
import type { RuleModule } from './hooks';

export const GENERALS: RuleModule = {
  id: 'generals',
  isOn: () => true,
  hooks: {
    // La ventaja fija de cada general (ataque de uno, defensa del otro).
    hitModifiers: [{ id: 'generals', factor: generalHitFactor }],
    // Al empezar la ronda pueden volver a usar un poder y se acaba el reconocimiento.
    roundPhases: [{ id: 'generals', stage: 'start', run: quietly(generalsNewRound) }],
  },
};
