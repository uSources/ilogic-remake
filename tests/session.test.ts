import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMatch, loadGame } from '@core/defaultGames';
import { cloneState } from '@core/gameContent';
import { skirmishConfig } from '@core/match';
import { canMoveNow, moveRange, newUnit, reachableTiles, unitById } from '@core/rules';
import { serialize } from '@core/save';
import { aiController, controllersFor, type AiBrain } from '@core/controllers';
import {
  GameSession,
  humanController,
  passiveController,
  propose,
  remoteController,
  replayControllers,
  runMatch,
  type ActedStep,
  type Controller,
} from '@core/session';
import { GAME_MODES, type GameMode } from '@core/modes';
import { startsTurn } from '@core/actions';
import { duel } from '@core/teams';
import { seededRng } from '@core/util/random';
import { act, blankState, giveTurn, unitTypeNamed } from './helpers';
import { PLAIN_RULES } from './plainRules';
import type { GameModeId } from '@core/model';

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
    expect(steps.some((step) => step.team === 1 && startsTurn(step))).toBe(true);
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
      if (session.isAutosaveMoment(step)) saved = serialize(s);
    });
    runMatch(session);
    expect(saved).not.toBeNull();
    const loaded = loadGame(saved!)!;
    expect(loaded.turnStarted).toBe(true);
    expect(new GameSession(loaded, [humanController(), passiveController()]).step()).toEqual({ kind: 'awaitingInput', team: 0 });
    expect(session.isAutosaveMoment({ kind: 'acted', team: 1, action: { kind: 'startTurn' }, events: [] })).toBe(false);
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
      playTurn: function* (state, team) {
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
    const rng = seededRng(4);
    const session = new GameSession(s, [quitter, aiController(rng), aiController(rng)]);
    runMatch(session, { until: (state) => state.day > 4 });
    expect(session.log.some((entry) => entry.action.kind === 'undoMove')).toBe(true);
    const replay = new GameSession(start, replayControllers(start, session.log));
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

  it('la IA que mandara un limite de turno recibe sessionOnly (no pasa su turno)', () => {
    const s = blankState();
    let reply: unknown = null;
    const brain: AiBrain = (state, _rng, team, dispatcher) => {
      reply = dispatcher(state, team, { kind: 'endTurn' });
      return [][Symbol.iterator]();
    };
    const session = new GameSession(s, [aiController(seededRng(1), brain), passiveController()]);
    session.step();
    expect(reply).toEqual({ ok: false, reason: 'sessionOnly' });
    expect(session.log).toEqual([{ team: 0, action: { kind: 'endTurn' } }]);
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

/**
 * Cambia por un rato lo que fija un modo (para probar lo que ningun modo del juego usa aun) y lo
 * deja como estaba al acabar.
 */
function withMode<T>(mode: GameModeId, changes: Partial<GameMode>, run: () => T): T {
  const modes = GAME_MODES as unknown as Record<GameModeId, GameMode>;
  const original = modes[mode];
  modes[mode] = { ...original, ...changes };
  try {
    return run();
  } finally {
    modes[mode] = original;
  }
}

describe('modos de juego (core/modes.ts)', () => {
  it('los pasos de turno del modo van detras de los de todos, y por las mismas comprobaciones', () => {
    const s = blankState(PLAIN_RULES, [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }]);
    s.turnStarted = false;
    const traveler = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 2, y: 2 });
    traveler.travelTo = { x: 2, y: 20 };
    s.buildings.push({ type: 'City', owner: null, x: 9, y: 9 });
    const capturer = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 9, y: 9 });
    s.buildings.at(-1)!.capture = { team: 0, uid: capturer.uid, left: 1 };
    const other = newUnit(s, unitTypeNamed('Soldier'), 0, { x: 5, y: 12 });
    const enemy = newUnit(s, unitTypeNamed('Soldier'), 1, { x: 12, y: 5 });
    const seen: string[] = [];
    const replies: unknown[] = [];
    const result = withMode(
      s.mode,
      {
        turnPhases: {
          start: [
            {
              id: 'modeStart',
              run: (state, team, perform) => {
                // Los viajes (TURN_START_PHASES) ya han dado su paso.
                seen.push(`start: viajero en y=${unitById(state, traveler.uid)!.y}`);
                const result = perform(state, team, { kind: 'wait', uid: other.uid });
                return result.ok ? result.events : [];
              },
            },
          ],
          end: [
            {
              id: 'modeEnd',
              run: (state, team, perform) => {
                // Las capturas (TURN_END_PHASES) ya se han hecho.
                seen.push(`end: ciudad de ${String(state.buildings.at(-1)!.owner)}`);
                replies.push(perform(state, team, { kind: 'wait', uid: other.uid }));
                replies.push(perform(state, 1, { kind: 'wait', uid: enemy.uid }));
                replies.push(perform(state, 1, { kind: 'surrender' }));
                return [];
              },
            },
          ],
        },
      },
      () => {
        const started = act(s, 0, { kind: 'startTurn' });
        const ended = act(s, 0, { kind: 'endTurn' });
        return { started, ended };
      },
    );
    expect(seen[0]).not.toBe('start: viajero en y=2');
    expect(result.started.at(-1)).toMatchObject({ kind: 'wait', uid: other.uid });
    expect(seen[1]).toBe('end: ciudad de 0');
    // Lo que manda el paso pasa por validate (esa unidad ya se ha usado) y por las guardas: otro
    // equipo no actua en este turno, salvo para rendirse (anyTime).
    expect(replies).toMatchObject([{ ok: false, reason: 'spent' }, { ok: false, reason: 'notYourTurn' }, { ok: true }]);
  });

  it('un modo con su propio orden de turnos: la partida lo guarda y la sesion lo sigue', () => {
    const reversed = (teams: readonly number[]) => [...teams].reverse();
    const s = withMode('skirmish', { turnOrder: reversed }, () =>
      createMatch(skirmishConfig({ seed: 4, size: 16, teams: [{ controller: 'ai' }, { controller: 'ai' }, { controller: 'ai' }] })),
    );
    expect(s.turnOrder).toEqual([2, 1, 0]);
    expect(s.turn).toBe(2);
    const session = new GameSession(
      s,
      s.teams.map(() => passiveController()),
    );
    const started: number[] = [];
    session.subscribe((step) => startsTurn(step) && started.push(step.team));
    runMatch(session, { until: (state) => state.day > 2 });
    expect(started).toEqual([2, 1, 0, 2, 1, 0]);
  });

  it('el orden de los turnos no admite un equipo que no esta', () => {
    expect(GAME_MODES.skirmish.turnOrder([0, 1, 2], 1)).toEqual([1, 2, 0]);
    expect(() => GAME_MODES.skirmish.turnOrder([0, 1], 5)).toThrow(/no esta en la partida/);
  });

  it('las reglas que impone el modo van por encima de las elegidas', () => {
    const s = createMatch({
      mode: 'sandbox',
      size: 12,
      ruleChanges: { weather: true },
      teams: duel('human', 'ai'),
      buildings: [],
      units: [],
      diceSeed: 1,
    });
    expect(s.rules.weather).toBe(false);
  });
});
