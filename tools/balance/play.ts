/** Una partida IA contra IA con todo lo que pasa apuntado (sin Phaser). */
import type { GameContent } from '@core/content';
import { seededRng } from '@core/util/random';
import { buildMatch, skirmishConfig } from '@core/match';
import { isTurnBoundary } from '@core/actions';
import { isMatchOver, isWinner, matchResult, buildingsOf, teamUnits } from '@core/rules';
import { aiController } from '@core/controllers';
import { GameSession, passiveController, runMatch, type ActedStep, type Controller } from '@core/session';
import { teamIds, teamState } from '@core/teams';
import { unitTypeOf } from '@core/gameContent';
import { armyValue } from '@core/stats';
import { lifeValue } from '@core/unitValue';
import type { EndReason, GameEvent, GameEventOf, GameState, Rng, MatchSettings, TeamId, Unit } from '@core/model';

export type Policy = 'ai' | 'passive';

/**
 * Un valor por equipo, por su numero (el numero de un equipo es su puesto en `GameState.teams`).
 * Las tablas del informe van por equipos: tantos como tenga la partida.
 */
export type PerTeam<T> = T[];

/** El primer equipo del mapa (en el juego, el de la persona): el que mueve primero si no se dice otro. */
export const FIRST_TEAM: TeamId = 0;

export interface PlayOptions {
  seed: number;
  maxDays: number;
  /** Quien juega cada equipo, por numero de equipo (hay tantos equipos como politicas). 'passive' no hace nada (para medir a la IA). */
  policies: readonly Policy[];
  /** Equipo que mueve primero en cada ronda (si no, FIRST_TEAM). */
  firstTeam?: TeamId;
  /** Intercambiar las salidas en el mapa generado (para ver si el mapa favorece a alguien). */
  swapSides?: boolean;
  /** Lado del mapa (si no, el de una escaramuza del juego: DEFAULT_MAP_SIZE). */
  size?: number;
  /** Reglas de la partida. */
  settings: MatchSettings;
  /** Contenido con el que se juega (el de una variante, o el del juego). */
  content: GameContent;
}

/** Por tipo de unidad y equipo. */
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

/** Como va cada equipo al empezar un dia. */
export interface DaySample {
  day: number;
  funds: PerTeam<number>;
  buildings: PerTeam<number>;
  /** Valor del ejercito: coste x vida/100. */
  army: PerTeam<number>;
  /** Unidades en el mapa. */
  units: PerTeam<number>;
}

export interface GameRecord {
  seed: number;
  /** El equipo ganador (el primero de la alianza que gana), o null si no gana nadie. */
  winner: TeamId | null;
  /** Por que acabo; 'timeout' si se llego a `maxDays` sin acabar (entonces `winner` es null). */
  reason: EndReason | 'timeout';
  days: number;
  samples: DaySample[];
  /** Lo de cada tipo de unidad, por equipo y por id de tipo. */
  units: PerTeam<Record<string, UnitTally>>;
  events: number;
}

/** Nada apuntado todavia. */
export const emptyTally = (): UnitTally => ({
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

/** Un valor por equipo de la partida. */
const perTeam = (s: GameState, valueOf: (team: TeamId) => number): PerTeam<number> => teamIds(s).map(valueOf);

function sample(s: GameState): DaySample {
  return {
    day: s.day,
    funds: perTeam(s, (team) => teamState(s, team).funds),
    buildings: perTeam(s, (team) => buildingsOf(s, team).length),
    army: perTeam(s, (team) => armyValue(s, team)),
    units: perTeam(s, (team) => teamUnits(s, team).length),
  };
}

/** Lo que hace falta para apuntar un suceso: como estaba cada unidad antes y lo de cada tipo y lado. */
interface Tallies {
  known: ReadonlyMap<number, Pick<Unit, 'type' | 'team' | 'x' | 'y' | 'life'>>;
  tallyOf(team: TeamId, unit: Pick<Unit, 'type'>): UnitTally;
}

/** Apunta un ataque: daño, valor y bajas de los dos equipos (con el contraataque, si lo hubo). */
function tallyAttack(s: GameState, event: GameEventOf<'attack'>, team: TeamId, { known, tallyOf }: Tallies): void {
  const attacker = known.get(event.attacker);
  const victimInfo = known.get(event.target);
  if (!attacker) return;
  const tally = tallyOf(team, attacker);
  tally.attacks++;
  tally.damageDealt += event.damage;
  if (!victimInfo) return;
  const victimTally = tallyOf(victimInfo.team, victimInfo);
  const dealt = lifeValue(s, event.damage, victimInfo);
  tally.valueDealt += dealt;
  victimTally.valueLost += dealt;
  if (event.killed) {
    tally.kills++;
    victimTally.deaths++;
  }
  // Contraataque (si las reglas lo tienen): vida perdida por el atacante.
  const after = s.units.find((unit) => unit.uid === event.attacker);
  const lost = attacker.life - (after?.life ?? 0);
  if (lost <= 0) return;
  victimTally.damageDealt += lost;
  const returned = lifeValue(s, lost, attacker);
  victimTally.valueDealt += returned;
  tally.valueLost += returned;
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
    const tally = tallies.tallyOf(team, unit);
    tally.bought++;
    tally.spent += costOf(s, unit);
  }
  if (event.kind === 'capture') {
    const unit = unitOf(event.uid);
    if (unit) tallies.tallyOf(team, unit).captures++;
  }
}

/** Quien juega cada equipo: la IA (con el azar de la partida) o nadie ('passive'). */
function controllersOf(s: GameState, policies: PlayOptions['policies']): Controller[] {
  return teamIds(s).map((team) => (policyOf(policies, team) === 'passive' ? passiveController() : aiController()));
}

function policyOf(policies: PlayOptions['policies'], team: TeamId): Policy {
  const policy = policies[team];
  if (!policy) throw new Error(`No se ha dicho quien juega el equipo ${team} (hay ${policies.length} politicas)`);
  return policy;
}

/** La partida de equilibrio de estas opciones (mapa al azar con su semilla, quiza con las salidas cambiadas): un equipo por politica, todos de la IA. */
function balanceMatch(options: PlayOptions, mapRng: Rng): GameState {
  const config = skirmishConfig({
    seed: options.seed,
    size: options.size,
    settingChanges: options.settings,
    teams: options.policies.map(() => ({ controller: 'ai' })),
    firstTeam: options.firstTeam ?? FIRST_TEAM,
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
    this.units = teamIds(s).map(() => Object.fromEntries(s.content.units.list.map((unitType) => [unitType.id, emptyTally()])));
    this.remember();
  }

  /** Lo apuntado de ese tipo de unidad para ese equipo. */
  private readonly tallyOf = (team: TeamId, unit: Pick<Unit, 'type'>): UnitTally => {
    const tally = this.units[team]?.[unit.type];
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

/** Quien ha ganado y por que; sin acabar, nadie y 'timeout'. */
function outcomeOf(s: GameState): Pick<GameRecord, 'winner' | 'reason'> {
  const result = matchResult(s);
  if (result.status === 'playing') return { winner: null, reason: 'timeout' };
  if (result.status === 'draw') return { winner: null, reason: result.reason };
  return { winner: teamIds(s).find((team) => isWinner(result, team)) ?? null, reason: result.reason };
}

/** Una partida de equilibrio entera, con todo lo que pasa apuntado. */
export function playGame(options: PlayOptions): GameRecord {
  const rng = seededRng(options.seed);
  const s = balanceMatch(options, rng);
  const log = new GameLog(s);
  const session = new GameSession(s, controllersOf(s, options.policies));
  session.subscribe(log.record);
  runMatch(session, { until: (state) => state.day > options.maxDays });
  const outcome = outcomeOf(s);
  if (outcome.reason === 'timeout') log.samples.push(sample(s));
  return { seed: options.seed, ...outcome, days: s.day, samples: log.samples, units: log.units, events: log.events };
}
