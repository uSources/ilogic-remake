/**
 * [CAMBIO] Los generales (core/generals.ts) se enchufan a las reglas desde aqui: su ventaja fija en el
 * acierto. Siempre esta: que un equipo tenga general lo dice su `TeamState`, no los ajustes.
 */
import { generalHitFactor } from '../generals';
import type { RuleModule } from './hooks';

export const GENERALS: RuleModule = {
  id: 'generals',
  isOn: () => true,
  hooks: {
    // La ventaja fija de cada general (ataque de uno, defensa del otro).
    hitModifiers: [{ id: 'generals', factor: generalHitFactor }],
  },
};
