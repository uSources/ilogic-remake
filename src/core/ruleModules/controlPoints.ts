/**
 * [CAMBIO] Puntos de control (ajuste `controlPoints`, cuantos pone el generador de mapas; las reglas
 * en rules/control.ts): pagan al acabar cada ronda a quien los tiene sin disputa.
 */
import type { GameEvent, GameState } from '../model';
import { controlRound } from '../rules/control';
import type { ControlReport, RoundReport } from '../rules/roundReport';
import { addForTeam, perTeam } from '../teams';
import type { RuleModule } from './hooks';

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
