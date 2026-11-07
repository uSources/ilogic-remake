/** [CAMBIO] El clima (ajuste `weather`; core/weather.ts) se enchufa a las reglas desde aqui. */
import { weatherTypeOf } from '../gameContent';
import type { GameEvent, GameState } from '../model';
import { advanceWeather, ensureWeather, weatherHit, weatherMove, weatherVision, type WeatherChange } from '../weather';
import type { RuleModule } from './hooks';

declare module '../model/roundReport' {
  interface RoundReportParts {
    /** [CAMBIO] Cambio de clima al empezar esta ronda (si no ha cambiado, no esta). */
    weather: WeatherChange;
  }
}

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
    // Con mal tiempo se avanza menos (nunca por debajo de 1 si la unidad se mueve).
    moveBudgets: [
      { id: 'weather', budget: (s, unitType, budget) => (budget > 0 ? Math.max(1, budget + weatherMove(s, unitType.movement)) : budget) },
    ],
    // Con mal tiempo se ve menos (nunca por debajo de 1 si la unidad ve algo).
    visionRadius: [{ id: 'weather', radius: (s, _unit, radius) => (radius > 0 ? Math.max(1, radius + weatherVision(s)) : radius) }],
    // El clima cambia con el dia nuevo (depende de s.day).
    roundPhases: [{ id: 'weather', stage: 'newDay', run: changeWeather }],
    roundReportParts: [
      {
        id: 'weather',
        add: (s, report, event) => {
          if (event.kind === 'weather') report.weather = { from: weatherTypeOf(s, event.from), to: weatherTypeOf(s, event.to) };
        },
      },
    ],
    // Empieza despejado, con su pronostico.
    matchSetup: [{ id: 'weather', run: ensureWeather }],
  },
};
