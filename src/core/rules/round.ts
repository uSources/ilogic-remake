/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { unitTypeOf, buildingTypeOf } from '../gameContent';
import { MAX_LIFE } from '../data';
import type { Building, GameEvent, GameState, RoundReport, Unit } from '../model';
import type { RoundPhase, RoundReportPart, RoundStage } from '../ruleModules/hooks';
import { hooksOf, inStageOrder } from '../ruleModules/ruleset';
import { addForTeam, perTeam, teamIds } from '../teams';
import { earn } from './funds';
import { restoreInvariants } from './invariants';
import { quietly } from '../util/quietly';
import { buildingIncome } from './economy';
import { unitAt } from './queries';
import { readyUnit } from './unitTurn';
import { sampleArmy } from '../stats';

/** [CAMBIO] La unidad no se curara al acabar el dia (sin cura bajo fuego: ver `healingBlocks` de los modulos). */
export function unhealable(s: GameState, unit: Unit): boolean {
  return hooksOf(s, 'healingBlocks').some((block) => block.blocks(s, unit));
}

/** Todas las unidades pueden volver a moverse y disparar (lo de la ronda anterior ya no se deshace: INVARIANTS). */
function refreshUnits(s: GameState): GameEvent[] {
  for (const unit of s.units) readyUnit(unit);
  return [];
}

/** La unidad propia que esta encima del edificio y que este cura (units.json, "repairedAt"), si la hay. */
function patientOn(s: GameState, building: Building): Unit | null {
  const unit = unitAt(s, building);
  if (!unit || unit.team !== building.owner || !unitTypeOf(s, unit).repairedAt.includes(buildingTypeOf(s, building).id)) return null;
  return unhealable(s, unit) ? null : unit;
}

/** El edificio cura a la unidad propia que tenga encima: su suceso, si ha recuperado algo. */
function healOnBuilding(s: GameState, building: Building): GameEvent[] {
  const patient = patientOn(s, building);
  if (!patient) return [];
  const before = patient.life;
  patient.life = Math.min(MAX_LIFE, patient.life + buildingTypeOf(s, building).heals);
  const amount = patient.life - before;
  return amount > 0 ? [{ kind: 'heal', actor: null, uid: patient.uid, team: patient.team, amount }] : [];
}

/** Cada edificio con dueño le paga y cura a la unidad propia que tenga encima. */
function collectAndHeal(s: GameState): GameEvent[] {
  const heals: GameEvent[] = [];
  const income = perTeam(s, () => 0);
  for (const building of s.buildings) {
    if (building.owner === null) continue;
    const earned = buildingIncome(s, buildingTypeOf(s, building));
    earn(s, building.owner, earned);
    addForTeam(income, building.owner, earned);
    heals.push(...healOnBuilding(s, building));
  }
  const incomes = teamIds(s)
    .filter((team) => income[team])
    .map((team): GameEvent => ({ kind: 'income', actor: null, team, amount: income[team] ?? 0, source: 'buildings' }));
  return [...incomes, ...heals];
}

/** Empieza el dia siguiente (lo que pase del maximo de dinero se pierde despues: INVARIANTS). */
function nextDay(s: GameState): GameEvent[] {
  s.day++;
  return [{ kind: 'newDay', actor: null, day: s.day }];
}

/** Los momentos del fin de ronda, en orden: el orden importa (se paga despues de cobrar, el clima cambia con el dia nuevo). */
export const ROUND_STAGES: readonly RoundStage[] = ['start', 'income', 'costs', 'newDay', 'record'];

/**
 * Los pasos del fin de ronda de cualquier partida, cada uno en su momento. Lo que depende de la
 * partida (generales, puntos de control, mantenimiento, clima) lo aportan sus modulos de reglas
 * (`roundPhasesOf`). Un sistema nuevo que actua cada ronda (moral, suministro...) es un paso de su
 * modulo, en el momento que le toque.
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  // Las unidades vuelven a poder actuar en la ronda nueva.
  { id: 'refresh', stage: 'start', run: refreshUnits },
  // Ingresos de los edificios y cura de las unidades propias encima.
  { id: 'buildings', stage: 'income', run: collectAndHeal },
  { id: 'day', stage: 'newDay', run: nextDay },
  // Con el dia ya empezado: el valor del ejercito de cada equipo ese dia (la grafica del final).
  { id: 'army', stage: 'record', run: quietly(sampleArmy) },
];

/**
 * Los pasos del fin de ronda de esta partida, en orden: por momento (ROUND_STAGES) y, en cada uno,
 * los de siempre y luego los de sus modulos (en el orden de RULE_MODULES; sort es estable).
 */
export function roundPhasesOf(s: GameState): RoundPhase[] {
  return inStageOrder(ROUND_STAGES, ROUND_PHASES, hooksOf(s, 'roundPhases'));
}

/**
 * Fin de ronda, tras el turno del ultimo equipo (ciclojuego, fase 2): reactivar unidades, cobrar y curar
 * sobre edificios propios (ver ROUND_PHASES). Devuelve sus sucesos, sin actor (los hace la partida).
 * [CAMBIO] sin combustible ni municion: ya no hay repostaje ni aviones que caen.
 */
export function endRound(s: GameState): GameEvent[] {
  const events = roundPhasesOf(s).flatMap((phase) => phase.run(s));
  // Al final, con todo ya cobrado y pagado, lo mismo que tras cada accion (el tope de dinero, el
  // deshacer de la ronda que acaba, capturas cuya unidad se ha ido...).
  return [...events, ...restoreInvariants(s, null)];
}

/**
 * Lo que va en el resumen de cualquier ronda: lo cobrado y lo curado. Lo de los modulos (el
 * mantenimiento, los puntos de control, el clima) lo apuntan sus `roundReportParts`.
 */
export const ROUND_REPORT_PARTS: readonly RoundReportPart[] = [
  {
    id: 'income',
    add: (_s, report, event) => {
      if (event.kind === 'income') addForTeam(report.income, event.team, event.amount);
    },
  },
  {
    id: 'healed',
    add: (_s, report, event) => {
      if (event.kind === 'heal') report.healed.push({ uid: event.uid, team: event.team, amount: event.amount });
    },
  },
];

/** El resumen de una ronda para enseñarlo (ver RoundReport), sacado de los sucesos de endRound por sus partes. */
export function roundReport(s: GameState, events: readonly GameEvent[]): RoundReport {
  const report: RoundReport = { income: perTeam(s, () => 0), healed: [] };
  const parts = [...ROUND_REPORT_PARTS, ...hooksOf(s, 'roundReportParts')];
  for (const event of events) for (const part of parts) part.add(s, report, event);
  return report;
}
