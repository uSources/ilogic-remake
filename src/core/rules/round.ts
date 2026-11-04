/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { tablesOf } from '../gameContent';
import { MAX_LIFE } from '../data';
import { generalsNewRound } from '../generals';
import { advanceWeather, type WeatherChange } from '../weather';
import type { Building, GameState, Team, Unit } from '../model';
import { TEAMS } from '../util/predicates';
import { dropStaleCaptures } from './capture';
import { controlRound, type ControlReport } from './control';
import { buildingIncome, upkeepOf } from './economy';
import { unitAt } from './queries';

export interface RoundReport {
  income: [number, number];
  /** Mantenimiento pagado por cada bando (si no llega el dinero, se paga lo que hay). */
  upkeep: [number, number];
  /** Unidades curadas en un edificio propio (uid, bando, vida recuperada). */
  healed: { uid: number; team: Team; amount: number }[];
  /** [CAMBIO] Cambio de clima al empezar esta ronda (null si sigue igual o no hay clima). */
  weather?: WeatherChange | null;
  /** [CAMBIO] Puntos de control: dinero que ha dado a cada bando (ya sumado en income), cuantos le han pagado y cuantos estan disputados. */
  control?: ControlReport;
}

/** [CAMBIO] La unidad no se curara al acabar el dia: ha recibido un ataque hoy (regla noHealUnderFire). */
export function unhealable(s: GameState, unit: Unit): boolean {
  return s.rules.noHealUnderFire && unit.hitDay === s.day;
}

/** Un paso del fin de ronda: cambia el estado y apunta en el informe lo que la interfaz enseña. */
export interface RoundPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  run(s: GameState, report: RoundReport): void;
}

/** Todas las unidades pueden volver a moverse y disparar. */
function refreshUnits(s: GameState): void {
  for (const unit of s.units) {
    unit.active = true;
    unit.canMove = true;
    unit.canFire = true;
  }
}

/** La unidad propia que esta encima del edificio y que este cura (units.json, "repairedAt"), si la hay. */
function patientOn(s: GameState, building: Building): Unit | null {
  const unit = unitAt(s, building);
  if (!unit || unit.team !== building.owner || !tablesOf(s).HEALER[unit.type]![building.type]) return null;
  // [CAMBIO] Sin cura bajo fuego: quien ha recibido un ataque hoy no se recupera esta noche.
  return unhealable(s, unit) ? null : unit;
}

function healOnBuilding(s: GameState, building: Building, report: RoundReport): void {
  const patient = patientOn(s, building);
  if (!patient) return;
  const before = patient.life;
  patient.life = Math.min(MAX_LIFE, patient.life + tablesOf(s).BUILDING.heals[building.type]!);
  if (patient.life > before) report.healed.push({ uid: patient.uid, team: patient.team, amount: patient.life - before });
}

/** Cada edificio con dueño le paga y cura a la unidad propia que tenga encima. */
function collectAndHeal(s: GameState, report: RoundReport): void {
  for (const building of s.buildings) {
    if (building.owner === null) continue;
    s.funds[building.owner] += buildingIncome(s, building.type);
    report.income[building.owner] += buildingIncome(s, building.type);
    healOnBuilding(s, building, report);
  }
}

function payControlPoints(s: GameState, report: RoundReport): void {
  const control = controlRound(s);
  if (!control) return;
  report.control = control;
  for (const team of TEAMS) report.income[team] += control.income[team];
}

/** [CAMBIO] Mantenimiento. Sin dinero no hay castigo: se paga lo que haya. */
function payUpkeep(s: GameState, report: RoundReport): void {
  for (const team of TEAMS) {
    const paid = Math.min(upkeepOf(s, team), s.funds[team]);
    s.funds[team] -= paid;
    report.upkeep[team] = paid;
  }
}

/** Empieza el dia siguiente; lo que pase del maximo de dinero se pierde. */
function nextDay(s: GameState): void {
  s.funds = [Math.min(s.funds[0], tablesOf(s).MAX_FUNDS), Math.min(s.funds[1], tablesOf(s).MAX_FUNDS)];
  s.day++;
}

function changeWeather(s: GameState, report: RoundReport): void {
  report.weather = advanceWeather(s);
}

/**
 * Pasos del fin de ronda, en orden. Un sistema nuevo que actua cada ronda (moral, suministro...)
 * es un paso mas aqui, en su sitio: el orden importa (p. ej. el mantenimiento se paga despues de
 * cobrar, y el clima cambia con el dia nuevo).
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  // Antes de nada: una captura a medias cuya unidad se ha ido no debe seguir contando.
  { id: 'captures', run: (s) => dropStaleCaptures(s) },
  // Las unidades vuelven a poder actuar en la ronda nueva.
  { id: 'refresh', run: refreshUnits },
  // Los generales pueden volver a usar una habilidad y se acaba el reconocimiento.
  { id: 'generals', run: (s) => generalsNewRound(s) },
  // Ingresos de los edificios y cura de las unidades propias encima.
  { id: 'buildings', run: collectAndHeal },
  // Los puntos de control pagan despues de los edificios (se suman al mismo ingreso).
  { id: 'control', run: payControlPoints },
  // Despues de cobrar, para que se pague con lo de hoy.
  { id: 'upkeep', run: payUpkeep },
  // El tope de dinero se aplica al final, con todo ya cobrado y pagado.
  { id: 'day', run: nextDay },
  // El clima cambia con el dia nuevo (depende de s.day).
  { id: 'weather', run: changeWeather },
];

/**
 * Mantenimiento tras el turno de la IA (ciclojuego, fase 2): reactivar unidades, cobrar y curar
 * sobre edificios propios (ver ROUND_PHASES).
 * [CAMBIO] sin combustible ni municion: ya no hay repostaje ni aviones que caen.
 */
export function endRound(s: GameState): RoundReport {
  const report: RoundReport = { income: [0, 0], upkeep: [0, 0], healed: [] };
  for (const phase of ROUND_PHASES) phase.run(s, report);
  return report;
}
