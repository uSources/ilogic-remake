/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { BUILDING, HEALER, MAX_FUNDS, MAX_LIFE, RULES } from '../data';
import { generalsNewRound } from '../generals';
import { advanceWeather, type WeatherChange } from '../weather';
import type { GameState, Team, Unit } from '../types';
import { captureProgress } from './capture';
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
export function unhealable(s: GameState, u: Unit): boolean {
  return RULES.noHealUnderFire && u.hitDay === s.day;
}

/**
 * Mantenimiento tras el turno de la IA (ciclojuego, fase 2): reactivar unidades, cobrar y curar
 * sobre edificios propios.
 * [CAMBIO] sin combustible ni municion: ya no hay repostaje ni aviones que caen.
 */
export function endRound(s: GameState): RoundReport {
  const report: RoundReport = { income: [0, 0], upkeep: [0, 0], healed: [] };
  for (const b of s.buildings) captureProgress(s, b);
  for (const u of s.units) {
    u.active = true;
    u.canMove = true;
    u.canFire = true;
  }
  generalsNewRound(s);
  for (const b of s.buildings) {
    if (b.owner === null) continue;
    s.funds[b.owner] += buildingIncome(b.type);
    report.income[b.owner] += buildingIncome(b.type);
    const u = unitAt(s, b.x, b.y);
    if (!u || u.team !== b.owner || !HEALER[u.type]![b.type]) continue;
    // [CAMBIO] Sin cura bajo fuego: quien ha recibido un ataque hoy no se recupera esta noche.
    if (unhealable(s, u)) continue;
    const before = u.life;
    u.life = Math.min(MAX_LIFE, u.life + BUILDING.heals[b.type]!);
    if (u.life > before) report.healed.push({ uid: u.uid, team: u.team, amount: u.life - before });
  }
  const control = controlRound(s);
  if (control) {
    report.control = control;
    for (const team of [0, 1] as const) report.income[team] += control.income[team];
  }
  for (const team of [0, 1] as const) {
    // [CAMBIO] Mantenimiento despues de cobrar. Sin dinero no hay castigo: se paga lo que haya.
    const paid = Math.min(upkeepOf(s, team), s.funds[team]);
    s.funds[team] -= paid;
    report.upkeep[team] = paid;
  }
  s.funds = [Math.min(s.funds[0], MAX_FUNDS), Math.min(s.funds[1], MAX_FUNDS)];
  s.day++;
  report.weather = advanceWeather(s);
  return report;
}
