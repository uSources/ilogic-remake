import { describe, expect, it } from 'vitest';
import { changeSettings } from '@core/gameState';
import { aiController } from '@core/controllers';
import { GameSession, runMatch } from '@core/session';
import { skirmishConfig } from '@core/match';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { manhattan } from '@core/geom';
import { seededRng } from '@core/util/random';
import { MoveType } from '@core/content';
import { generateGame } from '@core/mapgen';
import { settingsWith } from '@core/matchSettings';
import {
  attackTargets,
  canCapture,
  controlRound,
  distanceMap,
  isMatchOver,
  newUnit,
  matchResult,
  isDefeated,
  standingTeams,
  nextTurn,
  takesTurn,
  threatMap,
  unitById,
  visibility,
  roundReport,
  restoreInvariants,
} from '@core/rules';
import { deserialize, serialize } from '@core/save';
import {
  alliesOf,
  areAllied,
  duel,
  duelTeams,
  isAiControlled,
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
import { act, blankState, expectRejected, giveTurn, hqId, unitTypeNamed, endRoundReport, withoutHeadquarters, resultFor } from './helpers';

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
    changeSettings(s, { ...s.settings, controlRadius: 1, controlIncome: 500 });
    newUnit(s, SOLDIER, 0, { x: 20, y: 20 });
    newUnit(s, SOLDIER, 2, { x: 21, y: 20 });
    const before = s.teams.map((team) => team.funds);
    const report = endRoundReport(s);
    expect(report.income).toHaveLength(4);
    expect(report.income[3]).toBeGreaterThan(report.income[1]!);
    expect(s.teams.map((team, id) => team.funds - before[id]!)).toEqual(
      perTeam(s, (team) => report.income[team]! - (report.upkeep?.[team] ?? 0)),
    );
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
    restoreInvariants(s, null);
    expect(perTeam(s, (team) => isDefeated(s, team))).toEqual([false, true, false, false]);
    expect(matchResult(s).status).toBe('playing');
    expect(standingTeams(s)).toEqual([0, 2, 3]);
    s.buildings.find((building) => building.owner === 3)!.owner = 2;
    restoreInvariants(s, null);
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [0, 2], reason: 'hq' });
    expect(perTeam(s, (team) => resultFor(s, team))).toEqual(['won', 'lost', 'won', 'lost']);
  });

  it('todos contra todos (3 equipos): si cae uno, los otros dos siguen; acaba cuando queda uno', () => {
    const s = fourCorners([{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const loses = (team: number) => {
      s.units = s.units.filter((unit) => unit.team !== team);
      s.buildings = s.buildings.filter((building) => building.owner !== team);
      // Como tras una accion: las INVARIANTS apuntan la caida.
      restoreInvariants(s, null);
    };
    loses(1);
    expect(perTeam(s, (team) => isDefeated(s, team))).toEqual([false, true, false]);
    expect(isMatchOver(s)).toBe(false);
    loses(2);
    expect(perTeam(s, (team) => resultFor(s, team))).toEqual(['won', 'lost', 'lost']);
    expect(isMatchOver(s)).toBe(true);
  });

  it('orden de los turnos: endTurn pasa al siguiente que juega (no los derrotados) y tras el ultimo acaba la ronda', () => {
    const s = fourCorners();
    expect([s.turn, s.turnOrder, nextTurn(s)]).toEqual([0, [0, 1, 2, 3], { team: 1, endsRound: false }]);
    // En el turno del 0 cae el 1: ya no juega.
    s.buildings = s.buildings.filter((building) => building.owner !== 1);
    expect(act(s, 0, { kind: 'endTurn' })).toEqual([
      { kind: 'turnEnd', actor: 0, next: 2 },
      { kind: 'teamDefeated', actor: 0, team: 1, reason: 'hq' },
    ]);
    expect([s.turn, s.turnStarted]).toEqual([2, false]);
    expectRejected(s, 2, { kind: 'wait', uid: 1 }, 'turnNotStarted');
    expectRejected(s, 3, { kind: 'startTurn' }, 'notYourTurn');
    expect(act(s, 2, { kind: 'startTurn' })).toEqual([{ kind: 'turnStart', actor: 2, day: 1 }]);
    expectRejected(s, 2, { kind: 'startTurn' }, 'turnStarted');
    act(s, 2, { kind: 'endTurn' });
    act(s, 3, { kind: 'startTurn' });
    const roundEnd = act(s, 3, { kind: 'endTurn' });
    expect(roundEnd.map((event) => event.kind)).toContain('newDay');
    expect([s.turn, s.day, takesTurn(s, 1)]).toEqual([0, 2, false]);
  });

  it('el orden de cada ronda lo dice la partida: si empieza otro, la ronda acaba tras el de antes', () => {
    const s = createMatch(skirmishConfig({ seed: 3, size: 20, teams: duel('ai', 'ai'), firstTeam: 1 }));
    expect([s.turnOrder, s.turn]).toEqual([[1, 0], 1]);
    giveTurn(s, 1);
    expect(nextTurn(s)).toEqual({ team: 0, endsRound: false });
    giveTurn(s, 0);
    expect(nextTurn(s)).toEqual({ team: 1, endsRound: true });
  });

  it('un equipo que cae en su propio turno (o se rinde) solo puede pasarlo', () => {
    const s = fourCorners([{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    act(s, 0, { kind: 'surrender' });
    expectRejected(s, 0, { kind: 'surrender' }, 'defeated');
    expect(act(s, 0, { kind: 'endTurn' })[0]).toEqual({ kind: 'turnEnd', actor: 0, next: 1 });
  });

  it('quien lo lleva', () => {
    const s = fourCorners();
    expect(teamIds(s).map((team) => isAiControlled(s, team))).toEqual([true, true, false, true]);
    expect(() => duelTeams(s)).toThrow(/dos equipos/);
    expect(duelTeams(blankState())).toEqual([0, 1]);
  });

  it('cada IA juega su turno sin atacar a sus aliados, y la partida se guarda y se carga igual', () => {
    const s = fourCorners();
    const attacks: { attacker: number; target: number }[] = [];
    const session = new GameSession(
      s,
      s.teams.map(() => aiController()),
    );
    session.subscribe((step) => {
      for (const event of step.events) recordAttack(s, event, step.team, attacks);
      if (step.events.some((event) => event.kind === 'newDay')) checkInvariants(s);
    });
    runMatch(session, { until: (state) => state.day > 12 });
    expect(attacks.length).toBeGreaterThan(0);
    for (const { attacker, target } of attacks) expect(isHostile(s, attacker, target)).toBe(true);
    const back = deserialize(serialize(s), defaultContent())!;
    expect(back.teams).toEqual(s.teams);
    expect(serialize(back)).toBe(serialize(s));
  });

  it('una partida guardada con un solo equipo, una sola alianza o un equipo mal formado no se lee', () => {
    const raw = JSON.parse(serialize(fourCorners())) as { teams: unknown[] };
    expect(deserialize(JSON.stringify({ ...raw, teams: raw.teams.slice(0, 1) }), defaultContent())).toBeNull();
    const badController = structuredClone(raw) as { teams: { controller: string }[] };
    badController.teams[1]!.controller = 'robot';
    expect(deserialize(JSON.stringify(badController), defaultContent())).toBeNull();
    const oneAlliance = structuredClone(raw) as { teams: { alliance: number }[] };
    for (const team of oneAlliance.teams) team.alliance = 0;
    expect(deserialize(JSON.stringify(oneAlliance), defaultContent())).toBeNull();
    const badId = structuredClone(raw) as { teams: { id: number }[] };
    badId.teams[2]!.id = 7;
    expect(deserialize(JSON.stringify(badId), defaultContent())).toBeNull();
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
        settings: settingsWith(defaultContent(), { controlPoints: 2 }),
        content: defaultContent(),
        teams,
      });
      const hqs = teamIds(s).map((team) => s.buildings.find((building) => building.owner === team && building.type === HQ)!);
      expect(hqs.every(Boolean), `semilla ${seed}`).toBe(true);
      for (const team of teamIds(s)) expect(s.units.filter((unit) => unit.team === team).length).toBeGreaterThan(0);
      const fromFirst = distanceMap(s, hqs[0]!, MoveType.FOOT);
      for (const hq of hqs.slice(1)) expect(fromFirst.at(hq)).toBeLessThan(Infinity);
      for (const [i, hq] of hqs.entries()) for (const other of hqs.slice(i + 1)) expect(manhattan(hq, other)).toBeGreaterThan(5);
      checkInvariants(s);
    }
  });
});
