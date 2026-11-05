import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { saveContext } from '@core/defaultGames';
import { seededRng } from '@core/geom';
import {
  attackTargets,
  canCapture,
  controlRound,
  endRound,
  isMatchOver,
  newUnit,
  outcome,
  threatMap,
  unitById,
  visibility,
} from '@core/rules';
import { deserialize, serialize } from '@core/save';
import {
  alliesOf,
  areAllied,
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
import { blankState, hqId, unitTypeNamed } from './helpers';

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

/** Cuatro equipos con una Base en cada esquina y dos unidades cada uno, con niebla. */
function fourCorners(teams: readonly TeamSetup[] = TWO_VS_TWO): GameState {
  const s = blankState({ fog: true, weather: false }, teams);
  const corners = [
    { x: 1, y: 1 },
    { x: 30, y: 1 },
    { x: 1, y: 30 },
    { x: 30, y: 30 },
  ];
  corners.forEach((corner, team) => {
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
    const report = endRound(s);
    expect(report.income).toHaveLength(4);
    expect(report.income[3]).toBeGreaterThan(report.income[1]!);
    expect(s.teams.map((team, id) => team.funds - before[id]!)).toEqual(perTeam(s, (team) => report.income[team]! - report.upkeep[team]!));
    // Dos aliados en la zona: no la disputan, es del primero que la tiene.
    expect(s.controlPoints[0]!.owner).toBe(0);
    newUnit(s, SOLDIER, 1, { x: 20, y: 21 });
    expect(controlRound(s)!.contested).toBe(1);
  });

  it('gana la alianza que deja sin nada a todas las enemigas', () => {
    const s = fourCorners();
    expect(isMatchOver(s)).toBe(false);
    // Cae el equipo 1, pero su aliado 3 sigue: nadie ha ganado aun.
    s.units = s.units.filter((unit) => unit.team !== 1);
    s.buildings = s.buildings.filter((building) => building.owner !== 1);
    expect(outcome(s, 1)).toBe('lost');
    expect(outcome(s, 0)).toBe('playing');
    expect(outcome(s, 3)).toBe('playing');
    s.buildings.find((building) => building.owner === 3)!.owner = 2;
    expect(perTeam(s, (team) => outcome(s, team))).toEqual(['won', 'lost', 'won', 'lost']);
  });

  it('cada IA juega su turno sin atacar a sus aliados, y la partida se guarda y se carga igual', () => {
    const s = fourCorners();
    const rng = seededRng(17);
    const attacks: { attacker: number; target: number }[] = [];
    for (let day = 0; day < 12 && !isMatchOver(s); day++) {
      for (const team of teamIds(s)) {
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

  it('una partida guardada con un solo equipo o con un equipo mal formado no se lee', () => {
    const raw = JSON.parse(serialize(fourCorners())) as { teams: unknown[] };
    expect(deserialize(JSON.stringify({ ...raw, teams: raw.teams.slice(0, 1) }), saveContext(defaultContent()))).toBeNull();
    const badController = structuredClone(raw) as { teams: { controller: string }[] };
    badController.teams[1]!.controller = 'robot';
    expect(deserialize(JSON.stringify(badController), saveContext(defaultContent()))).toBeNull();
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
