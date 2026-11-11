import { describe, expect, it } from 'vitest';
import { aiController } from '@core/controllers';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig, type MatchTeam } from '@core/match';
import { newUnit } from '@core/measure';
import type { GameEvent, GameState, MatchSettings, TeamId } from '@core/model';
import { eventsSeenBy, knowledgeOf, type Knowledge } from '@core/net';
import { GameSession, runMatch } from '@core/session';
import { teamIds, teamState, type TeamSetup } from '@core/teams';
import { appointGeneral } from '@core/generals';
import { PRIVATE_KINDS } from './sim/eventReferences';
import { expectReferencesKnown } from './sim/viewChecks';
import { act, blankState, giveTurn, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');
const CAR = unitTypeNamed('Car');
const TRANSPORT = unitTypeNamed('Transport');
const SUPPLIER = unitTypeNamed('Supplier');
const ARTILLERY = unitTypeNamed('Artillery');

/** Con niebla: un soldado del equipo 0 en (2, 2) (ve a 4 casillas), un coche enemigo a la vista y un tanque enemigo lejos, escondido. */
function fogged(settingChanges: Partial<MatchSettings> = { fog: true }) {
  const s = blankState(settingChanges);
  const mine = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
  const seen = newUnit(s, CAR, 1, { x: 3, y: 2 });
  const hidden = newUnit(s, TANK, 1, { x: 25, y: 25 });
  return { s, mine, seen, hidden };
}

/** Lo que ve `team` de lo que hace `play` en la partida (sus vistas de antes y de despues). */
function seenBy(
  s: GameState,
  team: TeamId,
  play: () => GameEvent[],
): { events: GameEvent[]; seen: GameEvent[]; before: Knowledge; after: Knowledge } {
  const before = knowledgeOf(s, team);
  const events = play();
  const after = knowledgeOf(s, team);
  return { events, seen: eventsSeenBy(events, { before, after }), before, after };
}

describe('la niebla de los sucesos: lo que ve un equipo de un paso', () => {
  it('lo que hace un enemigo lejos de su vista no lo ve; lo que hace a la vista, si', () => {
    const { s, seen, hidden } = fogged();
    giveTurn(s, 1);
    const far = seenBy(s, 0, () => act(s, 1, { kind: 'move', uid: hidden.uid, to: { x: 25, y: 24 } }));
    expect(far.events.map((event) => event.kind)).toEqual(['move']);
    expect(far.seen).toEqual([]);
    const near = seenBy(s, 0, () => act(s, 1, { kind: 'wait', uid: seen.uid }));
    expect(near.seen).toEqual(near.events);
  });

  it('del camino de un enemigo solo las casillas que ve (la unidad se conocia antes del paso)', () => {
    const { s, seen } = fogged();
    giveTurn(s, 1);
    const { seen: shown } = seenBy(s, 0, () => act(s, 1, { kind: 'move', uid: seen.uid, to: { x: 3, y: 9 } }));
    expect(shown).toHaveLength(1);
    const move = shown[0]!;
    if (move.kind !== 'move') throw new Error('se esperaba un movimiento');
    // Hasta (3, 5), a 4 casillas del soldado; de (3, 6) en adelante, niebla.
    expect(move.path).toEqual([2, 3, 4, 5].map((y) => ({ x: 3, y })));
    // El dueño lo ve entero.
    expect(eventsSeenBy([move], { before: knowledgeOf(s, 1), after: knowledgeOf(s, 1) })).toEqual([move]);
  });

  it('una unidad que sale de la niebla a la vista se ve (se conoce despues del paso)', () => {
    const { s, hidden } = fogged();
    s.units.find((unit) => unit.uid === hidden.uid)!.x = 8;
    s.units.find((unit) => unit.uid === hidden.uid)!.y = 2;
    giveTurn(s, 1);
    const { seen: shown, before } = seenBy(s, 0, () => act(s, 1, { kind: 'move', uid: hidden.uid, to: { x: 4, y: 2 } }));
    expect(before.state.units.some((unit) => unit.uid === hidden.uid)).toBe(false);
    expect(shown.map((event) => event.kind)).toEqual(['move']);
  });

  it('el combate se ve donde cae el disparo, entero si conoce a quien dispara; lejos, no', () => {
    const { s, mine, seen, hidden } = fogged();
    const far = newUnit(s, SOLDIER, 1, { x: 24, y: 25 });
    far.life = 1;
    giveTurn(s, 1);
    const near = seenBy(s, 0, () => act(s, 1, { kind: 'attack', uid: seen.uid, target: mine.uid }));
    expect(near.events.map((event) => event.kind)).toEqual(['attack']);
    expect(near.seen).toEqual(near.events);
    // Un combate entre enemigos en la niebla: nada, ni que alguien cae.
    const away = seenBy(s, 0, () => act(s, 0, { kind: 'wait', uid: mine.uid }));
    expect(away.seen).toEqual(away.events);
    const combat = near.events[0]!.kind === 'attack' ? near.events[0].combat : (undefined as never);
    const unseenAttack: GameEvent = {
      kind: 'attack',
      actor: 1,
      attacker: hidden.uid,
      target: far.uid,
      at: { x: 24, y: 25 },
      damage: 1,
      killed: true,
      counter: 0,
      attackerKilled: false,
      combat: { ...combat, counterHit: 0.5 },
    };
    expect(eventsSeenBy([unseenAttack], { before: away.before, after: away.after })).toEqual([]);
  });

  it('un disparo desde la niebla: se ve donde cae, pero no quien dispara ni si se le pudo contestar', () => {
    const { s, mine } = fogged();
    const artillery = newUnit(s, ARTILLERY, 1, { x: 2, y: 7 });
    giveTurn(s, 1);
    const { seen: shown, events, before } = seenBy(s, 0, () => act(s, 1, { kind: 'attack', uid: artillery.uid, target: mine.uid }));
    expect(events.map((event) => event.kind)).toEqual(['attack']);
    expect(before.state.units.some((unit) => unit.uid === artillery.uid)).toBe(false);
    expect(shown).toHaveLength(1);
    const attack = shown[0]!;
    if (attack.kind !== 'attack') throw new Error('se esperaba un ataque');
    expect(attack.attacker).toBeNull();
    expect(attack.combat.counterHit).toBeNull();
    expect(attack.combat.attackerType).toBe(ARTILLERY.id);
    expect(attack.target).toBe(mine.uid);
  });

  it('un poder de area solo nombra a las unidades que el equipo conoce (y la casilla si la ve)', () => {
    const { s, mine } = fogged();
    appointGeneral(s, 1, 'Brisa');
    teamState(s, 1).general!.charge = 6;
    const target = { x: 25, y: 24 };
    const ours = newUnit(s, SOLDIER, 0, { x: 25, y: 23 });
    ours.life = 50;
    giveTurn(s, 1);
    const { seen: shown, events } = seenBy(s, 0, () => act(s, 1, { kind: 'usePower', power: 'airstrike', target }));
    const power = events.find((event) => event.kind === 'power');
    expect(power?.hits.map((hit) => hit.uid)).toEqual([ours.uid]);
    // El equipo 0 conoce a su propia unidad tocada: la ve.
    const shownPower = shown.find((event) => event.kind === 'power');
    expect(shownPower?.hits).toEqual(power?.hits);
    expect(shownPower?.target).toEqual(target);
    expect(mine.life).toBe(100);
  });

  it('un poder de area sobre unidades que el equipo no conoce: ni a quien toca ni donde', () => {
    const s = blankState({ fog: true }, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    appointGeneral(s, 1, 'Brisa');
    teamState(s, 1).general!.charge = 6;
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    const victim = newUnit(s, SOLDIER, 2, { x: 25, y: 23 });
    newUnit(s, SOLDIER, 1, { x: 25, y: 20 });
    giveTurn(s, 1);
    const { seen: shown, events } = seenBy(s, 0, () => act(s, 1, { kind: 'usePower', power: 'airstrike', target: { x: 25, y: 24 } }));
    expect(events.find((event) => event.kind === 'power')?.hits.map((hit) => hit.uid)).toEqual([victim.uid]);
    const shownPower = shown.find((event) => event.kind === 'power');
    expect(shownPower).toMatchObject({ kind: 'power', general: 'Brisa', power: 'airstrike', hits: [] });
    expect(shownPower).not.toHaveProperty('target');
  });

  it('un punto de control disputado solo lo esta para quien ve a quien lo disputa', () => {
    const s = blankState({ fog: true, controlPoints: 1, controlRadius: 1 });
    s.controlPoints = [{ x: 20, y: 20, owner: 1 }];
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    newUnit(s, SOLDIER, 0, { x: 20, y: 21 });
    newUnit(s, SOLDIER, 1, { x: 20, y: 19 });
    giveTurn(s, 1);
    const { seen: shown, events } = seenBy(s, 0, () => act(s, 1, { kind: 'endTurn' }));
    const point = events.find((event) => event.kind === 'controlPoint');
    expect(point).toMatchObject({ contested: true });
    // El equipo 0 ve al enemigo de al lado: disputado. Un tercero que no viera nada, no.
    expect(shown.find((event) => event.kind === 'controlPoint')).toMatchObject({ contested: true });
    const blind = knowledgeOf(blankState({ fog: true }), 0);
    const far = { ...blind, state: { ...blind.state, controlPoints: s.controlPoints } };
    expect(eventsSeenBy([point!], { before: far, after: far })).toMatchObject([{ contested: false }]);
  });

  it('las ordenes y las escuadras de los enemigos no se ven; las de los aliados, si', () => {
    const s = blankState({ fog: true }, [
      { controller: 'human', alliance: 0 },
      { controller: 'ai', alliance: 1 },
      { controller: 'ai', alliance: 0 },
    ] satisfies TeamSetup[]);
    const enemy = newUnit(s, SOLDIER, 1, { x: 3, y: 2 });
    const allied = newUnit(s, SOLDIER, 2, { x: 20, y: 20 });
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    giveTurn(s, 1);
    const theirs = seenBy(s, 0, () =>
      act(s, 1, { kind: 'giveStandingOrder', uids: [enemy.uid], order: { kind: 'defend', at: { x: 3, y: 2 } } }),
    );
    expect(theirs.events.map((event) => event.kind)).toEqual(['standingOrder']);
    expect(theirs.seen).toEqual([]);
    const ours = seenBy(s, 0, () => act(s, 2, { kind: 'formSquad', uids: [allied.uid] }));
    expect(ours.seen).toEqual(ours.events);
    const squadGone = seenBy(s, 0, () => act(s, 2, { kind: 'leaveSquad', uids: [allied.uid] }));
    expect(squadGone.seen).toEqual(squadGone.events);
  });

  it('abastecer: solo las reparaciones de unidades que conoce', () => {
    const { s } = fogged();
    const supplier = newUnit(s, SUPPLIER, 1, { x: 25, y: 20 });
    const repaired = newUnit(s, TANK, 1, { x: 25, y: 19 });
    repaired.life = 50;
    giveTurn(s, 1);
    const far = seenBy(s, 0, () => act(s, 1, { kind: 'supply', uid: supplier.uid }));
    expect(far.events[0]?.kind).toBe('supply');
    expect(far.seen).toEqual([]);
    const own = seenBy(s, 1, () => {
      repaired.life = 50;
      s.units.find((unit) => unit.uid === supplier.uid)!.turnState = 'ready';
      return act(s, 1, { kind: 'supply', uid: supplier.uid });
    });
    expect(own.seen).toEqual(own.events);
  });

  it('quien iba dentro de un transporte enemigo que cae no se sabe; el transporte, si se veia', () => {
    const { s, mine } = fogged();
    const transport = newUnit(s, TRANSPORT, 1, { x: 2, y: 3 });
    const passenger = newUnit(s, SOLDIER, 1, { x: 2, y: 4 });
    transport.life = 1;
    act(giveTurn(s, 1), 1, { kind: 'load', uid: passenger.uid, into: transport.uid });
    const ownerBefore = knowledgeOf(s, 1);
    const { seen, events } = seenBy(s, 0, () => act(s, 0, { kind: 'attack', uid: mine.uid, target: transport.uid }));
    const lost = events.find((event) => event.kind === 'cargoLost');
    expect(lost).toMatchObject({ transport: transport.uid, passengers: [passenger.uid] });
    expect(seen.find((event) => event.kind === 'cargoLost')).toMatchObject({ transport: transport.uid, passengers: [] });
    // Su dueño sabe a quien ha perdido (conocia el transporte antes del paso).
    expect(eventsSeenBy([lost!], { before: ownerBefore, after: knowledgeOf(s, 1) })).toEqual([lost]);
  });

  it('del fin de ronda: los ingresos y el tope de dinero solo de la alianza; el dia nuevo, publico', () => {
    const { s } = fogged();
    const { seen, events } = seenBy(s, 0, () => act(s, 1, { kind: 'endTurn' }));
    const incomes = events.filter((event) => event.kind === 'income');
    expect(incomes.map((event) => event.team)).toEqual([0, 1]);
    expect(seen.filter((event) => event.kind === 'income').map((event) => event.team)).toEqual([0]);
    expect(seen.some((event) => event.kind === 'newDay')).toBe(true);
    expect(seen.filter((event) => event.kind === 'turnEnd')).toEqual(events.filter((event) => event.kind === 'turnEnd'));
  });

  it('un suceso que no esta en la tabla no sale', () => {
    const { s } = fogged();
    const knowledge = knowledgeOf(s, 0);
    const unknown = { kind: 'somethingNew', actor: null, secret: 1 } as unknown as GameEvent;
    expect(eventsSeenBy([unknown], { before: knowledge, after: knowledge })).toEqual([]);
  });

  it('el antes y el despues tienen que ser del mismo equipo', () => {
    const { s } = fogged();
    expect(() => eventsSeenBy([], { before: knowledgeOf(s, 0), after: knowledgeOf(s, 1) })).toThrow(/equipo/);
  });
});

/** Con que se reconoce un suceso entre los de su paso. */
const signatureOf = (event: GameEvent): string => `${event.kind}:${String(event.actor)}`;

/** `part` sale de `whole` quitando elementos (en su orden). */
function isSubsequence(part: readonly string[], whole: readonly string[]): boolean {
  let at = 0;
  for (const item of part) {
    at = whole.indexOf(item, at);
    if (at < 0) return false;
    at++;
  }
  return true;
}

/** Juega `days` dias IA contra IA de `config` comprobando, en cada paso y para cada equipo, lo que ve. */
function playChecking(teams: readonly MatchTeam[], settingChanges: Partial<MatchSettings>, seed: number, days: number): number {
  const s = createMatch(skirmishConfig({ seed, size: 16, teams, settingChanges }));
  const session = new GameSession(
    s,
    s.teams.map(() => aiController()),
  );
  const known = new Map(teamIds(s).map((team) => [team, knowledgeOf(s, team)]));
  let steps = 0;
  session.subscribe((step) => {
    steps++;
    for (const team of teamIds(s)) {
      const before = known.get(team)!;
      const after = knowledgeOf(s, team);
      known.set(team, after);
      const seen = eventsSeenBy(step.events, { before, after });
      expectReferencesKnown(seen, before.state, after.state, team);
      // Lo que se ve es un trozo de lo que paso, en su orden (recortado, nunca inventado).
      expect(isSubsequence(seen.map(signatureOf), step.events.map(signatureOf))).toBe(true);
      if (settingChanges.fog !== false) return;
      // Sin niebla todo lo del mapa se ve tal cual; lo privado de cada alianza, no.
      const expected = step.events.filter((event) => !PRIVATE_KINDS.has(event.kind) || seen.includes(event));
      expect(seen).toEqual(expected);
    }
  });
  runMatch(session, { until: (state) => state.day > days });
  return steps;
}

const TWO_VS_TWO: TeamSetup[] = [
  { controller: 'ai', alliance: 0 },
  { controller: 'ai', alliance: 1 },
  { controller: 'ai', alliance: 0 },
  { controller: 'ai', alliance: 1 },
];
const FREE_FOR_ALL: TeamSetup[] = [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }];

describe('la niebla de los sucesos en partidas enteras: cada equipo solo ve lo que conoce', () => {
  it('dos equipos con niebla', () => {
    expect(playChecking([{ controller: 'ai' }, { controller: 'ai' }], { fog: true }, 11, 10)).toBeGreaterThan(50);
  }, 60_000);

  it('tres equipos, todos contra todos, con niebla', () => {
    expect(playChecking(FREE_FOR_ALL, { fog: true }, 12, 8)).toBeGreaterThan(50);
  }, 60_000);

  it('cuatro equipos en dos alianzas, con niebla', () => {
    expect(playChecking(TWO_VS_TWO, { fog: true }, 13, 8)).toBeGreaterThan(50);
  }, 60_000);

  it('sin niebla, los sucesos del mapa pasan enteros', () => {
    expect(playChecking([{ controller: 'ai' }, { controller: 'ai' }], { fog: false }, 14, 8)).toBeGreaterThan(50);
  }, 60_000);

  it('con generales, clima y puntos de control, en dos alianzas', () => {
    const teams: MatchTeam[] = [
      { controller: 'ai', alliance: 0, general: 'Brisa' },
      { controller: 'ai', alliance: 1, general: 'Roca' },
      { controller: 'ai', alliance: 0, general: 'Ambar' },
      { controller: 'ai', alliance: 1, general: 'Brisa' },
    ];
    expect(playChecking(teams, { fog: true, weather: true, controlPoints: 2 }, 15, 8)).toBeGreaterThan(50);
  }, 60_000);

  it('con emboscadas y bosques que esconden, tres equipos', () => {
    expect(playChecking(FREE_FOR_ALL, { fog: true, ambush: true, forestHides: true }, 16, 8)).toBeGreaterThan(50);
  }, 60_000);
});
