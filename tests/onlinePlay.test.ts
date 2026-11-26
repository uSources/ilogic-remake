import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { cloneState } from '@core/gameContent';
import { skirmishConfig } from '@core/match';
import { manhattan } from '@core/geom';
import { newUnit } from '@core/measure';
import type { GameState, Pos, Unit } from '@core/model';
import { CURRENT_PROTOCOL, Room, type Outgoing, type RoomContext, type ServerMessage, type TurnTimeLeft } from '@core/net';
import { canMoveNow, moveRange, reachableTiles, unitAt, unitById } from '@core/rules';
import { ui } from '../src/hud/store';
import { mirrorSession } from '../src/net/mirrorSession';
import { RoomClient } from '../src/net/roomClient';
import { OnlinePlay, type OnlineRoom } from '../src/view3d/systems/net/onlinePlay';
import type { TimedTurn } from '../src/view3d/systems/net/turnClock';
import { TurnControls } from '../src/view3d/systems/turn/turnControls';
import { unitTypeNamed } from './helpers';
import { tokenCounter } from './sim/netClient';
import { FakeBoard, FakeEvents, FakeMarks, FakePreview, FakeSounds } from './sim/turnPorts';

/**
 * La partida por la red en la vista 3D sin red ni navegador: la sala de verdad del nucleo, el cliente
 * de la pantalla (`RoomClient`, con los mensajes directos) y el turno 3D (`TurnControls`) con puertos
 * falsos, llevado por `OnlinePlay`. La persona juega el equipo 0; el 1 lo juega la IA en el servidor.
 */

const PERSON = 0;
const FOE = 1;
const SOLDIER = unitTypeNamed('Soldier');
const context = (): RoomContext => ({ content: defaultContent(), newToken: tokenCounter() });

/** Deja acabar lo que va por promesas (las jugadas de la sala, las animaciones falsas). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** La hora de la pantalla (fija: el reloj del turno se cuenta desde ella). */
const NOW = 1_000_000;

/** Lo que hace el servidor con reloj: cada `turn` lleva lo que le queda (la sala del nucleo manda `clock: null`). */
const withClock = (message: ServerMessage, clock: TurnTimeLeft | null): ServerMessage =>
  message.kind === 'turn' && clock ? { ...message, clock } : message;

/** `clock`: el reloj que pone el servidor en cada `turn` (null: la sala no tiene reloj). */
async function onlineMatch(clock: TurnTimeLeft | null = null) {
  const config = skirmishConfig({
    seed: 21,
    size: 16,
    teams: [{ controller: 'human' }, { controller: 'ai' }],
    settingChanges: { fog: true },
  });
  const room = Room.create({ match: config }, context());
  const sent: string[] = [];
  let seq = 0;
  /** Lo que contesta la sala mientras se retiene (`hold`), hasta que se suelta (`release`): la red tarda. */
  let held: (readonly Outgoing[])[] | null = null;
  const answer = (outgoing: readonly Outgoing[]) => (held ? held.push(outgoing) : deliver(outgoing));
  const client = new RoomClient(
    {
      send: (message) => {
        seq += 1;
        sent.push(message.kind);
        answer(room.handle(PERSON, { ...message, seq }));
        return seq;
      },
      resync: () => {
        sent.push('resync');
        answer(room.handle(PERSON, { kind: 'resync' }));
      },
    },
    defaultContent(),
    {},
    () => NOW,
  );
  const deliver = (outgoing: readonly Outgoing[]) => {
    for (const { seat, message } of outgoing) if (seat === PERSON) client.receive(withClock(message, clock));
  };
  const hold = () => (held = []);
  const release = () => {
    const outgoings = held ?? [];
    held = null;
    for (const outgoing of outgoings) deliver(outgoing);
  };
  const joined = room.join({ kind: 'hello', token: room.personSeats()[0]!.token, ...CURRENT_PROTOCOL });
  if (!joined.ok) throw new Error(joined.error);
  deliver(joined.messages);
  const session = mirrorSession(cloneState(client.state!), PERSON);
  const board = new FakeBoard(session.state);
  const events = new FakeEvents(board);
  const ended: boolean[] = [];
  let ownTurns = 0;
  const clocks: (TimedTurn | null)[] = [];
  const link: OnlineRoom = { client, link: { status: 'online' }, listener: {}, close: () => undefined };
  /** Lo que suena de la conexion (lo del turno lo oye el de `TurnControls`). */
  const linkSounds = new FakeSounds();
  const online = new OnlinePlay(link, session, PERSON, {
    viewReplaced: () => controls.viewReplaced(),
    othersGoOn: () => controls.othersGoOn(),
    ownTurn: () => (ownTurns += 1),
    showClock: (turn) => clocks.push(turn),
    quit: () => undefined,
    sounds: linkSounds,
  });
  const controls = new TurnControls({
    runner: online,
    viewer: PERSON,
    marks: new FakeMarks(),
    preview: new FakePreview(),
    events,
    sounds: new FakeSounds(),
    screen: { isOnScreen: () => true },
    refresh: () => board.sync(),
    publish: () => undefined,
    onOver: () => ended.push(true),
  });
  online.listen();
  await controls.runUntilInput();
  const ownTurnCount = () => ownTurns;
  return {
    room,
    client,
    online,
    controls,
    events,
    board,
    sent,
    deliver,
    hold,
    release,
    ended,
    shown: session.state,
    ownTurns: ownTurnCount,
    clocks,
    link,
    linkSounds,
  };
}

/** Una unidad propia que aun se mueve y una casilla vacia a la que llega. */
function moverAndGoal(units: readonly Unit[], s: Parameters<typeof moveRange>[0]): { unit: Unit; goal: Pos } {
  const unit = units.find((candidate) => candidate.team === PERSON && canMoveNow(candidate));
  if (!unit) throw new Error('Sin unidad propia que mover');
  const goal = reachableTiles(moveRange(s, unit)).find((tile) => !unitAt(s, tile));
  if (!goal) throw new Error('La unidad no llega a ninguna casilla vacia');
  return { unit, goal };
}

/** Un soldado propio y una casilla vacia a su lado a la que llega (alli se le pone un enemigo, a mano en la sala). */
function soldierAndNeighbour(s: GameState): { soldier: Unit; beside: Pos } {
  const soldier = s.units.find((unit) => unit.team === PERSON && unit.type === SOLDIER.id);
  if (!soldier) throw new Error('Sin soldado propio');
  const beside = reachableTiles(moveRange(s, soldier)).find((tile) => manhattan(tile, soldier) === 1 && !unitAt(s, tile));
  if (!beside) throw new Error('El soldado no tiene al lado ninguna casilla vacia a la que llegue');
  return { soldier, beside };
}

const playedKinds = (events: FakeEvents): string[] => events.played.flat().map((event) => event.kind);

describe('la partida por la red en 3D (OnlinePlay)', () => {
  it('empieza en el turno propio, sobre una copia de la vista que es solo de la pantalla', async () => {
    const { online, controls, client, shown, ownTurns } = await onlineMatch();
    expect(controls.busy).toBe(false);
    expect(online.session.awaitingInput).toBe(PERSON);
    expect(online.session.state).toBe(shown);
    expect(shown).not.toBe(client.state);
    expect(ownTurns()).toBe(1);
    expect(ui.get().net).toEqual({ status: 'online', waiting: null });
  });

  it('mover lo decide el servidor: su eco pasa a ser la partida que se ve, en el mismo objeto', async () => {
    const { room, online, controls, events, sent, shown } = await onlineMatch();
    const { unit, goal } = moverAndGoal(shown.units, shown);
    await controls.tap(unit);
    await controls.tap(goal);
    await settle();
    expect(sent).toContain('act');
    expect(unitById(room.state, unit.uid)).toMatchObject(goal);
    expect(unitById(shown, unit.uid)).toMatchObject(goal);
    expect(online.session.state).toBe(shown);
    expect(playedKinds(events)).toContain('move');
  });

  it('el enemigo que cae se anima con su pieza: el eco no pone el tablero al dia hasta acabar', async () => {
    const { room, client, controls, events, board, shown } = await onlineMatch();
    const { soldier, beside } = soldierAndNeighbour(room.state);
    const enemy = newUnit(room.state, SOLDIER, FOE, beside);
    enemy.life = 1;
    client.resync();
    await settle();
    await controls.tap(soldier);
    await controls.tap(beside);
    await settle();
    expect(playedKinds(events)).toContain('attack');
    expect(unitById(shown, enemy.uid)).toBeUndefined();
    expect(events.piecesWhenPlayed.at(-1)?.has(enemy.uid)).toBe(true);
    expect(board.pieces.has(enemy.uid)).toBe(false);
  });

  it('la vista de un resync que llega detras de una accion no la deshace en la pantalla', async () => {
    const { online, client, hold, release, shown } = await onlineMatch();
    const { unit, goal } = moverAndGoal(shown.units, shown);
    hold();
    // La vista que pidio un rechazo de antes sale de la sala antes que la respuesta a la accion.
    client.resync();
    const reply = online.act({ kind: 'move', uid: unit.uid, to: goal });
    release();
    expect((await reply).ok).toBe(true);
    await settle();
    expect(unitById(shown, unit.uid)).toMatchObject(goal);
  });

  it('lo que no vale con lo que sabe el equipo se contesta aqui, sin preguntar a la sala', async () => {
    const { online, sent } = await onlineMatch();
    const before = sent.length;
    expect(await online.act({ kind: 'wait', uid: 9999 })).toEqual({ ok: false, notice: 'missing' });
    expect(sent.length).toBe(before);
  });

  it('al acabar el turno la IA juega en el servidor: su lote se anima y vuelve a tocar, ya en el dia siguiente', async () => {
    const { controls, online, events, sent, shown, ownTurns } = await onlineMatch();
    controls.endTurn();
    await settle();
    expect(sent).toContain('endTurn');
    expect(playedKinds(events)).toContain('turnStart');
    expect(shown.day).toBe(2);
    expect(online.session.awaitingInput).toBe(PERSON);
    expect(controls.busy).toBe(false);
    expect(ownTurns()).toBe(2);
  });

  it('si la sala acaba el turno propio (se acabo el tiempo), se suelta lo elegido y se anima a los demas', async () => {
    const { room, controls, online, events, deliver, shown } = await onlineMatch();
    const { unit } = moverAndGoal(shown.units, shown);
    await controls.tap(unit);
    expect(controls.selectedUnits()).toHaveLength(1);
    deliver(room.endTurnOf(PERSON));
    await settle();
    expect(controls.selectedUnits()).toEqual([]);
    // Dos lotes seguidos: el fin del turno propio (que ya lo pasa) y el de la IA hasta el dia siguiente.
    expect(events.played.length).toBeGreaterThanOrEqual(2);
    expect(playedKinds(events)).toContain('turnEnd');
    expect(playedKinds(events)).toContain('turnStart');
    expect(shown.day).toBe(2);
    expect(online.session.awaitingInput).toBe(PERSON);
    expect(controls.busy).toBe(false);
  });

  it('si se acaba el tiempo dos turnos seguidos, las dos veces se anima a los demas y vuelve a tocar', async () => {
    const { room, controls, online, deliver, shown, ownTurns } = await onlineMatch();
    for (const nextDay of [2, 3]) {
      deliver(room.endTurnOf(PERSON));
      await settle();
      expect(shown.day).toBe(nextDay);
      expect(online.session.awaitingInput).toBe(PERSON);
      expect(controls.busy).toBe(false);
    }
    expect(ownTurns()).toBe(3);
  });

  it('con reloj, cada turno que se ve lo cuenta desde que llego; se quita al acabar el turno propio', async () => {
    const { controls, clocks } = await onlineMatch({ leftMs: 90_000, totalMs: 120_000 });
    const deadline = { endsAt: NOW + 90_000, totalMs: 120_000 };
    expect(clocks).toEqual([{ team: PERSON, day: 1, deadline }]);
    controls.endTurn();
    await settle();
    // Al acabarlo, ninguno; el de la IA no lleva (no se la espera) y el siguiente propio, el suyo.
    expect(clocks.slice(1)).toEqual([null, { team: PERSON, day: 2, deadline }]);
  });

  it('si se le acaba el tiempo, el reloj se quita en cuanto la partida sigue sin el, y vuelve con el turno siguiente', async () => {
    const { room, deliver, clocks } = await onlineMatch({ leftMs: 0, totalMs: 120_000 });
    deliver(room.endTurnOf(PERSON));
    await settle();
    expect(clocks.slice(1).map((turn) => turn && turn.day)).toEqual([null, 2]);
  });

  it('sin reloj, ninguno: solo se dice que no corre', async () => {
    const { controls, clocks } = await onlineMatch();
    controls.endTurn();
    await settle();
    expect(clocks.every((turn) => turn === null)).toBe(true);
  });

  it('rendirse sin otra persona que juegue acaba la sala: llega su final y la pantalla lo enseña', async () => {
    const { online, ended, room } = await onlineMatch();
    expect((await online.act({ kind: 'surrender' })).ok).toBe(true);
    await settle();
    expect(room.status).toBe('ended');
    expect(ended).toEqual([true]);
  });

  it('la conexion que va bien no suena; si la sala ya no deja seguir, suena en el acto', async () => {
    const { online, link, linkSounds } = await onlineMatch();
    link.listener.onStatus?.('online');
    expect(linkSounds.heard).toEqual([]);

    link.listener.onStatus?.('closed');
    link.listener.onClosed?.('replaced');
    expect(linkSounds.heard).toEqual(['net_lost']);
    expect(ui.get().net?.status).toBe('offline');
    online.close();
  });
});
