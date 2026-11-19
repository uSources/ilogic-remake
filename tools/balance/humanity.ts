/**
 * Medidas de «humanidad» de la IA (docs/PLAN-IA.md, fase 0): lo que hace que juegue como una persona
 * o como una maquina, contado desde fuera mientras se juega la partida (sin tocar la IA):
 *
 * - **Unidades regaladas**: las que caen en el turno de otro equipo sin haber hecho nada util en su
 *   ultimo turno (ni atacar, ni capturar, ni acabar de llegar): se quedaron donde las mataron.
 * - **Cohesion**: al acabar su turno, a cuantas casillas queda cada unidad de su aliado mas cercano
 *   (menos, mas en grupo).
 * - **Vaivenes**: de los movimientos de una unidad, cuantos van en contra de su movimiento anterior
 *   (cambiar de idea de un turno a otro).
 * - **Tiempo por turno** de la IA (milisegundos, en esta maquina).
 */
import { isTurnBoundary } from '@core/actions';
import { manhattan } from '@core/geom';
import { isOnMap, teamUnits } from '@core/rules';
import { teamIds } from '@core/teams';
import type { GameEvent, GameState, Pos, TeamId } from '@core/model';
import type { ActedStep } from '@core/session';
import { mean, quantile, sum } from './numbers';

/** Lo contado de un equipo en una partida. */
export interface HumanityTally {
  /** Turnos jugados. */
  turns: number;
  /** Lo que tardo cada turno (ms). */
  turnMs: number[];
  /** Unidades perdidas en el turno de otro equipo, y de ellas las regaladas. */
  losses: number;
  gifted: number;
  /** Suma y cuantas muestras de la distancia media al aliado mas cercano (al acabar cada turno). */
  cohesionSum: number;
  cohesionSamples: number;
  /** Movimientos comparables (con uno anterior de la misma unidad) y de ellos, los que dan la vuelta. */
  moves: number;
  reversals: number;
}

export const emptyHumanity = (): HumanityTally => ({
  turns: 0,
  turnMs: [],
  losses: 0,
  gifted: 0,
  cohesionSum: 0,
  cohesionSamples: 0,
  moves: 0,
  reversals: 0,
});

/** Hacia donde se movio una unidad (de donde salio a donde llego). */
interface Step {
  dx: number;
  dy: number;
}

/** Lo que se cuenta mientras se juega (se engancha a la sesion con `record`). */
export class HumanityLog {
  readonly tallies: HumanityTally[];
  /** El equipo de cada unidad (de antes de cada paso: una unidad destruida ya no esta en la partida). */
  private readonly teamOf = new Map<number, TeamId>();
  /** Las unidades que han hecho algo util este turno, y las del ultimo turno de cada equipo. */
  private readonly usefulNow = new Set<number>();
  private readonly usefulLastTurn = new Map<TeamId, ReadonlySet<number>>();
  private readonly lastStep = new Map<number, Step>();
  private turnStarted = performance.now();

  constructor(private readonly s: GameState) {
    this.tallies = teamIds(s).map(emptyHumanity);
    this.rememberTeams();
  }

  private tallyOf(team: TeamId): HumanityTally {
    const tally = this.tallies[team];
    if (!tally) throw new Error(`Equipo desconocido en las medidas: ${team}`);
    return tally;
  }

  readonly record = (step: ActedStep): void => {
    for (const event of step.events) this.countEvent(event, step.team);
    if (isTurnBoundary(step.action)) this.endTurn(step.team);
    this.rememberTeams();
  };

  private rememberTeams(): void {
    for (const unit of this.s.units) this.teamOf.set(unit.uid, unit.team);
  }

  private countEvent(event: GameEvent, actingTeam: TeamId): void {
    if (event.kind === 'attack') this.countAttack(event.attacker, event.target, event.killed, actingTeam);
    if (event.kind === 'capture' || event.kind === 'spawn') this.usefulNow.add(event.uid);
    if (event.kind === 'move') this.countMove(event.uid, event.path);
  }

  private countAttack(attacker: number | null, target: number, killed: boolean, actingTeam: TeamId): void {
    if (attacker !== null) this.usefulNow.add(attacker);
    const victimTeam = this.teamOf.get(target);
    if (!killed || victimTeam === undefined || victimTeam === actingTeam) return;
    const tally = this.tallyOf(victimTeam);
    tally.losses++;
    if (!this.usefulLastTurn.get(victimTeam)?.has(target)) tally.gifted++;
  }

  /** Un movimiento: si va en contra del anterior de la misma unidad, es un vaiven. */
  private countMove(uid: number, path: readonly Pos[]): void {
    const from = path[0];
    const to = path[path.length - 1];
    const team = this.teamOf.get(uid);
    if (!from || !to || team === undefined || (from.x === to.x && from.y === to.y)) return;
    const step = { dx: to.x - from.x, dy: to.y - from.y };
    const before = this.lastStep.get(uid);
    this.lastStep.set(uid, step);
    if (!before) return;
    const tally = this.tallyOf(team);
    tally.moves++;
    if (before.dx * step.dx + before.dy * step.dy < 0) tally.reversals++;
  }

  /** Acaba el turno de `team`: su tiempo, su cohesion y lo que hizo cada unidad (para las regaladas). */
  private endTurn(team: TeamId): void {
    const tally = this.tallyOf(team);
    const now = performance.now();
    tally.turns++;
    tally.turnMs.push(now - this.turnStarted);
    this.turnStarted = now;
    const cohesion = cohesionOf(this.s, team);
    if (cohesion !== null) {
      tally.cohesionSum += cohesion;
      tally.cohesionSamples++;
    }
    this.usefulLastTurn.set(team, new Set(this.usefulNow));
    this.usefulNow.clear();
  }
}

/** A cuantas casillas queda, de media, cada unidad del equipo de su aliado mas cercano (null con menos de dos). */
function cohesionOf(s: GameState, team: TeamId): number | null {
  const units = teamUnits(s, team).filter(isOnMap);
  if (units.length < 2) return null;
  const nearest = units.map((unit) => Math.min(...units.filter((other) => other !== unit).map((other) => manhattan(unit, other))));
  return mean(nearest);
}

/** Las medidas de un perfil de IA en todas sus partidas (para el informe). */
export interface HumanityRow {
  profile: string;
  /** Cuantos equipos jugo en todas las partidas (con dos equipos del mismo perfil, dos por partida). */
  teams: number;
  /** Tiempo por turno: media y el 95 % (ms). */
  turnMsMean: number;
  turnMsP95: number;
  /** Unidades regaladas por equipo y partida, y que parte de las bajas son regaladas. */
  giftedPerTeam: number;
  giftedShare: number | null;
  /** Distancia media al aliado mas cercano (casillas). */
  cohesion: number | null;
  /** Parte de los movimientos que dan la vuelta. */
  reversalShare: number | null;
}

/** Lo de cada equipo de una partida con el perfil que lo jugo (para juntarlo por perfil). */
export interface ProfiledTally {
  profile: string;
  tally: HumanityTally;
}

const TURN_TIME_QUANTILE = 0.95;

const share = (part: number, whole: number): number | null => (whole ? part / whole : null);

/** Las medidas juntas de cada perfil (los equipos que no hacen nada, 'passive', no cuentan). */
export function humanityRowsOf(teams: readonly ProfiledTally[][]): HumanityRow[] {
  const byProfile = new Map<string, HumanityTally[]>();
  for (const game of teams)
    for (const { profile, tally } of game) {
      if (profile === 'passive') continue;
      byProfile.set(profile, [...(byProfile.get(profile) ?? []), tally]);
    }
  return [...byProfile].map(([profile, tallies]) => humanityRowOf(profile, tallies));
}

function humanityRowOf(profile: string, tallies: readonly HumanityTally[]): HumanityRow {
  const total = (field: 'losses' | 'gifted' | 'cohesionSum' | 'cohesionSamples' | 'moves' | 'reversals') =>
    sum(tallies.map((tally) => tally[field]));
  const turnMs = tallies.flatMap((tally) => tally.turnMs);
  return {
    profile,
    teams: tallies.length,
    turnMsMean: mean(turnMs),
    turnMsP95: quantile(turnMs, TURN_TIME_QUANTILE),
    giftedPerTeam: total('gifted') / tallies.length,
    giftedShare: share(total('gifted'), total('losses')),
    cohesion: share(total('cohesionSum'), total('cohesionSamples')),
    reversalShare: share(total('reversals'), total('moves')),
  };
}
