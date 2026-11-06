import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMatch, loadGame } from '@core/defaultGames';
import { cloneState } from '@core/gameContent';
import { skirmishConfig } from '@core/match';
import { newUnit, unitById } from '@core/rules';
import { serialize } from '@core/save';
import {
  aiController,
  controllersFor,
  GameSession,
  humanController,
  isAutosaveMoment,
  passiveController,
  replayControllers,
  runMatch,
  type ActedStep,
} from '@core/session';
import { duel } from '@core/teams';
import { seededRng } from '@core/util/random';
import { act, blankState, unitTypeNamed } from './helpers';

const fixture = (name: string) => readFileSync(`tests/fixtures/saves/${name}.json`, 'utf8');

/** Una sesion de la persona (equipo 0) contra la IA, con lo que se haga apuntado. */
function personVsAi(s: ReturnType<typeof blankState>) {
  const session = new GameSession(s, [humanController(), aiController(seededRng(3))]);
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
    expect(steps.some((step) => step.team === 1 && step.action.kind === 'startTurn')).toBe(true);
    expect(s.day).toBe(2);
  });

  it('K3: al cargar un autoguardado del formato 5, el viaje de ese turno avanza', () => {
    const s = loadGame(fixture('skirmish-v5'))!;
    const before = { ...unitById(s, 1)! };
    const { session, steps } = personVsAi(s);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    const travel = steps[0]!.events.filter((event) => 'uid' in event && event.uid === 1);
    expect(travel.length).toBeGreaterThan(0);
    const after = unitById(s, 1)!;
    expect(after.turnState !== 'ready' || after.travelTo === undefined || after.x !== before.x || after.y !== before.y).toBe(true);
  });

  it('el autoguardado es al empezar el turno de la persona: al cargarlo, nada se repite', () => {
    const s = createMatch(skirmishConfig({ seed: 4, size: 20, teams: duel('human', 'ai') }));
    const { session } = personVsAi(s);
    let saved: string | null = null;
    session.subscribe((step) => {
      if (isAutosaveMoment(s, step)) saved = serialize(s);
    });
    runMatch(session);
    expect(saved).not.toBeNull();
    const loaded = loadGame(saved!)!;
    expect(loaded.turnStarted).toBe(true);
    expect(new GameSession(loaded, [humanController(), passiveController()]).step()).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(isAutosaveMoment(s, { kind: 'acted', team: 1, action: { kind: 'startTurn' }, events: [] })).toBe(false);
  });

  it('el registro se repite igual desde la partida de antes (los dados van en la partida)', () => {
    const s = createMatch(skirmishConfig({ seed: 6, size: 16, teams: duel('ai', 'ai') }));
    const start = cloneState(s);
    const session = new GameSession(s, controllersFor(s, seededRng(9)));
    runMatch(session, { until: (state) => state.day > 4 });
    const replay = new GameSession(start, replayControllers(start, session.log));
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
    const session = new GameSession(s, controllersFor(s, seededRng(1)));
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    session.finishInput(0);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 1 });
    expect(session.act(0, { kind: 'endTurn' })).toEqual({ ok: false, reason: 'notYourTurn' });
    session.finishInput(1);
    expect(runMatch(session)).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(s.day).toBe(2);
  });

  it('un controlador por equipo', () => {
    expect(() => new GameSession(blankState(), [passiveController()])).toThrow(/uno por equipo/);
  });
});
