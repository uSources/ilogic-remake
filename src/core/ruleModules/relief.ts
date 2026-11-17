/**
 * [CAMBIO] El relieve: toda partida tiene alturas (core/elevation.ts), con o sin la regla de
 * elevacion, porque las montañas son lo alto del mapa y se ven como tal. Lo que la altura cambia en
 * el juego (acierto, vision, subir) solo va con el ajuste `elevation` (ruleModules/elevation.ts).
 */
import { elevationFor } from '../elevation';
import type { RuleModule } from './hooks';

export const RELIEF: RuleModule = {
  id: 'relief',
  isOn: () => true,
  hooks: {
    matchSetup: [
      {
        id: 'relief',
        run: (s) => {
          s.elevation = elevationFor(s);
        },
      },
    ],
  },
};
