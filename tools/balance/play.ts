/** Una partida IA contra IA con todo lo que pasa apuntado (sin Phaser). */
import type { GameContent } from '@core/content';
import { seededRng } from '@core/util/random';
import { buildMatch, skirmishConfig } from '@core/match';
import { isTurnBoundary } from '@core/actions';
import { isMatchOver, isWinner, matchResult } from '@core/rules';
import { aiController } from '@core/controllers';
import { GameSession, passiveController, runMatch, type ActedStep, type Controller } from '@core/session';
import { duel, teamState } from '@core/teams';
import { unitTypeOf } from '@core/gameContent';
import { armyValue } from '@core/stats';
import type { EndReason, GameEvent, GameEventOf, GameState, Rng, MatchSettings, TeamId, Unit } from '@core/model';

export type Policy = 'ai' | 'passive';

/**
 * Los dos equipos de una partida de equilibrio: el primero (0) y el segundo (1) del mapa al azar.
 * Las tablas del informe van por estos dos lados.
 */
export type Side = 0 | 1;
/** El primer equipo del mapa (el que en el juego seria la persona) y el segundo. */
export const FIRST_SIDE: Side = 0;
export const SECOND_SIDE: Side = 1;
export const SIDES: readonly Side[] = [FIRST_SIDE, SECOND_SIDE];

/** El lado de un equipo de estas partidas (solo hay dos: otro numero es un fallo). */
export function sideOfTeam(team: TeamId): Side {
  if (team === FIRST_SIDE || team === SECOND_SIDE) return team;
  throw new Error(`Las partidas de equilibrio son de dos equipos: no hay equipo ${team}`);
}

/** El otro lado. */
export const opponentOf = (side: Side): Side => (side === FIRST_SIDE ? SECOND_SIDE : FIRST_SIDE);

export interface PlayOptions {
  seed: number;
  maxDays: number;
  /** Quien juega cada lado. 'passive' no hace nada (para medir a la IA). */
  policies: [Policy, Policy];
  /** Equipo que mueve primero en cada ronda (en el juego, el de la persona: el primero). */
  firstTeam?: Side;
  /** Intercambiar los lados en el mapa generado (para ver si el mapa favorece a un lado). */
  swapSides?: boolean;
  /** Lado del mapa (32 por defecto). */
  size?: number;
  /** Reglas de la partida. */
  settings: MatchSettings;
  /** Contenido con el que se juega (el de una variante, o el del juego). */
  content: GameContent;
}

/** Por tipo de unidad y bando. */
export interface UnitTally {
  bought: number;
  spent: number;
  /** Puntos de vida quitados al enemigo. */
  damageDealt: number;
  /** Valor destruido: vida quitada x coste del objetivo / 100. */
  valueDealt: number;
  /** Valor perdido por las unidades de este tipo (vida perdida x coste propio / 100). */
  valueLost: number;
  kills: number;
  deaths: number;
  attacks: number;
  captures: number;
}

export interface DaySample {
  day: number;
  funds: [number, number];
  buildings: [number, number];
  /** Valor del ejercito: coste x vida/100. */
  army: [number, number];
  /** Unidades en el mapa (informes antiguos: no esta). */
  units?: [number, number];
}

export interface GameRecord {
  seed: number;
  winner: Side | null;
  /** Por que acabo; 'timeout' si se llego a `maxDays` sin acabar (entonces `winner` es null). */
  reason: EndReason | 'timeout';
  days: number;
  samples: DaySample[];
  /** Lo de cada tipo de unidad, por lado y por id de tipo. */
  units: Record<string, UnitTally>[];
  events: number;
}

const emptyTally = (): UnitTally => ({
  bought: 0,
  spent: 0,
  damageDealt: 0,
  valueDealt: 0,
  valueLost: 0,
  kills: 0,
  deaths: 0,
  attacks: 0,
  captures: 0,
});

const costOf = (s: GameState, unit: Pick<Unit, 'type'>): number => unitTypeOf(s, unit).cost;

/** Un valor por lado: [primero, segundo]. */
const bySide = (valueOf: (side: Side) => number): [number, number] => [valueOf(FIRST_SIDE), valueOf(SECOND_SIDE)];

function sample(s: GameState): DaySample {
  const unitsOf = (side: Side) => s.units.filter((unit) => unit.team === side);
  const army = (side: Side) => armyValue(s, side);
  const buildings = (side: Side) => s.buildings.filter((building) => building.owner === side).length;
  return {
    day: s.day,
    funds: bySide((side) => teamState(s, side).funds),
    buildings: bySide(buildings),
    army: bySide(army),
    units: bySide((side) => unitsOf(side).length),
  };
}

/** Lo que hace falta para apuntar un suceso: como estaba cada unidad antes y lo de cada tipo y lado. */
interface Tallies {
  known: ReadonlyMap<number, Pick<Unit, 'type' | 'team' | 'x' | 'y' | 'life'>>;
  tallyOf(side: Side, unit: Pick<Unit, 'type'>): UnitTally;
}

/** Apunta un ataque: daño, valor y bajas de los dos lados (con el contraataque, si lo hubo). */
function tallyAttack(s: GameState, event: GameEventOf<'attack'>, team: TeamId, { known, tallyOf }: Tallies): void {
  const attacker = known.get(event.attacker);
  const victimInfo = known.get(event.target);
  if (!attacker) return;
  const tally = tallyOf(sideOfTeam(team), attacker);
  tally.attacks++;
  tally.damageDealt += event.damage;
  if (!victimInfo) return;
  const victimTally = tallyOf(sideOfTeam(victimInfo.team), victimInfo);
  tally.valueDealt += (event.damage * costOf(s, victimInfo)) / 100;
  victimTally.valueLost += (event.damage * costOf(s, victimInfo)) / 100;
  if (event.killed) {
    tally.kills++;
    victimTally.deaths++;
  }
  // Contraataque (si las reglas lo tienen): vida perdida por el atacante.
  const after = s.units.find((unit) => unit.uid === event.attacker);
  const lost = attacker.life - (after?.life ?? 0);
  if (lost <= 0) return;
  victimTally.damageDealt += lost;
  victimTally.valueDealt += (lost * costOf(s, attacker)) / 100;
  tally.valueLost += (lost * costOf(s, attacker)) / 100;
  if (!after) {
    victimTally.kills++;
    tally.deaths++;
  }
}

/** Apunta un suceso de una accion de `team`: ataques, compras y capturas, por tipo de unidad. */
function tallyEvent(s: GameState, event: GameEvent, team: TeamId, tallies: Tallies): void {
  const unitOf = (uid: number) => s.units.find((candidate) => candidate.uid === uid);
  if (event.kind === 'attack') return tallyAttack(s, event, team, tallies);
  if (event.kind === 'spawn') {
    const unit = unitOf(event.uid);
    if (!unit) return;
    tallies.tallyOf(sideOfTeam(team), unit).bought++;
    tallies.tallyOf(sideOfTeam(team), unit).spent += costOf(s, unit);
  }
  if (event.kind === 'capture') {
    const unit = unitOf(event.uid);
    if (unit) tallies.tallyOf(sideOfTeam(team), unit).captures++;
  }
}

/** Quien juega cada lado: la IA (con el mismo azar para los dos) o nadie ('passive'). */
function controllersOf(s: GameState, policies: PlayOptions['policies'], rng: Rng): Controller[] {
  const controllerFor = (policy: Policy) => (policy === 'passive' ? passiveController() : aiController(rng));
  return s.teams.map((team) => controllerFor(policies[sideOfTeam(team.id)]));
}

/** La partida de equilibrio de estas opciones (mapa al azar con su semilla, quiza con los lados cambiados). */
function balanceMatch(options: PlayOptions, mapRng: Rng): GameState {
  const config = skirmishConfig({
    seed: options.seed,
    size: options.size,
    settingChanges: options.settings,
    teams: duel('ai', 'ai'),
    firstTeam: options.firstTeam ?? FIRST_SIDE,
  });
  return buildMatch(options.swapSides ? { ...config, swapStarts: true } : config, { content: options.content, mapRng });
}

/** Lo que se apunta de una partida mientras se juega: muestras de cada dia, lo de cada tipo de unidad y cuantos sucesos. */
class GameLog {
  readonly samples: DaySample[];
  readonly units: Record<string, UnitTally>[];
  events = 0;
  /** Ultimo estado conocido de cada unidad (para saber a quien se ha atacado aunque ya no exista). */
  private readonly known = new Map<number, Pick<Unit, 'type' | 'team' | 'x' | 'y' | 'life'>>();

  constructor(private readonly s: GameState) {
    this.samples = [sample(s)];
    this.units = SIDES.map(() => Object.fromEntries(s.content.units.list.map((unitType) => [unitType.id, emptyTally()])));
    this.remember();
  }

  /** Lo apuntado de ese tipo de unidad para ese lado. */
  private readonly tallyOf = (side: Side, unit: Pick<Unit, 'type'>): UnitTally => {
    const tally = this.units[side]?.[unit.type];
    if (!tally) throw new Error(`Tipo de unidad desconocido en el informe: ${unit.type}`);
    return tally;
  };

  private remember(): void {
    this.known.clear();
    for (const unit of this.s.units) this.known.set(unit.uid, { type: unit.type, team: unit.team, x: unit.x, y: unit.y, life: unit.life });
  }

  /** Apunta un paso de la sesion: la muestra del dia nuevo y, si es de quien juega, cada suceso. */
  readonly record = (step: ActedStep): void => {
    if (step.events.some((event) => event.kind === 'newDay')) {
      this.remember();
      this.samples.push(sample(this.s));
    }
    if (isTurnBoundary(step.action)) return;
    // Suceso a suceso, como se jugaban: si la partida acaba con esta accion, hasta el primero.
    for (const event of step.events) {
      this.events++;
      tallyEvent(this.s, event, step.team, { known: this.known, tallyOf: this.tallyOf });
      this.remember();
      if (isMatchOver(this.s)) break;
    }
  };
}

/** Quien ha ganado (por lado) y por que; sin acabar, nadie y 'timeout'. */
function outcomeOf(s: GameState): Pick<GameRecord, 'winner' | 'reason'> {
  const result = matchResult(s);
  if (result.status === 'playing') return { winner: null, reason: 'timeout' };
  if (result.status === 'draw') return { winner: null, reason: result.reason };
  return { winner: isWinner(result, FIRST_SIDE) ? FIRST_SIDE : SECOND_SIDE, reason: result.reason };
}

/** Una partida de equilibrio entera, con todo lo que pasa apuntado. */
export function playGame(options: PlayOptions): GameRecord {
  const rng = seededRng(options.seed);
  const s = balanceMatch(options, rng);
  const log = new GameLog(s);
  const session = new GameSession(s, controllersOf(s, options.policies, rng));
  session.subscribe(log.record);
  runMatch(session, { until: (state) => state.day > options.maxDays });
  const outcome = outcomeOf(s);
  if (outcome.reason === 'timeout') log.samples.push(sample(s));
  return { seed: options.seed, ...outcome, days: s.day, samples: log.samples, units: log.units, events: log.events };
}
