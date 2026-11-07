import { describe, expect, it } from 'vitest';
import { createMatch, loadGame } from '@core/defaultGames';
import { cloneState } from '@core/gameContent';
import { skirmishConfig } from '@core/match';
import { canMoveNow, matchResult, moveRange, newUnit, reachableTiles } from '@core/rules';
import { serialize } from '@core/save';
import { aiController, controllersFor } from '@core/controllers';
import type { ActionPlan, ActionResult } from '@core/model';
import {
  autopilotController,
  GameSession,
  humanController,
  passiveController,
  propose,
  proposing,
  remoteController,
  replaySession,
  LogCursor,
  isOffTurnAction,
  runMatch,
  scriptedController,
  sequence,
  type ActedStep,
  type Controller,
  isAutosaveMoment,
  isPerson,
  people,
  personStillPlays,
  screenEnd,
} from '@core/session';
import { GAME_MODES } from '@core/modes';
import { startsTurn } from '@core/actions';
import { duel } from '@core/teams';
import { act, blankState, giveTurn, hqId, unitTypeNamed } from './helpers';
import { PLAIN_SETTINGS } from './plainSettings';

/** Un controlador que decide como la IA (con un plan que propone), con el plan que da `planFor`. */
const planning = (planFor: () => ActionPlan): Controller => ({ name: 'ai', playTurn: () => proposing(planFor()) });

/** Una sesion de la persona (equipo 0) contra la IA, con lo que se haga apuntado. */
function personVsAi(s: ReturnType<typeof blankState>) {
  const session = new GameSession(s, [humanController(), aiController()]);
  const steps: ActedStep[] = [];
  session.subscribe((step) => steps.push(step));
  return { session, steps };
}

describe('la sesion: turnos, controladores y registro (core/session)', () => {
  it('empieza el turno, espera a la persona y solo acepta sus acciones mientras la espera', () => {
    const s = blankState();
    s.turnStarted = false;
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    const { session, steps } = personVsAi(s);
    expect(session.act(0, { kind: 'wait', uid: soldier.uid })).toEqual({ ok: false, reason: 'notYourTurn' });
    expect(session.step()).toMatchObject({ kind: 'acted', action: { kind: 'startTurn' } });
    expect(session.step()).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(session.act(0, { kind: 'wait', uid: soldier.uid }).ok).toBe(true);
    expect(steps.map((step) => step.action.kind)).toEqual(['startTurn', 'wait']);
    expect(session.log.map((entry) => entry.action.kind)).toEqual(['startTurn', 'wait']);
  });

  it('al acabar la persona, su piloto automatico cumple las ordenes, la partida captura sola y juega el siguiente', () => {
    const s = blankState();
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    s.buildings.push({ type: 'City', owner: null, x: 3, y: 3 });
    const { session, steps } = personVsAi(s);
    runMatch(session);
    session.finishInput(0);
    const end = runMatch(session);
    expect(end).toEqual({ kind: 'awaitingInput', team: 0 });
    const ownEnd = steps.find((step) => step.team === 0 && step.action.kind === 'endTurn')!;
    expect(ownEnd.events[0]).toMatchObject({ kind: 'capture', actor: 0, uid: soldier.uid });
    expect(steps.some((step) => step.team === 1 && startsTurn(step))).toBe(true);
    expect(s.day).toBe(2);
  });

  it('el autoguardado es al empezar el turno de la persona: al cargarlo, nada se repite', () => {
    const s = createMatch(skirmishConfig({ seed: 4, size: 20, teams: duel('human', 'ai') }));
    const { session } = personVsAi(s);
    let saved: string | null = null;
    session.subscribe((step) => {
      if (isAutosaveMoment(session, step)) saved = serialize(s);
    });
    runMatch(session);
    expect(saved).not.toBeNull();
    const loaded = loadGame(saved!)!;
    expect(loaded.turnStarted).toBe(true);
    expect(new GameSession(loaded, [humanController(), passiveController()]).step()).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(isAutosaveMoment(session, { kind: 'acted', team: 1, action: { kind: 'startTurn' }, events: [] })).toBe(false);
  });

  it('el registro se repite igual desde la partida de antes (los dados van en la partida)', () => {
    const s = createMatch(skirmishConfig({ seed: 6, size: 16, teams: duel('ai', 'ai') }));
    const start = cloneState(s);
    const session = new GameSession(s, controllersFor(s));
    runMatch(session, { until: (state) => state.day > 4 });
    const replay = replaySession(start, session.log);
    runMatch(replay, { until: (state) => state.day > 4 });
    expect(serialize(start)).toBe(serialize(s));
    expect(replay.log).toEqual(session.log);
  });

  it('un equipo que cae en su turno lo pasa, y la partida acaba sola cuando se decide', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    const session = new GameSession(
      s,
      s.teams.map(() => passiveController()),
    );
    act(s, 0, { kind: 'surrender' });
    expect(session.step()).toMatchObject({ kind: 'acted', team: 0, action: { kind: 'endTurn' } });
    act(s, 1, { kind: 'surrender' });
    expect(session.step()).toEqual({ kind: 'over', result: { status: 'decided', winners: [2], reason: 'surrender' } });
  });

  it('varias personas en la misma pantalla: la sesion espera a cada una en su turno', () => {
    const s = createMatch(skirmishConfig({ seed: 2, size: 20, teams: duel('human', 'human') }));
    const session = new GameSession(s, controllersFor(s));
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    session.finishInput(0);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 1 });
    expect(session.act(0, { kind: 'wait', uid: 1 })).toEqual({ ok: false, reason: 'notYourTurn' });
    session.finishInput(1);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(s.day).toBe(2);
  });

  it('empezar y acabar el turno son de la sesion: quien juega no los manda (para acabar, finishInput)', () => {
    const s = blankState();
    const { session } = personVsAi(s);
    runMatch(session);
    expect(session.act(0, { kind: 'endTurn' })).toEqual({ ok: false, reason: 'sessionOnly' });
    expect(session.act(0, { kind: 'startTurn' })).toEqual({ ok: false, reason: 'sessionOnly' });
    expect(session.step()).toEqual({ kind: 'awaitingInput', team: 0 });
  });

  it('las ordenes permanentes se cumplen al acabar el turno de cualquier equipo, lo juegue quien lo juegue', () => {
    const s = blankState();
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 3, y: 9 } } });
    const session = new GameSession(s, [remoteController(), passiveController()]);
    runMatch(session);
    session.finishInput(0);
    session.step();
    expect(soldier.y).toBeGreaterThan(3);
  });

  it('un equipo que ha caido con su turno sin empezar (partida guardada asi) lo pasa sin empezarlo', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    act(s, 0, { kind: 'surrender' });
    giveTurn(s, 0).turnStarted = false;
    const session = new GameSession(
      s,
      s.teams.map(() => passiveController()),
    );
    expect(session.step()).toMatchObject({ kind: 'acted', team: 0, action: { kind: 'endTurn' } });
  });

  it('repetir el registro con un equipo que cae en su propio turno, deshacer y rendirse sale igual', () => {
    const s = createMatch(skirmishConfig({ seed: 8, size: 20, teams: [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }] }));
    const start = cloneState(s);
    let surrendered = false;
    const quitter: Controller = {
      name: 'random',
      playTurn: function* ({ state, team }) {
        const unit = state.units.find((candidate) => candidate.team === team && canMoveNow(candidate));
        const to = unit && reachableTiles(moveRange(state, unit)).find((tile) => tile.x !== unit.x || tile.y !== unit.y);
        if (unit && to) {
          yield* propose({ kind: 'move', uid: unit.uid, to });
          yield* propose({ kind: 'undoMove', uid: unit.uid });
        }
        if (state.day === 2 && !surrendered) {
          surrendered = true;
          yield* propose({ kind: 'surrender' });
          yield* propose({ kind: 'wait', uid: 1 });
        }
      },
    };
    const session = new GameSession(s, [quitter, aiController(), aiController()]);
    runMatch(session, { until: (state) => state.day > 4 });
    expect(session.log.some((entry) => entry.action.kind === 'undoMove')).toBe(true);
    const replay = replaySession(start, session.log);
    runMatch(replay, { until: (state) => state.day > 4 });
    expect(replay.log).toEqual(session.log);
    expect(serialize(start)).toBe(serialize(s));
  });

  it('rendirse vale fuera del turno, y la sesion deja de esperar a quien se rinde (tres equipos)', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const session = new GameSession(s, [humanController(), remoteController(), passiveController()]);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    // El equipo 1 se rinde en el turno del 0 (por la red se puede en cualquier momento).
    expect(session.act(1, { kind: 'surrender' }).ok).toBe(true);
    expect(session.act(1, { kind: 'wait', uid: 1 })).toEqual({ ok: false, reason: 'notYourTurn' });
    // El 0 se rinde en su turno: la sesion ya no le espera, y como solo queda el 2, la partida acaba.
    expect(session.act(0, { kind: 'surrender' }).ok).toBe(true);
    expect(session.awaitingInput).toBe(0);
    expect(runMatch(session)).toEqual({ kind: 'over', result: { status: 'decided', winners: [2], reason: 'surrender' } });
  });

  it('quien se rinde en su turno, con mas equipos en juego: la sesion deja de esperarle y siguen los demas', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const session = new GameSession(s, [humanController(), passiveController(), passiveController()]);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(session.act(0, { kind: 'surrender' }).ok).toBe(true);
    const steps: ActedStep[] = [];
    session.subscribe((step) => steps.push(step));
    expect(session.step()).toMatchObject({ kind: 'acted', team: 0, action: { kind: 'endTurn' } });
    expect(session.awaitingInput).toBeNull();
    runMatch(session, { until: (state) => state.day > 3 });
    expect(steps.filter((step) => step.team === 0).map((step) => step.action.kind)).toEqual(['endTurn']);
    expect(steps.some((step) => step.team === 1 && startsTurn(step))).toBe(true);
  });

  it('rendirse fuera del turno, sin que la partida acabe: su turno se salta', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const session = new GameSession(s, [humanController(), remoteController(), passiveController()]);
    runMatch(session);
    expect(session.act(1, { kind: 'surrender' }).ok).toBe(true);
    const steps: ActedStep[] = [];
    session.subscribe((step) => steps.push(step));
    session.finishInput(0);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(steps.filter((step) => step.team === 1)).toEqual([]);
    expect(steps.some((step) => step.team === 2 && startsTurn(step))).toBe(true);
  });

  it('un controlador que propone empezar o acabar el turno no lo consigue (son de la sesion)', () => {
    const s = blankState();
    const replies: unknown[] = [];
    const cheater: Controller = {
      name: 'scripted',
      playTurn: function* () {
        replies.push(yield { kind: 'propose', action: { kind: 'endTurn' } });
        replies.push(yield { kind: 'propose', action: { kind: 'startTurn' } });
        yield { kind: 'awaitInput' };
      },
    };
    const session = new GameSession(s, [cheater, passiveController()]);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(replies).toEqual([
      { ok: false, reason: 'sessionOnly' },
      { ok: false, reason: 'sessionOnly' },
    ]);
    expect(s.turn).toBe(0);
    expect(session.log.map((entry) => entry.action.kind)).toEqual([]);
  });

  it('la IA que propusiera un limite de turno recibe sessionOnly (no pasa su turno)', () => {
    const s = blankState();
    let reply: ActionResult | null = null;
    const session = new GameSession(s, [
      planning(function* () {
        reply = yield { kind: 'endTurn' };
      }),
      passiveController(),
    ]);
    session.step();
    expect(reply).toEqual({ ok: false, reason: 'sessionOnly' });
    expect(session.log).toEqual([{ team: 0, action: { kind: 'endTurn' } }]);
  });

  it('repetir una partida en la que otro equipo se rinde fuera de su turno: mismo registro, misma partida', () => {
    const s = createMatch(
      skirmishConfig({ seed: 8, size: 20, teams: [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }] }),
    );
    const start = cloneState(s);
    const session = new GameSession(s, [humanController(), remoteController(), aiController()]);
    runMatch(session);
    const [first, second] = s.units.filter((unit) => unit.team === 0);
    expect(session.act(0, { kind: 'wait', uid: first!.uid }).ok).toBe(true);
    expect(session.act(1, { kind: 'surrender' }).ok).toBe(true);
    expect(session.act(0, { kind: 'wait', uid: second!.uid }).ok).toBe(true);
    session.finishInput(0);
    runMatch(session);
    expect(session.log.map((entry) => `${entry.team}:${entry.action.kind}`).slice(0, 5)).toEqual([
      '0:startTurn',
      '0:wait',
      '1:surrender',
      '0:wait',
      '0:endTurn',
    ]);
    const replay = replaySession(start, session.log);
    runMatch(replay, { until: () => replay.log.length >= session.log.length });
    expect(replay.log).toEqual(session.log);
    expect(serialize(start)).toBe(serialize(s));
  });

  it('repetir con una rendicion entre dos turnos: entra antes de que empiece el siguiente', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const start = cloneState(s);
    const session = new GameSession(s, [humanController(), passiveController(), passiveController(), passiveController()]);
    runMatch(session);
    session.finishInput(0);
    expect(session.step()).toMatchObject({ kind: 'acted', team: 0, action: { kind: 'endTurn' } });
    expect(session.act(3, { kind: 'surrender' }).ok).toBe(true);
    runMatch(session);
    expect(session.log.map((entry) => `${entry.team}:${entry.action.kind}`)).toEqual([
      '0:startTurn',
      '0:endTurn',
      '3:surrender',
      '1:startTurn',
      '1:endTurn',
      '2:startTurn',
      '2:endTurn',
      '0:startTurn',
    ]);
    const replay = replaySession(start, session.log);
    runMatch(replay, { until: () => replay.log.length >= session.log.length });
    expect(replay.log).toEqual(session.log);
    expect(serialize(start)).toBe(serialize(s));
  });

  it('repetir cuando el equipo que va a jugar se rinde antes de empezar su turno (con un viaje): sale igual', () => {
    const s = blankState(PLAIN_SETTINGS, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const traveler = newUnit(s, unitTypeNamed('Soldier'), 1, { x: 2, y: 2 });
    traveler.standingOrder = { kind: 'goto', at: { x: 2, y: 20 } };
    const start = cloneState(s);
    const session = new GameSession(s, [humanController(), remoteController(), passiveController()]);
    runMatch(session);
    session.finishInput(0);
    expect(session.step()).toMatchObject({ kind: 'acted', team: 0, action: { kind: 'endTurn' } });
    expect([s.turn, s.turnStarted]).toEqual([1, false]);
    expect(session.act(1, { kind: 'surrender' }).ok).toBe(true);
    runMatch(session);
    expect(session.log.map((entry) => `${entry.team}:${entry.action.kind}`).slice(1, 4)).toEqual(['0:endTurn', '1:surrender', '1:endTurn']);
    // Su viaje no ha dado el paso de un turno que no ha empezado.
    expect([traveler.x, traveler.y]).toEqual([2, 2]);
    const replay = replaySession(start, session.log);
    runMatch(replay, { until: () => replay.log.length >= session.log.length });
    expect(replay.log).toEqual(session.log);
    expect(serialize(start)).toBe(serialize(s));
  });

  it('la repeticion se para al acabarse el registro (esperando, como la partida apuntada), sin inventar turnos', () => {
    const s = createMatch(
      skirmishConfig({ seed: 8, size: 20, teams: [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }] }),
    );
    const start = cloneState(s);
    const session = new GameSession(s, [humanController(), aiController(), aiController()]);
    runMatch(session);
    session.finishInput(0);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    const replay = replaySession(start, session.log);
    expect(runMatch(replay)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(replay.log).toEqual(session.log);
    expect(serialize(start)).toBe(serialize(s));
  });

  it('LogCursor: mirar no mueve; solo saca lo de fuera de turno, pasando los limites ya hechos', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    const cursor = new LogCursor([
      { team: 0, action: { kind: 'startTurn' } },
      { team: 2, action: { kind: 'surrender' } },
      { team: 0, action: { kind: 'wait', uid: 1 } },
    ]);
    expect(cursor.peek()).toEqual(cursor.peek());
    s.turnStarted = false;
    expect(cursor.takeOffTurn(s)).toBeNull();
    expect(cursor.peek()?.action.kind).toBe('startTurn');
    s.turnStarted = true;
    expect(cursor.takeOffTurn(s)).toEqual({ team: 2, action: { kind: 'surrender' } });
    expect(cursor.takeOffTurn(s)).toBeNull();
    expect(cursor.peek()?.action.kind).toBe('wait');
    expect(isOffTurnAction(s, { team: 0, action: { kind: 'surrender' } })).toBe(false);
    s.turnStarted = false;
    expect(isOffTurnAction(s, { team: 0, action: { kind: 'surrender' } })).toBe(true);
    expect(isOffTurnAction(s, { team: 1, action: { kind: 'wait', uid: 1 } })).toBe(false);
  });

  it('rendirse otro equipo fuera de turno no le quita al que juega lo que puede deshacer', () => {
    const s = blankState(PLAIN_SETTINGS, [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }]);
    const session = new GameSession(s, [humanController(), remoteController(), passiveController()]);
    runMatch(session);
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 5, y: 5 });
    expect(session.act(0, { kind: 'move', uid: soldier.uid, to: { x: 5, y: 7 } }).ok).toBe(true);
    expect(session.act(1, { kind: 'surrender' }).ok).toBe(true);
    expect(s.undoableMoves).toHaveLength(1);
    expect(session.act(0, { kind: 'undoMove', uid: soldier.uid }).ok).toBe(true);
    expect([soldier.x, soldier.y]).toEqual([5, 5]);
  });

  it('lo que propone un plan es de su equipo: no puede mover las unidades de otro', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    const enemy = newUnit(s, unitTypeNamed('Soldier'), 2, { x: 3, y: 3 });
    let reply: ActionResult | null = null;
    const session = new GameSession(s, [
      planning(function* () {
        reply = yield { kind: 'wait', uid: enemy.uid };
      }),
      passiveController(),
      passiveController(),
    ]);
    session.step();
    expect(reply).toMatchObject({ ok: false });
    expect(enemy.turnState).toBe('ready');
    expect(session.log).toEqual([{ team: 0, action: { kind: 'endTurn' } }]);
  });

  it('el dispatcher de la sesion solo vale para su partida (no para simular en una copia)', () => {
    const s = blankState();
    const session = new GameSession(s, [humanController(), passiveController()]);
    runMatch(session);
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    expect(session.dispatcher(s, 0, { kind: 'wait', uid: soldier.uid }).ok).toBe(true);
    expect(() => session.dispatcher(cloneState(s), 0, { kind: 'wait', uid: soldier.uid })).toThrow(/solo manda acciones en su partida/);
  });

  it('autopilotController cumple ya, en el turno, las ordenes permanentes (y lo apunta como del equipo)', () => {
    const s = blankState();
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'defend', at: { x: 3, y: 9 } } });
    const session = new GameSession(s, [sequence(autopilotController(), humanController()), passiveController()]);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(soldier.y).toBeGreaterThan(3);
    expect(session.log.every((entry) => entry.team === 0)).toBe(true);
    expect(isPerson(session, 0)).toBe(true);
  });

  it('screenEnd: sigue, decidida, o fuera cuando ya no juega ninguna persona; people y personStillPlays', () => {
    const s = blankState({}, [{ controller: 'human' }, { controller: 'ai' }, { controller: 'ai' }]);
    const session = new GameSession(s, [humanController(), passiveController(), passiveController()]);
    expect([people(session), personStillPlays(session), screenEnd(session, 0)]).toEqual([[0], true, null]);
    act(s, 0, { kind: 'surrender' });
    expect(personStillPlays(session)).toBe(false);
    expect(screenEnd(session, 0)).toEqual({ kind: 'out', fall: { order: 1, reason: 'surrender' } });
    s.turn = 1;
    act(s, 1, { kind: 'surrender' });
    expect(screenEnd(session, 0)).toEqual({ kind: 'decided', result: { status: 'decided', winners: [2], reason: 'surrender' } });
  });

  it('sin ninguna persona (IA contra IA) no hay pantalla que acabar: mirar desde un equipo en pie es un fallo', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }]);
    const session = new GameSession(s, [passiveController(), passiveController()]);
    expect([people(session), personStillPlays(session)]).toEqual([[], false]);
    expect(() => screenEnd(session, 0)).toThrow(/no ha caido/);
  });

  it('un controlador por equipo', () => {
    expect(() => new GameSession(blankState(), [passiveController()])).toThrow(/uno por equipo/);
  });
});

describe('pasos de turno (actions/turn.ts) con las comprobaciones de dispatch', () => {
  it('un equipo que se rinde no captura al pasar su turno', () => {
    const s = blankState({}, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    const hq = s.buildings.find((building) => building.owner === 1)!;
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, hq);
    hq.capture = { team: 0, uid: soldier.uid, left: 1 };
    act(s, 0, { kind: 'surrender' });
    const events = act(s, 0, { kind: 'endTurn' });
    expect(events.some((event) => event.kind === 'capture')).toBe(false);
    expect(hq.owner).toBe(1);
  });

  it('si lo que pasa al acabar el turno gana la partida, el turno no se pasa (ni ronda, ni dia, ni ingresos)', () => {
    const s = blankState();
    const hq = s.buildings.find((building) => building.owner === 1 && building.type === hqId())!;
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, hq);
    hq.capture = { team: 0, uid: soldier.uid, left: 1 };
    const funds = s.teams.map((team) => team.funds);
    const events = act(s, 0, { kind: 'endTurn' });
    expect(events.map((event) => event.kind)).toEqual(['capture', 'teamDefeated']);
    expect(matchResult(s)).toEqual({ status: 'decided', winners: [0], reason: 'wipeout' });
    expect([s.day, s.turn, s.turnStarted]).toEqual([1, 0, true]);
    expect(s.teams.map((team) => team.funds)).toEqual(funds);
  });

  it('tambien si la gana una orden permanente: los pasos de despues ya no se hacen', () => {
    const s = blankState();
    const hq = s.buildings.find((building) => building.owner === 1 && building.type === hqId())!;
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, hq);
    hq.capture = { team: 0, uid: soldier.uid, left: 1 };
    act(s, 0, { kind: 'giveStandingOrder', uids: [soldier.uid], order: { kind: 'capture', at: { x: hq.x, y: hq.y } } });
    const events = act(s, 0, { kind: 'endTurn' });
    expect(events.filter((event) => event.kind === 'capture')).toHaveLength(1);
    expect(events.some((event) => event.kind === 'turnEnd' || event.kind === 'newDay')).toBe(false);
    expect(matchResult(s).status).toBe('decided');
    expect([s.day, s.turn]).toEqual([1, 0]);
  });

  it('lo que captura sola una unidad al acabar el turno cuenta una vez en las estadisticas', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: null, x: 3, y: 3 });
    newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 }).life = 100;
    s.buildings.at(-1)!.capture = { team: 0, uid: s.units[0]!.uid, left: 1 };
    const events = act(s, 0, { kind: 'endTurn' });
    expect(events.filter((event) => event.kind === 'capture')).toHaveLength(1);
    expect(s.teams[0]!.stats.captured).toBe(1);
  });
});

describe('modos de juego (core/modes.ts)', () => {
  it('el orden de los turnos no admite un equipo que no esta', () => {
    expect(GAME_MODES.skirmish.turnOrder([0, 1, 2], 1)).toEqual([1, 2, 0]);
    expect(() => GAME_MODES.skirmish.turnOrder([0, 1], 5)).toThrow(/no esta en la partida/);
  });

  it('las reglas que impone el modo van por encima de las elegidas', () => {
    const s = createMatch({
      mode: 'sandbox',
      size: 12,
      settingChanges: { weather: true },
      teams: duel('human', 'ai'),
      buildings: [
        { type: hqId(), owner: 0, at: { x: 0, y: 0 } },
        { type: hqId(), owner: 1, at: { x: 11, y: 11 } },
      ],
      units: [],
      seed: 1,
    });
    expect(s.settings.weather).toBe(false);
  });
});

describe('la sesion pone al dia la vista de quien juega', () => {
  it('tras cada accion, aunque el controlador no lo pida (scripted y en serie)', () => {
    const s = blankState();
    const soldier = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 3, y: 3 });
    const seen: number[] = [];
    // Mira cuantas unidades ve y no hace nada (un controlador sin pasos).
    const looking: Controller = {
      name: 'scripted',
      playTurn: (view) => {
        seen.push(view.state.units.length);
        return passiveController().playTurn(view);
      },
    };
    // Retirar la unidad: una vista sin poner al dia la seguiria viendo.
    const retire = scriptedController(() => [{ kind: 'deleteUnit', uid: soldier.uid }]);
    runMatch(new GameSession(s, [sequence(retire, looking, humanController()), passiveController()]));
    expect(seen).toEqual([0]);
  });
});
