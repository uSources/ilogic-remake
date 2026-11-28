import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { GameSession, humanController, passiveController, type Controller } from '@core/session';
import type { GameEvent, GameState } from '@core/model';
import { shownTeamNumber, teamState } from '@core/teams';
import { ui } from '../src/hud/store';
import { HotSeat, type ScreenPass } from '../src/view3d/systems/turn/hotSeat';
import { localRunner } from '../src/view3d/systems/turn/matchRunner';
import { TurnControls } from '../src/view3d/systems/turn/turnControls';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';
import { FakeBoard, FakeEvents, FakeMarks, FakePreview, FakeSounds } from './sim/turnPorts';

/** El turno 3D sin navegador: las marcas, los sucesos y los sonidos son puertos falsos que apuntan lo que se les pide. */

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');

const kindsOf = (events: readonly GameEvent[]): string[] => events.map((event) => event.kind);
/** Deja acabar lo que el turno lanza sin esperar (esperar implicito, deshacer). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Una partida vacia con un soldado propio en (5,5), ya en el turno de la persona. */
async function myTurn() {
  const s = blankState();
  const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
  const seat = new HotSeat(PLAYER, () => {});
  const turn = turnOnScreen(s, [humanController(), passiveController()], seat);
  await turn.controls.runUntilInput();
  return { s, soldier, ...turn };
}

/** El turno 3D de la partida `s` en una pantalla de prueba, con esos controladores y quien mira en ella (`seat`). */
function turnOnScreen(s: GameState, controllers: Controller[], seat: HotSeat) {
  const marks = new FakeMarks();
  const board = new FakeBoard(s);
  const events = new FakeEvents(board);
  const sounds = new FakeSounds();
  const preview = new FakePreview();
  const session = new GameSession(s, controllers);
  const controls = new TurnControls({
    runner: localRunner(session, seat),
    get viewer() {
      return seat.team;
    },
    marks,
    preview,
    events,
    sounds,
    // Toda la partida se ve en la pantalla de prueba.
    screen: { isOnScreen: () => true },
    refresh: () => board.sync(),
    publish: () => {},
    onOver: () => {},
  });
  return { marks, preview, events, sounds, board, controls };
}

describe('turno 3D con puertos', () => {
  it('tocar una unidad propia la elige: enseña a donde llega, la marca y suena', async () => {
    const { soldier, marks, sounds, controls } = await myTurn();
    await controls.tap(soldier);
    expect(marks.selected).toMatchObject({ x: 5, y: 5 });
    expect(marks.reach).toContainEqual({ x: 6, y: 5 });
    expect(sounds.heard).toContain('unit_select');
  });

  it('tocar una casilla azul la mueve y, sin nada mas que hacer alli, espera sola (sin menu)', async () => {
    const { soldier, marks, events, controls } = await myTurn();
    await controls.tap(soldier);
    await controls.tap({ x: 6, y: 5 });
    await settle();
    expect(events.played.map(kindsOf)).toContainEqual(expect.arrayContaining(['move']));
    expect(soldier).toMatchObject({ x: 6, y: 5, turnState: 'done' });
    expect(controls.menu()).toBeNull();
    expect(marks.selected).toBeNull();
  });

  it('tras moverse, si aun puede atacar sigue elegida; dejarla (tocar fuera) es esperar', async () => {
    const { s, soldier, controls } = await myTurn();
    newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    await controls.tap(soldier);
    await controls.tap({ x: 6, y: 5 });
    expect(controls.selectedUnits()).toEqual([soldier]);
    expect(soldier.turnState).toBe('moved');
    await controls.tap({ x: 20, y: 20 });
    await settle();
    expect(soldier.turnState).toBe('done');
    expect(controls.selectedUnits()).toEqual([]);
  });

  it('mientras se ven los sucesos el turno esta ocupado y no atiende', async () => {
    const { soldier, events, controls } = await myTurn();
    await controls.tap(soldier);
    events.hold = true;
    const moving = controls.tap({ x: 6, y: 5 });
    expect(controls.busy).toBe(true);
    await controls.tap({ x: 5, y: 7 });
    expect(controls.cancel()).toBe(true);
    events.hold = false;
    events.release();
    await moving;
    await settle();
    expect(controls.busy).toBe(false);
    expect(soldier).toMatchObject({ x: 6, y: 5 });
  });

  it('Ctrl+Z deshace el ultimo movimiento aunque ya haya esperado, y la vuelve a elegir', async () => {
    const { soldier, marks, controls } = await myTurn();
    await controls.tap(soldier);
    await controls.tap({ x: 6, y: 5 });
    await settle();
    controls.undoLastMove();
    await settle();
    expect(soldier).toMatchObject({ x: 5, y: 5 });
    expect(marks.reach).toContainEqual({ x: 6, y: 5 });
  });

  it('Esc con la unidad aun elegida tras moverla deshace el movimiento', async () => {
    const { s, soldier, controls } = await myTurn();
    newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    await controls.tap(soldier);
    await controls.tap({ x: 6, y: 5 });
    expect(controls.cancel()).toBe(true);
    await settle();
    expect(soldier).toMatchObject({ x: 5, y: 5 });
  });

  it('Esc despues de elegir quita las marcas; sin nada elegido dice que no habia nada', async () => {
    const { soldier, marks, controls } = await myTurn();
    await controls.tap(soldier);
    expect(controls.cancel()).toBe(true);
    expect(marks.reach).toEqual([]);
    expect(marks.selected).toBeNull();
    expect(controls.cancel()).toBe(false);
  });

  it('un enemigo al alcance sale en rojo y tocarlo mueve y ataca: dos tandas de sucesos', async () => {
    const { s, events, marks, controls } = await myTurn();
    const tank = newUnit(s, TANK, PLAYER, { x: 10, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 10, y: 13 });
    await controls.tap(tank);
    expect(marks.targets).toContainEqual(expect.objectContaining({ x: 10, y: 13 }));
    await controls.tap({ x: 10, y: 13 });
    expect(events.played.map(kindsOf)).toEqual([expect.arrayContaining(['move']), expect.arrayContaining(['attack'])]);
  });

  it('el enemigo que cae se anima con su pieza: el tablero se pone al dia al acabar', async () => {
    const { s, soldier, events, board, controls } = await myTurn();
    const enemy = newUnit(s, SOLDIER, ENEMY, { x: 6, y: 5 });
    enemy.life = 1;
    await controls.tap(soldier);
    await controls.tap(enemy);
    expect(events.played.flat()).toContainEqual(expect.objectContaining({ kind: 'attack', killed: true }));
    expect(events.piecesWhenPlayed.at(-1)?.has(enemy.uid)).toBe(true);
    expect(board.pieces.has(enemy.uid)).toBe(false);
  });

  it('la propia que cae al contraatacarle tambien sigue en el tablero mientras se anima', async () => {
    const { s, soldier, events, controls } = await myTurn();
    soldier.life = 5;
    const enemy = newUnit(s, SOLDIER, ENEMY, { x: 6, y: 5 });
    await controls.tap(soldier);
    await controls.tap(enemy);
    expect(events.played.flat()).toContainEqual(expect.objectContaining({ kind: 'attack', attackerKilled: true }));
    expect(events.piecesWhenPlayed.at(-1)?.has(soldier.uid)).toBe(true);
  });
});

describe('a donde llegaria (fantasma y flecha)', () => {
  it('sin unidad elegida no se enseña nada', async () => {
    const { preview, controls } = await myTurn();
    controls.hover({ x: 6, y: 5 });
    expect(preview.look).toBeNull();
  });

  it('señalar una casilla a su alcance enseña el camino hasta alli', async () => {
    const { soldier, preview, controls } = await myTurn();
    await controls.tap(soldier);
    controls.hover({ x: 7, y: 5 });
    expect(preview.look).toEqual({
      uid: soldier.uid,
      path: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 7, y: 5 },
      ],
    });
  });

  it('el camino sigue al cursor, y la unidad va por donde se ha trazado', async () => {
    const { soldier, preview, events, controls } = await myTurn();
    await controls.tap(soldier);
    controls.hover({ x: 5, y: 6 });
    controls.hover({ x: 6, y: 6 });
    controls.hover({ x: 6, y: 5 });
    expect(preview.look?.path).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ]);
    await controls.tap({ x: 6, y: 5 });
    const move = events.played.flat().find((event) => event.kind === 'move');
    expect(move).toMatchObject({
      path: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
      ],
    });
  });

  it('volver sobre el camino lo recorta; volver a la unidad no enseña nada', async () => {
    const { soldier, preview, controls } = await myTurn();
    await controls.tap(soldier);
    controls.hover({ x: 6, y: 5 });
    controls.hover({ x: 7, y: 5 });
    controls.hover({ x: 6, y: 5 });
    expect(preview.look?.path).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    controls.hover({ x: 5, y: 5 });
    expect(preview.look).toBeNull();
  });

  it('fuera de su alcance no se enseña nada', async () => {
    const { soldier, preview, controls } = await myTurn();
    await controls.tap(soldier);
    controls.hover({ x: 20, y: 20 });
    expect(preview.look).toBeNull();
  });

  it('sobre un enemigo al que llega, el camino acaba donde dispararia', async () => {
    const { s, preview, controls } = await myTurn();
    const tank = newUnit(s, TANK, PLAYER, { x: 10, y: 10 });
    newUnit(s, SOLDIER, ENEMY, { x: 10, y: 13 });
    await controls.tap(tank);
    controls.hover({ x: 10, y: 13 });
    expect(preview.look?.path.at(-1)).toEqual(controls.forecastAt({ x: 10, y: 13 })?.from);
    expect(preview.look?.path.at(-1)).not.toEqual({ x: 10, y: 10 });
  });

  it('al moverse o deshacer lo elegido, el fantasma se quita', async () => {
    const { soldier, preview, controls } = await myTurn();
    await controls.tap(soldier);
    controls.hover({ x: 6, y: 5 });
    controls.cancel();
    expect(preview.look).toBeNull();
  });
});

describe('el clic que acierta, las fichas y la rueda', () => {
  it('elegida en campo abierto no salen fichas: todo se hace tocando el tablero', async () => {
    const { soldier, controls } = await myTurn();
    await controls.tap(soldier);
    expect(controls.menu()).toBeNull();
  });

  it('encima de un edificio ajeno, la ficha de capturar (Intro la usa)', async () => {
    const { s, soldier, controls } = await myTurn();
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    await controls.tap(soldier);
    expect(controls.menu()?.kind).toBe('chips');
    expect(controls.menu()?.items.map((item) => item.id)).toEqual(['capture']);
    controls.acceptMenu();
    await settle();
    expect(soldier.turnState).toBe('done');
  });

  it('con enemigos a tiro, «Atacar» dice cuantos y «Capturar» sale apagada con el porque', async () => {
    const { s, soldier, controls } = await myTurn();
    newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    await controls.tap(soldier);
    const items = controls.menu()?.items ?? [];
    expect(items.map((item) => [item.id, !!item.disabled, item.hint])).toEqual([
      ['attack', false, '2 al alcance'],
      ['capture', true, 'no hay edificio aquí'],
    ]);
    expect(controls.menu()?.selected).toBe(0);
  });

  it('«Atacar»: ← → pasan de un enemigo a otro con su prevision e Intro ataca al señalado', async () => {
    const { s, soldier, events, controls } = await myTurn();
    const near = newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    const far = newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    await controls.tap(soldier);
    controls.acceptMenu();
    expect(controls.isPickingTarget).toBe(true);
    expect(controls.menu()).toMatchObject({ kind: 'prompt', title: 'Elige a quién atacar' });
    expect(controls.menu()?.items.map((item) => item.id)).toEqual(['attack', 'nextTarget', 'back']);
    expect(controls.forecastAt(null)?.target.uid).toBe(near.uid);
    controls.targetCommand({ kind: 'move', dx: 1, dy: 0 });
    expect(controls.forecastAt(null)?.target.uid).toBe(far.uid);
    controls.targetCommand({ kind: 'ok', repeat: false });
    await settle();
    const attacks = events.played.flat().filter((event) => event.kind === 'attack');
    expect(attacks).toEqual([expect.objectContaining({ target: far.uid })]);
    expect(controls.isPickingTarget).toBe(false);
  });

  it('eligiendo a quien atacar, Esc o tocar fuera de los enemigos vuelve a la unidad sin atacar', async () => {
    const { s, soldier, events, controls } = await myTurn();
    newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    await controls.tap(soldier);
    controls.acceptMenu();
    expect(controls.menu()?.items.map((item) => item.id)).toEqual(['attack', 'back']);
    controls.targetCommand({ kind: 'back' });
    expect(controls.menu()?.kind).toBe('chips');
    controls.acceptMenu();
    await controls.tap({ x: 20, y: 20 });
    expect(controls.menu()?.kind).toBe('chips');
    expect(events.played).toEqual([]);
  });

  it('eligiendo a quien atacar, tocar un enemigo a tiro le ataca', async () => {
    const { s, soldier, events, controls } = await myTurn();
    newUnit(s, SOLDIER, ENEMY, { x: 7, y: 5 });
    const far = newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    await controls.tap(soldier);
    controls.acceptMenu();
    await controls.tap(far);
    const attacks = events.played.flat().filter((event) => event.kind === 'attack');
    expect(attacks).toEqual([expect.objectContaining({ target: far.uid })]);
  });

  it('la rueda (clic derecho en la unidad): esperar, ordenes y disolver al final; sin moverse no hay deshacer', async () => {
    const { soldier, controls } = await myTurn();
    controls.context(soldier);
    expect(controls.menu()?.kind).toBe('radial');
    const ids = controls.menu()?.items.map((item) => item.id) ?? [];
    expect(ids[0]).toBe('wait');
    expect(ids).toContain('orderToDefend');
    expect(ids).not.toContain('undo');
    expect(ids.at(-1)).toBe('delete');
  });

  it('tocar fuera o Esc cierra la rueda y la unidad sigue elegida', async () => {
    const { soldier, controls } = await myTurn();
    controls.context(soldier);
    await controls.tap({ x: 9, y: 9 });
    expect(controls.menu()).toBeNull();
    expect(controls.selectedUnits()).toEqual([soldier]);
    controls.context(soldier);
    expect(controls.cancel()).toBe(true);
    expect(controls.selectedUnits()).toEqual([soldier]);
  });

  it('clic derecho en otra casilla con algo elegido: la orden que tiene sentido alli', async () => {
    const { s, soldier, controls } = await myTurn();
    s.buildings.push({ type: 'City', owner: null, x: 12, y: 5, capture: null });
    await controls.tap(soldier);
    controls.context({ x: 9, y: 5 });
    await settle();
    expect(soldier.standingOrder).toEqual({ kind: 'defend', at: { x: 9, y: 5 } });
    controls.context({ x: 12, y: 5 });
    await settle();
    expect(soldier.standingOrder).toEqual({ kind: 'capture', at: { x: 12, y: 5 } });
  });

  it('tocar la propia unidad la suelta', async () => {
    const { soldier, marks, controls } = await myTurn();
    await controls.tap(soldier);
    await controls.tap(soldier);
    expect(marks.selected).toBeNull();
    expect(controls.menu()).toBeNull();
  });

  it('con una elegida, tocar otra propia elige la otra', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const other = newUnit(s, SOLDIER, PLAYER, { x: 20, y: 20 });
    await controls.tap(soldier);
    await controls.tap(other);
    expect(marks.selected).toMatchObject({ x: 20, y: 20 });
  });

  it('tocar una casilla lejos le da la orden de ir alli y da ya el primer paso', async () => {
    const { soldier, events, controls } = await myTurn();
    await controls.tap(soldier);
    await controls.tap({ x: 20, y: 5 });
    await settle();
    expect(soldier.standingOrder).toEqual({ kind: 'goto', at: { x: 20, y: 5 } });
    expect(events.played.map(kindsOf)).toContainEqual(['move']);
    expect(soldier.x).toBeGreaterThan(5);
    expect(soldier.turnState).toBe('done');
    expect(controls.selectedUnits()).toEqual([]);
  });

  it('tocar un edificio ajeno a su alcance va y empieza a capturarlo', async () => {
    const { s, soldier, events, controls } = await myTurn();
    s.buildings.push({ type: 'City', owner: null, x: 7, y: 5, capture: null });
    await controls.tap(soldier);
    await controls.tap({ x: 7, y: 5 });
    expect(events.played.map(kindsOf)).toEqual([expect.arrayContaining(['move']), expect.arrayContaining(['capture'])]);
    expect(soldier).toMatchObject({ x: 7, y: 5 });
  });

  it('esperar desde la rueda la deja hecha y nada queda elegido', async () => {
    const { soldier, marks, controls } = await myTurn();
    controls.context(soldier);
    controls.pickMenu(controls.menu()!.items.findIndex((item) => item.id === 'wait'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(soldier.turnState).toBe('done');
    expect(marks.selected).toBeNull();
  });

  it('tocar un transporte suyo al que llega: sube', async () => {
    const { s, soldier, events, controls } = await myTurn();
    const transport = newUnit(s, unitTypeNamed('Transport'), PLAYER, { x: 7, y: 5 });
    await controls.tap(soldier);
    await controls.tap(transport);
    expect(events.played.map(kindsOf)).toContainEqual(expect.arrayContaining(['load']));
    expect(soldier.carrier).toBe(transport.uid);
  });

  it('desembarcar: la ficha del transporte lo ofrece y se elige la casilla', async () => {
    const { s, soldier, controls } = await myTurn();
    const transport = newUnit(s, unitTypeNamed('Transport'), PLAYER, { x: 7, y: 5 });
    await controls.tap(soldier);
    await controls.tap(transport);
    await controls.tap(transport);
    expect(controls.menu()?.kind).toBe('chips');
    const unload = controls.menu()!.items.findIndex((item) => item.id === 'unload');
    expect(unload).toBeGreaterThanOrEqual(0);
    controls.pickMenu(unload);
    expect(controls.menu()?.title).toContain('Soldado');
    await controls.tap({ x: 7, y: 6 });
    expect(soldier.carrier).toBeNull();
    expect(soldier).toMatchObject({ x: 7, y: 6 });
  });
});

const shiftClick = { shift: true, ctrl: false, count: 1 };
const doubleClick = { shift: false, ctrl: false, count: 2 };

describe('elegir varias', () => {
  it('Mayusculas + clic suma unidades: el grupo lleva un aro en cada una y su rueda (ordenes, escuadra)', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const other = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 7 });
    await controls.tap(soldier);
    await controls.tap(other, shiftClick);
    expect(marks.group).toHaveLength(2);
    expect(marks.selected).toBeNull();
    expect(controls.menu()).toBeNull();
    controls.context(other);
    expect(controls.menu()?.kind).toBe('radial');
    expect(controls.menu()?.items.map((item) => item.id)).toContain('squadForm');
    controls.cancel();
    await controls.tap(other, shiftClick);
    expect(marks.group).toEqual([]);
    expect(marks.selected).toMatchObject({ x: 5, y: 5 });
  });

  it('doble clic elige todas las de ese tipo que se ven', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    newUnit(s, SOLDIER, PLAYER, { x: 9, y: 9 });
    newUnit(s, TANK, PLAYER, { x: 12, y: 12 });
    await controls.tap(soldier);
    await controls.tap(soldier, doubleClick);
    expect(marks.group).toHaveLength(2);
  });

  it('el recuadro elige las de dentro; con Mayusculas, las suma', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 6, y: 7 });
    const third = newUnit(s, SOLDIER, PLAYER, { x: 9, y: 9 });
    controls.selectBox([soldier, second], false);
    expect(marks.group).toHaveLength(2);
    controls.selectBox([third], true);
    expect(marks.group).toHaveLength(3);
  });

  it('un clic con el grupo las lleva hacia alli, y siguen elegidas', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 6 });
    controls.selectBox([soldier, second], false);
    await controls.tap({ x: 8, y: 5 });
    expect(soldier.x + second.x).toBeGreaterThan(10);
    expect(marks.group).toHaveLength(2);
  });

  it('un enemigo con el grupo: le atacan las que llegan', async () => {
    const { s, soldier, events, controls } = await myTurn();
    const tank = newUnit(s, TANK, PLAYER, { x: 6, y: 6 });
    const enemy = newUnit(s, SOLDIER, ENEMY, { x: 6, y: 8 });
    controls.selectBox([soldier, tank], false);
    await controls.tap(enemy);
    const attacks = events.played.flat().filter((event) => event.kind === 'attack');
    expect(attacks.length).toBeGreaterThanOrEqual(1);
  });

  it('Esc suelta el grupo', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 6 });
    controls.selectBox([soldier, second], false);
    expect(controls.cancel()).toBe(true);
    expect(marks.group).toEqual([]);
  });
});

const pick = (controls: { menu(): { items: { id: string }[] } | null; pickMenu(index: number): void }, id: string) =>
  controls.pickMenu(controls.menu()!.items.findIndex((item) => item.id === id));

describe('ordenes y escuadras', () => {
  it('orden desde la rueda: se elige la casilla y la unidad la lleva', async () => {
    const { soldier, controls } = await myTurn();
    controls.context(soldier);
    pick(controls, 'orderToDefend');
    expect(controls.menu()?.title).toContain('casilla');
    await controls.tap({ x: 9, y: 5 });
    expect(soldier.standingOrder).toEqual({ kind: 'defend', at: { x: 9, y: 5 } });
    expect(controls.selectedUnits()).toEqual([soldier]);
  });

  it('cancelar la orden la quita', async () => {
    const { soldier, controls } = await myTurn();
    controls.context(soldier);
    pick(controls, 'orderToDefend');
    await controls.tap({ x: 9, y: 5 });
    controls.context(soldier);
    pick(controls, 'cancelOrder');
    await settle();
    expect(soldier.standingOrder).toBeUndefined();
  });

  it('las teclas de orden van a lo elegido; Esc vuelve a lo elegido sin dar la orden', async () => {
    const { soldier, controls } = await myTurn();
    await controls.tap(soldier);
    controls.orderKey('capture');
    expect(controls.cancel()).toBe(true);
    expect(soldier.standingOrder).toBeUndefined();
    expect(controls.selectedUnits()).toEqual([soldier]);
  });

  it('formar escuadra con un grupo, y elegirla desde la bandeja', async () => {
    const { s, soldier, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 7 });
    controls.selectBox([soldier, second], false);
    controls.context(second);
    pick(controls, 'squadForm');
    await settle();
    expect(soldier.squad).not.toBeNull();
    expect(second.squad).toBe(soldier.squad);
    controls.cancel();
    controls.selectSquad(soldier.squad!);
    expect(controls.selectedUnits()).toHaveLength(2);
  });

  it('Ctrl + numero hace el grupo de esa tecla; el numero solo lo elige, y dos veces dice adonde mirar', async () => {
    const { s, soldier, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 7 });
    controls.selectBox([soldier, second], false);
    await controls.groupKey(3, 'set', 0);
    controls.cancel();
    expect(controls.selectedUnits()).toEqual([]);
    expect(await controls.groupKey(3, 'select', 1000)).toBeNull();
    expect(controls.selectedUnits()).toHaveLength(2);
    expect(await controls.groupKey(3, 'select', 1100)).not.toBeNull();
  });

  it('con «Elegir varias», cada toque en una unidad la suma', async () => {
    const { s, soldier, marks, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 7 });
    controls.toggleAdding();
    await controls.tap(soldier);
    await controls.tap(second);
    expect(marks.group).toHaveLength(2);
  });
});

describe('comprar en la lista', () => {
  /** Mi turno con una fabrica propia en (3,3) y `funds` de dinero. */
  async function withFactory(funds: number) {
    const turn = await myTurn();
    turn.s.buildings.push({ type: 'Factory', owner: PLAYER, x: 3, y: 3, capture: null });
    teamState(turn.s, PLAYER).funds = funds;
    return turn;
  }
  const boughtCar = (s: GameState) => s.units.some((unit) => unit.type === 'Car' && unit.x === 3 && unit.y === 3);

  it('tocar una fabrica propia abre la lista (sin «Cancelar»); un toque compra y tocar fuera cierra', async () => {
    const { s, controls } = await withFactory(5000);
    await controls.tap({ x: 3, y: 3 });
    const menu = controls.menu();
    expect(menu?.kind).toBe('buy');
    expect(controls.isBuying).toBe(true);
    expect(menu?.items.map((item) => item.id)).not.toContain('cancel');
    await controls.tap({ x: 9, y: 9 });
    expect(controls.menu()).toBeNull();
    await controls.tap({ x: 3, y: 3 });
    pick(controls, 'buyCar');
    await settle();
    expect(boughtCar(s)).toBe(true);
  });

  it('arriba, lo que tienes; señalada, la primera que te llega', async () => {
    const { controls } = await withFactory(5000);
    await controls.tap({ x: 3, y: 3 });
    const menu = controls.menu();
    expect(menu?.subtitle).toBe('5000');
    expect(menu?.items[menu.selected]?.id).toBe('buyCar');
  });

  it('las flechas señalan sin pasar de la primera ni de la ultima, e Intro compra la señalada', async () => {
    const { s, controls } = await withFactory(5000);
    await controls.tap({ x: 3, y: 3 });
    const count = controls.menu()?.items.length ?? 0;
    for (let press = 0; press <= count; press++) controls.stepBuy(1);
    expect(controls.menu()?.selected).toBe(count - 1);
    for (let press = 0; press <= count; press++) controls.stepBuy(-1);
    expect(controls.menu()?.selected).toBe(0);
    controls.stepBuy(controls.menu()?.items.findIndex((item) => item.id === 'buyCar') ?? 0);
    controls.acceptMenu();
    await settle();
    expect(boughtCar(s)).toBe(true);
    expect(controls.isBuying).toBe(false);
  });

  it('Intro en una que no te llega no compra: suena que no y la lista sigue abierta', async () => {
    const { s, controls, sounds } = await withFactory(5000);
    await controls.tap({ x: 3, y: 3 });
    controls.stepBuy(-2);
    expect(controls.menu()?.items[controls.menu()?.selected ?? 0]?.disabled).toBe(true);
    controls.acceptMenu();
    await settle();
    expect(sounds.heard).toContain('buy_denied');
    expect(s.units.filter((unit) => unit.team === PLAYER)).toHaveLength(1);
    expect(controls.isBuying).toBe(true);
  });
});

describe('esperar sola al soltar (opcion)', () => {
  it('apagada, la unidad movida no espera sola: sigue elegida y dejarla tampoco la hace esperar', async () => {
    const { settings } = await import('../src/settings');
    const before = settings.autoWait;
    settings.autoWait = false;
    try {
      const { soldier, controls } = await myTurn();
      await controls.tap(soldier);
      await controls.tap({ x: 6, y: 5 });
      await settle();
      expect(soldier.turnState).toBe('moved');
      expect(controls.selectedUnits()).toEqual([soldier]);
      await controls.tap({ x: 20, y: 20 });
      await settle();
      expect(soldier.turnState).toBe('moved');
    } finally {
      settings.autoWait = before;
    }
  });
});

describe('la rueda tambien elige', () => {
  it('una unidad de escuadra ofrece «Elegir su escuadra» y la elige entera', async () => {
    const { s, soldier, controls } = await myTurn();
    const second = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 7 });
    controls.selectBox([soldier, second], false);
    controls.context(second);
    pick(controls, 'squadForm');
    await settle();
    await controls.tap(soldier);
    expect(controls.selectedUnits()).toEqual([soldier]);
    controls.context(soldier);
    pick(controls, 'squadSelect');
    expect(controls.selectedUnits()).toHaveLength(2);
  });
});

describe('el tablero se lee: hasta donde ataca y el visor', () => {
  it('al elegirla, el borde rojo marca hasta donde ataca, fuera de su alcance azul', async () => {
    const { soldier, marks, controls } = await myTurn();
    await controls.tap(soldier);
    expect(marks.attackReach.length).toBeGreaterThan(0);
    const inReach = marks.attackReach.filter((pos) => marks.reach.some((tile) => tile.x === pos.x && tile.y === pos.y));
    expect(inReach).toEqual([]);
    controls.cancel();
    expect(marks.attackReach).toEqual([]);
  });

  it('la artilleria apunta en arco a un enemigo a tiro; de cerca no hay visor', async () => {
    const { s, preview, controls } = await myTurn();
    const gun = newUnit(s, unitTypeNamed('Artillery'), PLAYER, { x: 10, y: 10 });
    const far = newUnit(s, SOLDIER, ENEMY, { x: 10, y: 13 });
    await controls.tap(gun);
    controls.hover(far);
    expect(preview.shot).toEqual({ from: { x: 10, y: 10 }, to: { x: 10, y: 13 } });
    controls.hover({ x: 11, y: 10 });
    expect(preview.shot).toBeNull();
  });

  it('un disparo a la casilla de al lado no lleva visor', async () => {
    const { s, soldier, preview, controls } = await myTurn();
    const foe = newUnit(s, SOLDIER, ENEMY, { x: 6, y: 5 });
    await controls.tap(soldier);
    controls.hover(foe);
    expect(preview.shot).toBeNull();
  });

  it('al soltarla, se quitan el camino y el visor', async () => {
    const { s, preview, controls } = await myTurn();
    const gun = newUnit(s, unitTypeNamed('Artillery'), PLAYER, { x: 10, y: 10 });
    const far = newUnit(s, SOLDIER, ENEMY, { x: 10, y: 13 });
    await controls.tap(gun);
    controls.hover(far);
    controls.cancel();
    expect(preview.shot).toBeNull();
    expect(preview.look).toBeNull();
  });
});

describe('varias personas en la misma pantalla', () => {
  /** Dos personas, cada una con un soldado; empieza la primera. */
  async function twoPeople() {
    const s = blankState();
    const first = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    const second = newUnit(s, SOLDIER, ENEMY, { x: 15, y: 15 });
    const passes: ScreenPass[] = [];
    const seat = new HotSeat(PLAYER, (pass) => passes.push(pass));
    const { controls } = turnOnScreen(s, [humanController(), humanController()], seat);
    await controls.runUntilInput();
    return { first, second, passes, seat, controls };
  }

  it('empieza la primera sin aviso; al acabar su turno, la pantalla pasa a la otra tapada por el aviso', async () => {
    const { second, passes, seat, controls } = await twoPeople();
    expect(ui.get().handoff).toBeNull();
    controls.endTurn();
    await settle();
    expect(passes).toEqual([{ from: PLAYER, to: ENEMY }]);
    expect(seat.team).toBe(ENEMY);
    expect(ui.get().handoff).toEqual({ team: shownTeamNumber(ENEMY) });
    // Tapada, no se juega: ni siquiera la persona que la recibe.
    await controls.tap(second);
    expect(controls.selectedUnits()).toEqual([]);
  });

  it('cuando la siguiente esta lista se quita el aviso y juega ella, con sus unidades', async () => {
    const { first, second, seat, controls } = await twoPeople();
    controls.endTurn();
    await settle();
    seat.command({ kind: 'ok', repeat: false });
    await settle();
    expect(ui.get().handoff).toBeNull();
    await controls.tap(first);
    expect(controls.selectedUnits()).toEqual([]);
    await controls.tap(second);
    expect(controls.selectedUnits()).toEqual([second]);
  });

  it('al acabar la segunda su turno, la pantalla vuelve a la primera', async () => {
    const { passes, seat, controls } = await twoPeople();
    controls.endTurn();
    await settle();
    seat.ready();
    await settle();
    controls.endTurn();
    await settle();
    expect(passes).toEqual([
      { from: PLAYER, to: ENEMY },
      { from: ENEMY, to: PLAYER },
    ]);
    expect(ui.get().handoff).toEqual({ team: shownTeamNumber(PLAYER) });
    seat.ready();
  });

  it('con una sola persona en la pantalla no sale nunca', async () => {
    const { controls } = await myTurn();
    controls.endTurn();
    await settle();
    expect(ui.get().handoff).toBeNull();
  });
});
