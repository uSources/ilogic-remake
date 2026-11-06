/** [CAMBIO] El clima (ajuste `weather`; core/weather.ts) se enchufa a las reglas desde aqui. */
import { weatherHit } from '../weather';
import type { RuleModule } from './hooks';

export const WEATHER: RuleModule = {
  id: 'weather',
  isOn: (settings) => settings.weather,
  hooks: {
    // Con lluvia o tormenta se apunta peor (igual para los dos equipos).
    hitModifiers: [{ id: 'weather', factor: (s) => weatherHit(s) }],
  },
};
