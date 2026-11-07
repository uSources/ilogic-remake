/**
 * [CAMBIO] Puntos de control (ajuste `controlPoints`, cuantos pone el generador de mapas; las reglas
 * en rules/control.ts): pagan al acabar cada ronda a quien los tiene sin disputa.
 */
import type { GameEvent, GameState, RoundReport } from '../model';
import { controlRound } from '../rules/control';
import { addForTeam, perTeam } from '../teams';
import type { RuleModule } from './hooks';

/** Lo que han dado los puntos de control en una ronda (su parte del resumen, `control`). */
export interface ControlReport {
  /** Dinero que ha dado a cada equipo, por numero de equipo (ya sumado en RoundReport.income). */
  income: number[];
  /** Cuantos puntos le han pagado a cada equipo. */
  held: number[];
  /** Cuantos estan disputados (no pagan a nadie). */
  contested: number;
}

declare module '../model/roundReport' {
  interface RoundReportParts {
    /** [CAMBIO] Puntos de control: lo que han pagado, a quien y cuantos estan disputados. */
    control: ControlReport;
  }
}

/** El resumen de los puntos de control de la ronda (lo crea al primer suceso suyo). */
function controlOf(s: GameState, report: RoundReport): ControlReport {
  report.control ??= { income: perTeam(s, () => 0), held: perTeam(s, () => 0), contested: 0 };
  return report.control;
}

/** Lo de los puntos de control en el resumen: lo que han pagado y cuantos tiene cada uno o estan disputados. */
function addToReport(s: GameState, report: RoundReport, event: GameEvent): void {
  if (event.kind === 'income' && event.source === 'controlPoints') addForTeam(controlOf(s, report).income, event.team, event.amount);
  if (event.kind !== 'controlPoint') return;
  // Solo paga el que no esta disputado y tiene dueño.
  const control = controlOf(s, report);
  if (event.contested) control.contested++;
  else if (event.owner !== null) addForTeam(control.held, event.owner, 1);
}

export const CONTROL_POINTS: RuleModule = {
  id: 'controlPoints',
  isOn: (settings) => settings.controlPoints > 0,
  hooks: {
    // Pagan despues de los edificios (se suman al mismo ingreso).
    roundPhases: [{ id: 'control', stage: 'income', run: controlRound }],
    roundReportParts: [{ id: 'control', add: addToReport }],
  },
};
