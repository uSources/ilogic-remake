/**
 * Fin de ronda (ciclojuego, fase 2): reactivar unidades, cobrar, curar, mantenimiento, dia y clima.
 */
import { BUILDING, HEALER, MAX_FUNDS, MAX_LIFE, RULES } from '../data';
import { generalsNewRound } from '../generals';
import { advanceWeather, type WeatherChange } from '../weather';
import { TEAMS, type GameState, type Team, type Unit } from '../types';
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
export function unhealable(s: GameState, u: Unit): boolean {
  return RULES.noHealUnderFire && u.hitDay === s.day;
}

/** Un paso del fin de ronda: cambia el estado y apunta en el informe lo que la interfaz enseña. */
export interface RoundPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  run(s: GameState, report: RoundReport): void;
}

/**
 * Pasos del fin de ronda, en orden. Un sistema nuevo que actua cada ronda (moral, suministro...)
 * es un paso mas aqui, en su sitio: el orden importa (p. ej. el mantenimiento se paga despues de
 * cobrar, y el clima cambia con el dia nuevo).
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  // Las capturas a medias que ya no valen se pierden.
  { id: 'captures', run: (s) => dropStaleCaptures(s) },
  {
    id: 'refresh',
    run: (s) => {
      for (const u of s.units) {
        u.active = true;
        u.canMove = true;
        u.canFire = true;
      }
    },
  },
  { id: 'generals', run: (s) => generalsNewRound(s) },
  // Ingresos de los edificios y cura de las unidades propias encima.
  {
    id: 'buildings',
    run: (s, report) => {
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
    },
  },
  {
    id: 'control',
    run: (s, report) => {
      const control = controlRound(s);
      if (!control) return;
      report.control = control;
      for (const team of TEAMS) report.income[team] += control.income[team];
    },
  },
  {
    id: 'upkeep',
    run: (s, report) => {
      for (const team of TEAMS) {
        // [CAMBIO] Mantenimiento despues de cobrar. Sin dinero no hay castigo: se paga lo que haya.
        const paid = Math.min(upkeepOf(s, team), s.funds[team]);
        s.funds[team] -= paid;
        report.upkeep[team] = paid;
      }
    },
  },
  {
    id: 'day',
    run: (s) => {
      s.funds = [Math.min(s.funds[0], MAX_FUNDS), Math.min(s.funds[1], MAX_FUNDS)];
      s.day++;
    },
  },
  {
    id: 'weather',
    run: (s, report) => {
      report.weather = advanceWeather(s);
    },
  },
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
