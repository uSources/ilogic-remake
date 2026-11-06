/** [CAMBIO] El clima (ajuste `weather`; core/weather.ts) se enchufa a las reglas desde aqui. */
import type { GameEvent, GameState } from '../model';
import { advanceWeather, ensureWeather, weatherHit } from '../weather';
import type { RuleModule } from './hooks';

/** Pasa un dia de clima: el suceso del cambio, si lo hay. */
function changeWeather(s: GameState): GameEvent[] {
  const change = advanceWeather(s);
  return change ? [{ kind: 'weather', actor: null, from: change.from.id, to: change.to.id }] : [];
}

export const WEATHER: RuleModule = {
  id: 'weather',
  isOn: (settings) => settings.weather,
  hooks: {
    // Con lluvia o tormenta se apunta peor (igual para los dos equipos).
    hitModifiers: [{ id: 'weather', factor: (s) => weatherHit(s) }],
    // El clima cambia con el dia nuevo (depende de s.day).
    roundPhases: [{ id: 'weather', stage: 'newDay', run: changeWeather }],
    // Empieza despejado, con su pronostico.
    matchSetup: [{ id: 'weather', run: ensureWeather }],
  },
};
