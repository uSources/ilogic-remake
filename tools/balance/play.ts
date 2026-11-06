/** Una partida IA contra IA con todo lo que pasa apuntado (sin Phaser). */
import { aiTurn } from '@core/ai';
import type { GameContent } from '@core/content';
import { seededRng } from '@core/util/random';
import { generateGame } from '@core/mapgen';
import { endRound, isMatchOver, isWinner, matchResult, takesTurn } from '@core/rules';
import { duel, teamState } from '@core/teams';
import { unitTypeOf } from '@core/gameContent';
import { armyValue } from '@core/stats';
import type { EndReason, GameState, RulesConfig, TeamId, Unit } from '@core/model';

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

/** Los lados en el orden en que juegan cada ronda, empezando por `first`. */
const sidesFrom = (first: Side): readonly Side[] => [first, opponentOf(first)];

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
  rules: RulesConfig;
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

export function playGame(options: PlayOptions): GameRecord {
  const rng = seededRng(options.seed);
  const s = generateGame(rng, { size: options.size ?? 32, rules: options.rules, content: options.content, teams: duel('ai', 'ai') });
  if (options.swapSides) {
    for (const unit of s.units) unit.team = opponentOf(sideOfTeam(unit.team));
    for (const building of s.buildings) if (building.owner !== null) building.owner = opponentOf(sideOfTeam(building.owner));
  }
  const units: Record<string, UnitTally>[] = SIDES.map(() =>
    Object.fromEntries(s.content.units.list.map((unitType) => [unitType.id, emptyTally()])),
  );
  /** Lo apuntado de ese tipo de unidad para ese lado. */
  const tallyOf = (side: Side, unit: Pick<Unit, 'type'>): UnitTally => units[side]![unit.type]!;
  const samples: DaySample[] = [sample(s)];
  // Ultimo estado conocido de cada unidad (para saber a quien se ha atacado aunque ya no exista).
  const known = new Map<number, Pick<Unit, 'type' | 'team' | 'x' | 'y' | 'life'>>();
  const remember = () => {
    known.clear();
    for (const unit of s.units) known.set(unit.uid, { type: unit.type, team: unit.team, x: unit.x, y: unit.y, life: unit.life });
  };
  remember();
  let events = 0;
  let reason: GameRecord['reason'] = 'timeout';

  const finished = () => isMatchOver(s);
  while (!finished() && s.day <= options.maxDays) {
    for (const team of sidesFrom(options.firstTeam ?? FIRST_SIDE)) {
      // Los derrotados no juegan (como en todas partes: rules/turnOrder.ts).
      if (!takesTurn(s, team) || options.policies[team] === 'passive') continue;
      for (const event of aiTurn(s, rng, team)) {
        events++;
        if (event.kind === 'attack') {
          const attacker = known.get(event.attacker);
          const victimInfo = known.get(event.target);
          const victim = victimInfo ? ([event.target, victimInfo] as const) : undefined;
          if (attacker) {
            const tally = tallyOf(team, attacker);
            tally.attacks++;
            tally.damageDealt += event.damage;
            if (victim) {
              const [, victimInfo] = victim;
              tally.valueDealt += (event.damage * costOf(s, victimInfo)) / 100;
              const vt = tallyOf(sideOfTeam(victimInfo.team), victimInfo);
              vt.valueLost += (event.damage * costOf(s, victimInfo)) / 100;
              if (event.killed) {
                tally.kills++;
                vt.deaths++;
              }
            }
          }
          // Contraataque (si las reglas lo tienen): vida perdida por el atacante.
          const after = s.units.find((unit) => unit.uid === event.attacker);
          if (attacker) {
            const lost = attacker.life - (after?.life ?? 0);
            if (lost > 0 && victim) {
              const [, victimInfo] = victim;
              tallyOf(sideOfTeam(victimInfo.team), victimInfo).damageDealt += lost;
              tallyOf(sideOfTeam(victimInfo.team), victimInfo).valueDealt += (lost * costOf(s, attacker)) / 100;
              tallyOf(team, attacker).valueLost += (lost * costOf(s, attacker)) / 100;
              if (!after) {
                tallyOf(sideOfTeam(victimInfo.team), victimInfo).kills++;
                tallyOf(team, attacker).deaths++;
              }
            }
          }
        } else if (event.kind === 'spawn') {
          const unit = s.units.find((candidate) => candidate.uid === event.uid);
          if (unit) {
            tallyOf(team, unit).bought++;
            tallyOf(team, unit).spent += costOf(s, unit);
          }
        } else if (event.kind === 'capture') {
          const unit = s.units.find((candidate) => candidate.uid === event.uid);
          if (unit) tallyOf(team, unit).captures++;
        }
        remember();
        if (finished()) break;
      }
      if (finished()) break;
    }
    if (finished()) break;
    endRound(s);
    remember();
    samples.push(sample(s));
  }

  const result = matchResult(s);
  let winner: Side | null = null;
  if (result.status === 'decided') winner = isWinner(result, FIRST_SIDE) ? FIRST_SIDE : SECOND_SIDE;
  if (result.status !== 'playing') reason = result.reason;
  else samples.push(sample(s));
  return { seed: options.seed, winner, reason, days: s.day, samples, units, events };
}
