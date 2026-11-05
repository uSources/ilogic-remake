/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { unitTypeOf, buildingTypeOf, weatherTypeOf } from '../gameContent';
import { MAX_LIFE } from '../data';
import { generalsNewRound } from '../generals';
import { advanceWeather, type WeatherChange } from '../weather';
import type { Building, GameEvent, GameState, TeamId, Unit } from '../model';
import { addForTeam, perTeam, teamIds } from '../teams';
import { earn, pay } from './funds';
import { restoreInvariants } from './invariants';
import { quietly } from '../util/quietly';
import { controlRound, type ControlReport } from './control';
import { buildingIncome, upkeepOf } from './economy';
import { unitAt } from './queries';
import { readyUnit } from './unitTurn';

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

/** [CAMBIO] La unidad no se curara al acabar el dia: ha recibido un ataque hoy (regla noHealUnderFire). */
export function unhealable(s: GameState, unit: Unit): boolean {
  return s.rules.noHealUnderFire && unit.hitDay === s.day;
}

/** Un paso del fin de ronda: cambia el estado y devuelve sus sucesos (los que tenga). */
export interface RoundPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  run(s: GameState): GameEvent[];
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
  // [CAMBIO] Sin cura bajo fuego: quien ha recibido un ataque hoy no se recupera esta noche.
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

/** [CAMBIO] Mantenimiento. Sin dinero no hay castigo: se paga lo que haya. */
function payUpkeep(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const team of teamIds(s)) {
    const paid = pay(s, team, upkeepOf(s, team));
    if (paid > 0) events.push({ kind: 'upkeep', actor: null, team, amount: paid });
  }
  return events;
}

/** Empieza el dia siguiente (lo que pase del maximo de dinero se pierde despues: INVARIANTS). */
function nextDay(s: GameState): GameEvent[] {
  s.day++;
  return [{ kind: 'newDay', actor: null, day: s.day }];
}

function changeWeather(s: GameState): GameEvent[] {
  const change = advanceWeather(s);
  return change ? [{ kind: 'weather', actor: null, from: change.from.id, to: change.to.id }] : [];
}

/**
 * Pasos del fin de ronda, en orden. Un sistema nuevo que actua cada ronda (moral, suministro...)
 * es un paso mas aqui, en su sitio: el orden importa (p. ej. el mantenimiento se paga despues de
 * cobrar, y el clima cambia con el dia nuevo).
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  // Las unidades vuelven a poder actuar en la ronda nueva.
  { id: 'refresh', run: refreshUnits },
  // Los generales pueden volver a usar un poder y se acaba el reconocimiento.
  { id: 'generals', run: quietly(generalsNewRound) },
  // Ingresos de los edificios y cura de las unidades propias encima.
  { id: 'buildings', run: collectAndHeal },
  // Los puntos de control pagan despues de los edificios (se suman al mismo ingreso).
  { id: 'control', run: controlRound },
  // Despues de cobrar, para que se pague con lo de hoy.
  { id: 'upkeep', run: payUpkeep },
  { id: 'day', run: nextDay },
  // El clima cambia con el dia nuevo (depende de s.day).
  { id: 'weather', run: changeWeather },
];

/**
 * Fin de ronda, tras el turno del ultimo equipo (ciclojuego, fase 2): reactivar unidades, cobrar y curar
 * sobre edificios propios (ver ROUND_PHASES). Devuelve sus sucesos, sin actor (los hace la partida).
 * [CAMBIO] sin combustible ni municion: ya no hay repostaje ni aviones que caen.
 */
export function endRound(s: GameState): GameEvent[] {
  const events = ROUND_PHASES.flatMap((phase) => phase.run(s));
  // Al final, con todo ya cobrado y pagado, lo mismo que tras cada accion (el tope de dinero, el
  // deshacer de la ronda que acaba, capturas cuya unidad se ha ido...).
  return [...events, ...restoreInvariants(s)];
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
