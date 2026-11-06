/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { unitTypeOf, buildingTypeOf, weatherTypeOf } from '../gameContent';
import { MAX_LIFE } from '../data';
import type { WeatherChange } from '../weather';
import type { Building, GameEvent, GameState, TeamId, Unit } from '../model';
import type { RoundPhase, RoundStage } from '../ruleModules/hooks';
import { hooksOf } from '../ruleModules/registry';
import { addForTeam, perTeam, teamIds } from '../teams';
import { earn } from './funds';
import { restoreInvariants } from './invariants';
import { quietly } from '../util/quietly';
import type { ControlReport } from './control';
import { buildingIncome } from './economy';
import { unitAt } from './queries';
import { readyUnit } from './unitTurn';
import { sampleArmy } from '../stats';

export interface RoundReport {
  /** Lo que ha cobrado cada equipo, por numero de equipo. */
  income: number[];
  /** Mantenimiento pagado por cada equipo (si no llega el dinero, se paga lo que hay). */
  upkeep: number[];
  /** Unidades curadas en un edificio propio (uid, equipo, vida recuperada). */
  healed: { uid: number; team: TeamId; amount: number }[];
  /** [CAMBIO] Cambio de clima al empezar esta ronda (null si sigue igual o no hay clima). */
  weather?: WeatherChange | null;
  /**
   * [CAMBIO] Puntos de control: dinero que ha dado a cada equipo (ya sumado en income), cuantos le
   * han pagado y cuantos estan disputados.
   */
  control?: ControlReport;
}

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
  const order = (phase: RoundPhase) => ROUND_STAGES.indexOf(phase.stage);
  return [...ROUND_PHASES, ...hooksOf(s, 'roundPhases')].sort((first, second) => order(first) - order(second));
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

/** El resumen de una ronda para enseñarlo (ver RoundReport), sacado de los sucesos de endRound. */
export function roundReport(s: GameState, events: readonly GameEvent[]): RoundReport {
  const report: RoundReport = { income: perTeam(s, () => 0), upkeep: perTeam(s, () => 0), healed: [] };
  for (const event of events) addToReport(s, report, event);
  return report;
}

/** Apunta un suceso del fin de ronda en su resumen. */
function addToReport(s: GameState, report: RoundReport, event: GameEvent): void {
  switch (event.kind) {
    case 'income':
      addForTeam(report.income, event.team, event.amount);
      if (event.source === 'controlPoints') addForTeam(controlOf(s, report).income, event.team, event.amount);
      return;
    case 'upkeep':
      report.upkeep[event.team] = event.amount;
      return;
    case 'heal':
      report.healed.push({ uid: event.uid, team: event.team, amount: event.amount });
      return;
    case 'controlPoint': {
      // Solo paga el que no esta disputado y tiene dueño.
      const control = controlOf(s, report);
      if (event.contested) control.contested++;
      else if (event.owner !== null) addForTeam(control.held, event.owner, 1);
      return;
    }
    case 'weather':
      report.weather = { from: weatherTypeOf(s, event.from), to: weatherTypeOf(s, event.to) };
      return;
    default:
      return;
  }
}

/** El resumen de los puntos de control de la ronda (lo crea al primer suceso suyo). */
function controlOf(s: GameState, report: RoundReport): ControlReport {
  report.control ??= { income: perTeam(s, () => 0), held: perTeam(s, () => 0), contested: 0 };
  return report.control;
}
