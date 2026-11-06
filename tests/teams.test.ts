import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { saveContext } from '@core/defaultGames';
import { manhattan } from '@core/geom';
import { seededRng } from '@core/util/random';
import { MoveType } from '@core/content';
import { createLayer } from '@core/mapGrid';
import { generateGame } from '@core/mapgen';
import { rulesWith } from '@core/rulesConfig';
import {
  attackTargets,
  canCapture,
  controlRound,
  endRound,
  groundDistance,
  isMatchOver,
  newUnit,
  matchResult,
  isDefeated,
  standingTeams,
  othersAfter,
  takesTurn,
  turnTakers,
  turnsAfter,
  threatMap,
  unitById,
  visibility,
  roundReport,
} from '@core/rules';
import { deserialize, serialize } from '@core/save';
import {
  alliesOf,
  areAllied,
  duelTeams,
  isAiControlled,
  isPlayableOnOneScreen,
  enemiesOf,
  isHostile,
  isHostileOwner,
  newTeams,
  perTeam,
  playerTeam,
  teamIds,
  teamState,
  teamsControlledBy,
  type TeamSetup,
} from '@core/teams';
import type { GameEvent, GameState } from '@core/model';
import { checkInvariants } from './sim/partidas';
import { blankState, hqId, unitTypeNamed, endRoundReport, withoutHeadquarters, resultFor } from './helpers';

const HQ = hqId();
const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');

/** Cuatro equipos en dos alianzas: 0 y 2 (la 0) contra 1 y 3 (la 1). Solo el 2 lo juega una persona. */
const TWO_VS_TWO: TeamSetup[] = [
  { controller: 'ai', alliance: 0 },
  { controller: 'ai', alliance: 1 },
  { controller: 'human', alliance: 0 },
  { controller: 'ai', alliance: 1 },
];

/** Hasta cuatro equipos, cada uno con una Base en una esquina y dos unidades, con niebla. */
function fourCorners(teams: readonly TeamSetup[] = TWO_VS_TWO): GameState {
  const s = withoutHeadquarters(blankState({ fog: true, weather: false }, teams));
  const corners = [
    { x: 1, y: 1 },
    { x: 30, y: 1 },
    { x: 1, y: 30 },
    { x: 30, y: 30 },
  ];
  corners.slice(0, teams.length).forEach((corner, team) => {
    s.buildings.push({ type: HQ, owner: team, ...corner, capture: null });
    newUnit(s, TANK, team, { x: corner.x + (corner.x < 16 ? 1 : -1), y: corner.y });
    newUnit(s, SOLDIER, team, { x: corner.x, y: corner.y + (corner.y < 16 ? 1 : -1) });
  });
  return s;
}

describe('equipos: quien es enemigo de quien', () => {
  it('sin alianza elegida, cada equipo va por su cuenta: todos contra todos', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    expect(teamIds(s)).toEqual([0, 1, 2]);
    expect(enemiesOf(s, 0)).toEqual([1, 2]);
    expect(enemiesOf(s, 2)).toEqual([0, 1]);
    expect(alliesOf(s, 1)).toEqual([1]);
    expect(isHostile(s, 1, 2)).toBe(true);
    expect(areAllied(s, 2, 2)).toBe(true);
  });

  it('con alianzas: los de la misma no son enemigos; el dueño de algo se mira igual', () => {
    const s = blankState({}, TWO_VS_TWO);
    expect(enemiesOf(s, 0)).toEqual([1, 3]);
    expect(alliesOf(s, 0)).toEqual([0, 2]);
    expect(isHostile(s, 0, 2)).toBe(false);
    expect(isHostile(s, 3, 2)).toBe(true);
    expect(isHostileOwner(s, 3, 0)).toBe(true);
    expect(isHostileOwner(s, 2, 0)).toBe(false);
    expect(isHostileOwner(s, null, 0)).toBe(false);
  });

  it('el equipo de la persona lo dice su controlador, no su numero', () => {
    const s = blankState({}, TWO_VS_TWO);
    expect(teamsControlledBy(s, 'human')).toEqual([2]);
    expect(teamsControlledBy(s, 'ai')).toEqual([0, 1, 3]);
    expect(playerTeam(s)).toBe(2);
    // Sin personas (IA contra IA), el primero.
    expect(playerTeam(blankState({}, [{ controller: 'ai' }, { controller: 'ai' }]))).toBe(0);
  });

  it('cada equipo tiene lo suyo: dinero, general y estadisticas', () => {
    const teams = newTeams([{ controller: 'human', funds: 700 }, { controller: 'ai' }], 300);
    expect(teams.map((team) => [team.id, team.alliance, team.funds, team.general])).toEqual([
      [0, 0, 700, null],
      [1, 1, 300, null],
    ]);
    expect(() => newTeams([{ controller: 'human' }], 300)).toThrow();
    // Todos en la misma alianza: nadie seria enemigo de nadie.
    expect(() =>
      newTeams(
        [
          { controller: 'human', alliance: 3 },
          { controller: 'ai', alliance: 3 },
        ],
        300,
      ),
    ).toThrow(/alianzas/);
    expect(() => teamState(blankState(), 5)).toThrow();
  });
});

describe('cuatro equipos en dos alianzas', () => {
  it('la vision es de toda la alianza', () => {
    const s = fourCorners();
    const ally = s.units.find((unit) => unit.team === 2)!;
    const enemy = s.units.find((unit) => unit.team === 1)!;
    expect(visibility(s, 0).at(ally)).toBe(true);
    expect(visibility(s, 2).at(s.units.find((unit) => unit.team === 0)!)).toBe(true);
    expect(visibility(s, 0).at(enemy)).toBe(false);
    expect(visibility(s, 1).at(s.units.find((unit) => unit.team === 3)!)).toBe(true);
  });

  it('no se ataca a un aliado; a un enemigo de otra esquina, si', () => {
    const s = fourCorners();
    const tank = newUnit(s, TANK, 0, { x: 15, y: 15 });
    const ally = newUnit(s, SOLDIER, 2, { x: 15, y: 16 });
    const enemy = newUnit(s, SOLDIER, 3, { x: 16, y: 15 });
    const targets = attackTargets(s, tank);
    expect(targets).toContain(enemy);
    expect(targets).not.toContain(ally);
    // La amenaza de un equipo es la de sus enemigos: un aliado al lado no amenaza.
    expect(threatMap(s, 2).at({ x: 16, y: 16 })).toBe(true);
    expect(threatMap(s, 1).at({ x: 14, y: 15 })).toBe(true);
  });

  it('no se captura lo de un aliado; lo de un enemigo, si', () => {
    const s = fourCorners();
    s.buildings.push({ type: 'City', owner: 2, x: 10, y: 10, capture: null }, { type: 'City', owner: 3, x: 12, y: 10, capture: null });
    expect(canCapture(s, newUnit(s, SOLDIER, 0, { x: 10, y: 10 }))).toBe(false);
    expect(canCapture(s, newUnit(s, SOLDIER, 0, { x: 12, y: 10 }))).toBe(true);
  });

  it('cada equipo cobra lo suyo al acabar la ronda; un punto de control lo disputan solo los enemigos', () => {
    const s = fourCorners();
    s.buildings.push({ type: 'City', owner: 3, x: 12, y: 10, capture: null });
    s.controlPoints = [{ x: 20, y: 20, owner: null }];
    s.rules = { ...s.rules, controlRadius: 1, controlIncome: 500 };
    newUnit(s, SOLDIER, 0, { x: 20, y: 20 });
    newUnit(s, SOLDIER, 2, { x: 21, y: 20 });
    const before = s.teams.map((team) => team.funds);
    const report = endRoundReport(s);
    expect(report.income).toHaveLength(4);
    expect(report.income[3]).toBeGreaterThan(report.income[1]!);
    expect(s.teams.map((team, id) => team.funds - before[id]!)).toEqual(perTeam(s, (team) => report.income[team]! - report.upkeep[team]!));
    // Dos aliados en la zona: no la disputan, es del primero que la tiene.
    expect(s.controlPoints[0]!.owner).toBe(0);
    newUnit(s, SOLDIER, 1, { x: 20, y: 21 });
    expect(roundReport(s, controlRound(s)).control!.contested).toBe(1);
  });

  it('gana la alianza que deja sin nada a todas las enemigas', () => {
    const s = fourCorners();
    expect(isMatchOver(s)).toBe(false);
    // Cae el equipo 1, pero su aliado 3 sigue: nadie ha ganado aun.
    s.units = s.units.filter((unit) => unit.team !== 1);
    s.buildings = s.buildings.filter((building) => building.owner !== 1);
    expect(perTeam(s, (team) => isDefeated(s, team))).toEqual([false, true, false, false]);
    expect(matchResult(s).status).toBe('playing');
    expect(standingTeams(s)).toEqual([0, 2, 3]);
    s.buildings.find((building) => building.owner === 3)!.owner = 2;
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [0, 2], reason: 'hq' });
    expect(perTeam(s, (team) => resultFor(s, team))).toEqual(['won', 'lost', 'won', 'lost']);
  });

  it('todos contra todos (3 equipos): si cae uno, los otros dos siguen; acaba cuando queda uno', () => {
    const s = fourCorners([{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const loses = (team: number) => {
      s.units = s.units.filter((unit) => unit.team !== team);
      s.buildings = s.buildings.filter((building) => building.owner !== team);
    };
    loses(1);
    expect(perTeam(s, (team) => isDefeated(s, team))).toEqual([false, true, false]);
    expect(isMatchOver(s)).toBe(false);
    loses(2);
    expect(perTeam(s, (team) => resultFor(s, team))).toEqual(['won', 'lost', 'lost']);
    expect(isMatchOver(s)).toBe(true);
  });

  it('orden de los turnos: los derrotados no juegan, y se mira al llegar a cada uno', () => {
    const s = fourCorners();
    expect(turnsAfter(s, 2)).toEqual({ thisRound: [3], nextRound: [0, 1] });
    expect(turnsAfter(s, 0)).toEqual({ thisRound: [1, 2, 3], nextRound: [] });
    const played: number[] = [];
    for (const team of turnTakers(s)) {
      played.push(team);
      // En el turno del 0 cae el 1: ya no juega esta ronda.
      if (team === 0) s.buildings = s.buildings.filter((building) => building.owner !== 1);
    }
    expect(played).toEqual([0, 2, 3]);
    expect(takesTurn(s, 1)).toBe(false);
    expect(takesTurn(s, 3)).toBe(true);
  });

  it('lo que viene tras un turno: los de despues, el fin de ronda y los de antes, mirando quien sigue en pie', () => {
    const s = fourCorners();
    const steps = (team: number) => [...othersAfter(s, team)].map((step) => (step.kind === 'team' ? step.team : 'fin'));
    expect(steps(1)).toEqual([2, 3, 'fin', 0]);
    expect(steps(3)).toEqual(['fin', 0, 1, 2]);
    const played: (number | string)[] = [];
    for (const step of othersAfter(s, 0)) {
      played.push(step.kind === 'team' ? step.team : 'fin');
      // Durante el turno del 1 cae el 2: ya no juega.
      if (step.kind === 'team' && step.team === 1) s.buildings = s.buildings.filter((building) => building.owner !== 2);
    }
    expect(played).toEqual([1, 3, 'fin']);
    expect(() => turnsAfter(s, 9)).toThrow(/no esta en la partida/);
  });

  it('quien lo lleva y si se puede jugar en una pantalla (una persona como mucho)', () => {
    const s = fourCorners();
    expect(teamIds(s).map((team) => isAiControlled(s, team))).toEqual([true, true, false, true]);
    expect(isPlayableOnOneScreen(s)).toBe(true);
    teamState(s, 0).controller = 'human';
    expect(isPlayableOnOneScreen(s)).toBe(false);
    expect(() => duelTeams(s)).toThrow(/dos equipos/);
    expect(duelTeams(blankState())).toEqual([0, 1]);
  });

  it('cada IA juega su turno sin atacar a sus aliados, y la partida se guarda y se carga igual', () => {
    const s = fourCorners();
    const rng = seededRng(17);
    const attacks: { attacker: number; target: number }[] = [];
    for (let day = 0; day < 12 && !isMatchOver(s); day++) {
      for (const team of turnTakers(s)) {
        for (const event of aiTurn(s, rng, team)) recordAttack(s, event, team, attacks);
      }
      endRound(s);
      checkInvariants(s);
    }
    expect(attacks.length).toBeGreaterThan(0);
    for (const { attacker, target } of attacks) expect(isHostile(s, attacker, target)).toBe(true);
    const back = deserialize(serialize(s), saveContext(defaultContent()))!;
    expect(back.teams).toEqual(s.teams);
    expect(serialize(back)).toBe(serialize(s));
  });

  it('una partida guardada con un solo equipo, una sola alianza o un equipo mal formado no se lee', () => {
    const raw = JSON.parse(serialize(fourCorners())) as { teams: unknown[] };
    expect(deserialize(JSON.stringify({ ...raw, teams: raw.teams.slice(0, 1) }), saveContext(defaultContent()))).toBeNull();
    const badController = structuredClone(raw) as { teams: { controller: string }[] };
    badController.teams[1]!.controller = 'robot';
    expect(deserialize(JSON.stringify(badController), saveContext(defaultContent()))).toBeNull();
    const oneAlliance = structuredClone(raw) as { teams: { alliance: number }[] };
    for (const team of oneAlliance.teams) team.alliance = 0;
    expect(deserialize(JSON.stringify(oneAlliance), saveContext(defaultContent()))).toBeNull();
    const badId = structuredClone(raw) as { teams: { id: number }[] };
    badId.teams[2]!.id = 7;
    expect(deserialize(JSON.stringify(badId), saveContext(defaultContent()))).toBeNull();
  });
});

/** Apunta quien ataca a quien (por equipo) en un ataque de `team`. */
function recordAttack(s: GameState, event: GameEvent, team: number, attacks: { attacker: number; target: number }[]): void {
  if (event.kind !== 'attack' || !event.combat) return;
  expect(event.combat.attackerTeam).toBe(team);
  expect(unitById(s, event.attacker)?.team ?? team).toBe(team);
  attacks.push({ attacker: event.combat.attackerTeam, target: event.combat.defenderTeam });
}

describe('mapas al azar para mas de dos equipos', () => {
  it.each([3, 4])('%i equipos: una Base y unidades cada uno, todas las salidas conectadas a pie y separadas', (count) => {
    for (let seed = 1; seed <= 5; seed++) {
      const teams: TeamSetup[] = Array.from({ length: count }, () => ({ controller: 'ai' }));
      const s = generateGame(seededRng(seed), {
        size: 32,
        rules: rulesWith(defaultContent(), { controlPoints: 2 }),
        content: defaultContent(),
        teams,
      });
      const hqs = teamIds(s).map((team) => s.buildings.find((building) => building.owner === team && building.type === HQ)!);
      expect(hqs.every(Boolean), `semilla ${seed}`).toBe(true);
      for (const team of teamIds(s)) expect(s.units.filter((unit) => unit.team === team).length).toBeGreaterThan(0);
      const fromFirst = groundDistance(s, hqs[0]!, MoveType.FOOT, createLayer(s, false));
      for (const hq of hqs.slice(1)) expect(fromFirst.at(hq)).toBeGreaterThan(0);
      for (const [i, hq] of hqs.entries()) for (const other of hqs.slice(i + 1)) expect(manhattan(hq, other)).toBeGreaterThan(5);
      checkInvariants(s);
    }
  });
});
