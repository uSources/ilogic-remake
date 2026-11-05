/** Una partida IA contra IA con todo lo que pasa apuntado (sin Phaser). */
import { aiTurn } from '@core/ai';
import type { GameContent } from '@core/content';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { endReason, endRound, isMatchOver, outcome } from '@core/rules';
import { duel, teamState } from '@core/teams';
import { unitTypeOf } from '@core/gameContent';
import { armyValue } from '@core/stats';
import type { GameState, RulesConfig, TeamId, Unit } from '@core/model';

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
  reason: 'hq' | 'wipeout' | 'days' | 'objective' | 'timeout';
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
const bySide = (valueOf: (side: Side) => number): [number, number] => [valueOf(0), valueOf(1)];

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
  const otherSide = (team: TeamId): TeamId => 1 - team;
  if (options.swapSides) {
    for (const unit of s.units) unit.team = otherSide(unit.team);
    for (const building of s.buildings) if (building.owner !== null) building.owner = otherSide(building.owner);
  }
  const units: Record<string, UnitTally>[] = SIDES.map(() =>
    Object.fromEntries(s.content.units.list.map((unitType) => [unitType.id, emptyTally()])),
  );
  /** Lo apuntado de ese tipo de unidad para ese lado. */
  const tallyOf = (side: TeamId, unit: Pick<Unit, 'type'>): UnitTally => units[side]![unit.type]!;
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
    for (const team of options.firstTeam === 1 ? [...SIDES].reverse() : SIDES) {
      if (options.policies[team] === 'passive') continue;
      for (const event of aiTurn(s, rng, team)) {
        events++;
        if (event.kind === 'attack') {
          const attacker = known.get(event.attacker);
          const victim = [...known.entries()].find(
            ([, info]) => info.x === event.target.x && info.y === event.target.y && info.team !== team,
          );
          if (attacker) {
            const tally = tallyOf(team, attacker);
            tally.attacks++;
            tally.damageDealt += event.damage;
            if (victim) {
              const [, victimInfo] = victim;
              tally.valueDealt += (event.damage * costOf(s, victimInfo)) / 100;
              const vt = tallyOf(victimInfo.team, victimInfo);
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
              tallyOf(victimInfo.team, victimInfo).damageDealt += lost;
              tallyOf(victimInfo.team, victimInfo).valueDealt += (lost * costOf(s, attacker)) / 100;
              tallyOf(team, attacker).valueLost += (lost * costOf(s, attacker)) / 100;
              if (!after) {
                tallyOf(victimInfo.team, victimInfo).kills++;
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

  const result = outcome(s, FIRST_SIDE);
  let winner: Side | null = null;
  if (result !== 'playing') {
    winner = result === 'won' ? FIRST_SIDE : SECOND_SIDE;
    reason = endReason(s, FIRST_SIDE) ?? 'timeout';
  }
  if (result === 'playing') samples.push(sample(s));
  return { seed: options.seed, winner, reason, days: s.day, samples, units, events };
}
