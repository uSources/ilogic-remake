/** Sin niebla de guerra (ajuste `fog` quitado): todos los equipos ven todo el mapa. */
import type { RuleModule } from './hooks';

export const NO_FOG: RuleModule = {
  id: 'noFog',
  isOn: (settings) => !settings.fog,
  hooks: { revealRules: [{ id: 'noFog', revealsAll: () => true }] },
};
