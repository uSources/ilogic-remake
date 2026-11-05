import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { assistTurn, startStandingOrder, standingOrderPlayOrder } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { manhattan, posOf } from '@core/geom';
import { newUnit } from '@core/rules';
import { availableActions, dispatch } from '@core/actions';
import { deserialize, serialize } from '@core/save';
import { SAVE_VERSION } from '@core/saveVersion';
import {
  SQUAD_NAME_MAX,
  squadByKey,
  standingOrderBlock,
  standingOrderChoices,
  effectiveStandingOrder,
  isDetached,
  sameFormation,
  squadInFormation,
  squadUnits,
} from '@core/squads';
import { addToGroup, disbandSquad, formSquad, pruneSquads, renameSquad, setGroup } from '@core/squads/membership';
import { cancelStandingOrder, finishStandingOrder, giveStandingOrder } from '@core/squads/standingOrders';
import type { GameState } from '@core/model';
import { squadsVM } from '../src/ui/hudModels';
import { act, blankState, savedByVersion1, unitTypeNamed, hqId, placedBuildings } from './helpers';
import { teamState } from '@core/teams';

const HQ = hqId();

/** [CAMBIO] Ordenes con destino estilo RTS y escuadras con nombre. */
const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  CAR = unitTypeNamed('Car'),
  CITY = 'City',
  FACTORY = 'Factory';

/** Partida con las dos Bases y una ciudad neutral lejos. */
function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 12, y: 5 });
  return s;
}

/** Juega `n` turnos de ordenes (reactivando las unidades entre medias). */
function turns(s: GameState, rounds: number): number[] {
  const done: number[] = [];
  for (let i = 0; i < rounds; i++) {
    const it = assistTurn(s, 0);
    let step = it.next();
    while (!step.done) step = it.next();
    done.push(...step.value);
    for (const unit of s.units) Object.assign(unit, { turnState: 'ready' });
    s.day++;
  }
  return done;
}

describe('ordenes con destino', () => {
  it('capturar aqui: va al edificio, lo captura y se queda quieta esperando', () => {
    const s = world();
    const unit = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'capture', { x: 12, y: 5 });
    const done = turns(s, 8);
    expect(placedBuildings(s)[2]!.owner).toBe(0);
    expect(done).toContain(unit.uid);
    expect(unit.standingOrder).toBeUndefined();
    expect(posOf(unit)).toEqual({ x: 12, y: 5 });
  });

  it('capturar aqui no se desvia hacia otro edificio mas cercano', () => {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 5, y: 6 });
    const unit = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'capture', { x: 12, y: 5 });
    turns(s, 1);
    expect(unit.x).toBeGreaterThan(5);
    expect(placedBuildings(s)[3]!.capture ?? null).toBeNull();
  });

  it('atacar aqui: dispara a lo que encuentra por el camino y no persigue a los que se alejan', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const onWay = newUnit(s, SOLDIER, 1, { x: 7, y: 5 });
    const far = newUnit(s, SOLDIER, 1, { x: 5, y: 12 }); // a la vista pero fuera de tiro y fuera del camino
    giveStandingOrder(s, 0, [unit], 'attack', { x: 15, y: 5 });
    turns(s, 1);
    expect(onWay.life).toBeLessThan(100);
    expect(far.life).toBe(100);
  });

  it('atacar aqui: al llegar sin enemigos cerca, la orden se cumple', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'attack', { x: 9, y: 5 });
    const done = turns(s, 3);
    expect(done).toContain(unit.uid);
    expect(unit.standingOrder).toBeUndefined();
    expect(Math.abs(unit.x - 9) + Math.abs(unit.y - 5)).toBeLessThanOrEqual(1);
  });

  it('defender aqui: va a la casilla, ataca a quien se acerca y no se cumple nunca', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'defend', { x: 8, y: 5 });
    turns(s, 2);
    expect(Math.abs(unit.x - 8) + Math.abs(unit.y - 5)).toBeLessThanOrEqual(1);
    const near = newUnit(s, SOLDIER, 1, { x: 8, y: 7 });
    const far = newUnit(s, SOLDIER, 1, { x: 8, y: 13 });
    turns(s, 1);
    expect(near.life).toBeLessThan(100);
    expect(far.life).toBe(100);
    expect(unit.standingOrder?.kind).toBe('defend');
  });

  it('con capturar, las que no capturan escoltan atacando hacia alli', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 6 });
    expect(giveStandingOrder(s, 0, [soldier, tank], 'capture', { x: 12, y: 5 })).toBe(2);
    expect(soldier.standingOrder?.kind).toBe('capture');
    expect(tank.standingOrder).toEqual({ kind: 'attack', at: { x: 12, y: 5 } });
  });

  it('capturar solo se puede en edificios que no son tuyos y con alguien que capture', () => {
    const s = world();
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    expect(standingOrderBlock(s, 0, 'capture', { x: 3, y: 3 }, [sol])).toBe('noBuilding');
    expect(standingOrderBlock(s, 0, 'capture', { x: 0, y: 0 }, [sol])).toBe('noBuilding');
    expect(standingOrderBlock(s, 0, 'capture', { x: 12, y: 5 }, [tank])).toBe('noCapturer');
    expect(standingOrderBlock(s, 0, 'capture', { x: 12, y: 5 }, [tank, sol])).toBeNull();
    expect(standingOrderBlock(s, 0, 'attack', { x: 3, y: 3 }, [tank])).toBeNull();
  });

  it('ordenes que se ofrecen en una casilla (gesto en el mapa): atacar primero si hay enemigo, capturar si se puede', () => {
    const s = world();
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    const foe = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    // Casilla vacia: atacar o defender.
    expect(standingOrderChoices(s, 0, { x: 3, y: 3 }, [sol], false)).toEqual(['attack', 'defend']);
    // Ciudad neutral: capturar va primero, pero solo si alguna puede capturar.
    expect(standingOrderChoices(s, 0, { x: 12, y: 5 }, [sol], false)).toEqual(['capture', 'attack', 'defend']);
    expect(standingOrderChoices(s, 0, { x: 12, y: 5 }, [tank], false)).toEqual(['attack', 'defend']);
    expect(standingOrderChoices(s, 0, { x: 12, y: 5 }, [tank, sol], false)).toEqual(['capture', 'attack', 'defend']);
    // Edificio propio: no se captura.
    expect(standingOrderChoices(s, 0, { x: 0, y: 0 }, [sol], false)).toEqual(['attack', 'defend']);
    // Enemigo visible: atacar primero (tambien sobre un edificio que se puede capturar).
    expect(standingOrderChoices(s, 0, foe, [sol], true)).toEqual(['attack', 'defend']);
    expect(standingOrderChoices(s, 0, { x: 19, y: 19 }, [sol], true)).toEqual(['attack', 'capture', 'defend']);
    // Sin unidades propias no hay nada que ofrecer.
    expect(standingOrderChoices(s, 0, { x: 3, y: 3 }, [foe], false)).toEqual([]);
    expect(standingOrderChoices(s, 0, { x: 3, y: 3 }, [], false)).toEqual([]);
  });

  it('solo juegan las que tienen orden y siguen sin usar; nunca compra', () => {
    const s = world();
    s.buildings.push({ type: FACTORY, owner: 0, x: 4, y: 4 });
    teamState(s, 0).funds = 50000;
    teamState(s, 1).funds = 5000;
    const free = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    const used = newUnit(s, SOLDIER, 0, { x: 8, y: 8 });
    giveStandingOrder(s, 0, [used], 'attack', { x: 15, y: 15 });
    Object.assign(used, { turnState: 'done' });
    const evs = Array.from(assistTurn(s, 0));
    expect(evs).toEqual([]);
    expect(free).toMatchObject({ x: 3, y: 3, turnState: 'ready' });
    expect(used).toMatchObject({ x: 8, y: 8 });
    expect(teamState(s, 0).funds).toBe(50000);
  });

  it('startStandingOrder la pone en marcha ya; cancelar la deja esperando', () => {
    const s = world();
    const unit = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'capture', { x: 12, y: 5 });
    Array.from(startStandingOrder(s, unit.uid, 0));
    expect(unit.x).toBeGreaterThan(5);
    cancelStandingOrder(s, [unit]);
    expect(unit.standingOrder).toBeUndefined();
  });

  it('el menu ofrece las ordenes que puede cumplir y cancelar si tiene una', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 6, y: 6 });
    expect(availableActions(s, 0, sol)).toEqual(expect.arrayContaining(['orderToAttack', 'orderToCapture', 'orderToDefend']));
    expect(availableActions(s, 0, sol)).not.toContain('cancelOrder');
    expect(availableActions(s, 0, tank)).not.toContain('orderToCapture');
    giveStandingOrder(s, 0, [tank], 'defend', { x: 6, y: 6 });
    expect(availableActions(s, 0, tank)).toContain('cancelOrder');
  });
});

describe('escuadras', () => {
  it('se forman con nombre libre, se renombran y se deshacen', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    // Con una unidad de otro equipo, la accion no vale; con las propias, si.
    expect(dispatch(s, 0, { kind: 'formSquad', uids: [soldier.uid, tank.uid, enemy.uid] })).toEqual({ ok: false, reason: 'notYours' });
    const q1 = formSquad(s, 0, [soldier, tank]).squad;
    expect(q1.name).toBe('Alfa');
    expect(squadUnits(s, q1.id).map((unit) => unit.uid)).toEqual([soldier.uid, tank.uid]);
    expect(enemy.squad).toBeUndefined();
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 6, y: 6 });
    expect(formSquad(s, 0, [otherSoldier]).squad.name).toBe('Bravo');
    renameSquad(q1, '  Los   de   la   colina larga  ');
    expect(s.squads![0]!.name).toBe('Los de la coli');
    expect(s.squads![0]!.name.length).toBeLessThanOrEqual(SQUAD_NAME_MAX);
    renameSquad(q1, '   ');
    expect(q1.name).toBe('Los de la coli');
    act(s, 0, { kind: 'disbandSquad', squad: q1.id });
    expect(soldier.squad).toBeUndefined();
    expect(s.squads!.map((squad) => squad.name)).toEqual(['Bravo']);
  });

  it('pasar una unidad a otra escuadra vacia la vieja, que desaparece', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    formSquad(s, 0, [soldier]);
    formSquad(s, 0, [soldier], 'Nueva');
    expect(s.squads!.map((squad) => squad.name)).toEqual(['Nueva']);
  });

  it('una escuadra cuyas unidades caen desaparece', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    formSquad(s, 0, [soldier]);
    s.units = [];
    pruneSquads(s);
    expect(s.squads).toBeUndefined();
  });

  it('las ordenes y las escuadras se guardan con la partida', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const squad = formSquad(s, 0, [soldier], 'Lobos').squad;
    giveStandingOrder(s, 0, [soldier], 'capture', { x: 12, y: 5 });
    const back = deserialize(serialize(s), saveContext(defaultContent()))!;
    // Toda la escuadra: la orden es de la escuadra, no de la unidad.
    expect(back.squads).toEqual([
      { id: squad.id, team: 0, name: 'Lobos', key: 1, standingOrder: { kind: 'capture', at: { x: 12, y: 5 } } },
    ]);
    expect(back.units[0]).toMatchObject({ squad: squad.id });
    expect(back.units[0]!.standingOrder).toBeUndefined();
  });

  it('las partidas guardadas con la orden en `command` (antes de llamarla orden permanente) la conservan', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const otherSoldier = newUnit(s, SOLDIER, 0, { x: 6, y: 5 });
    const squad = formSquad(s, 0, [soldier]).squad;
    giveStandingOrder(s, 0, [soldier], 'attack', { x: 12, y: 5 });
    giveStandingOrder(s, 0, [otherSoldier], 'defend', { x: 6, y: 5 });
    const old = savedByVersion1(serialize(s).replaceAll('"standingOrder":', '"command":'));
    const back = deserialize(old, saveContext(defaultContent()))!;
    expect(back.squads![0]!.standingOrder).toEqual({ kind: 'attack', at: { x: 12, y: 5 } });
    expect(back.units.find((unit) => unit.uid === otherSoldier.uid)!.standingOrder).toEqual({ kind: 'defend', at: { x: 6, y: 5 } });
    expect(serialize(back)).not.toContain('"command"');
    expect(squad.id).toBe(back.squads![0]!.id);
  });

  it('una orden o escuadra rota se ignora al cargar', () => {
    const s = world();
    newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const raw = JSON.parse(serialize(s)) as { units: Record<string, unknown>[]; squads?: unknown };
    raw.units[0]!.standingOrder = { kind: 'bailar', at: { x: 1, y: 1 } };
    raw.units[0]!.squad = 7;
    const back = deserialize(JSON.stringify(raw), saveContext(defaultContent()))!;
    expect(back.units[0]!.standingOrder).toBeUndefined();
    expect(back.units[0]!.squad).toBeUndefined();
  });
});

describe('escuadras en formacion', () => {
  /** Casillas que le quedan hasta el destino (todo hierba: en linea recta). */
  const left = (unit: { x: number; y: number }, at: { x: number; y: number }) => Math.abs(unit.x - at.x) + Math.abs(unit.y - at.y);
  const SPREAD = 2; // AI.SQUADSPREAD en ai.json

  it('el jeep no deja atras al soldado: van juntos hacia un destino lejano', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    formSquad(s, 0, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, 0, [car, sol], 'attack', at);
    expect(squadInFormation(s, sol.squad!)).toBe(true);
    turns(s, 2);
    expect(left(sol, at)).toBe(17 - 6); // el soldado va a su ritmo (3 por turno)
    expect(left(car, at)).toBeGreaterThanOrEqual(left(sol, at) - SPREAD);
    expect(manhattan(car, sol)).toBeLessThanOrEqual(SPREAD + 1);
  });

  it('juegan primero las mas retrasadas y lentas', () => {
    const s = world();
    const car = newUnit(s, CAR, 0, { x: 3, y: 6 }); // le queda lo mismo que al soldado: va antes el lento
    const sol = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    const lone = newUnit(s, CAR, 0, { x: 9, y: 9 });
    formSquad(s, 0, [car, sol]);
    giveStandingOrder(s, 0, [car, sol, lone], 'attack', { x: 18, y: 5 });
    expect(standingOrderPlayOrder(s, [car, lone, sol]).map((unit) => unit.uid)).toEqual([sol.uid, car.uid, lone.uid]);
  });

  it('la mas lenta no espera a la rapida: avanza todo lo que puede', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 3, y: 6 }); // les queda lo mismo
    formSquad(s, 0, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, 0, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(sol, at)).toBe(16 - 3);
    expect(left(car, at)).toBe(16 - 3 - SPREAD);
  });

  it('el jeep no se lanza solo a por un enemigo lejano: lo espera con la escuadra', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 9, y: 6 }); // al alcance del jeep, lejos del soldado
    formSquad(s, 0, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, 0, [car, sol], 'attack', at);
    turns(s, 1);
    expect(enemy.life).toBe(100);
    expect(left(car, at)).toBeGreaterThanOrEqual(left(sol, at) - SPREAD);
  });

  it('con un enemigo a tiro sin dejar atras a la escuadra, el jeep ataca', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 7, y: 6 });
    formSquad(s, 0, [car, sol]);
    giveStandingOrder(s, 0, [car, sol], 'attack', { x: 18, y: 5 });
    turns(s, 1);
    expect(enemy.life).toBeLessThan(100);
  });

  it('cerca del destino la formacion se suelta y cada una va a lo suyo', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 10, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 10, y: 6 });
    formSquad(s, 0, [car, sol]);
    const at = { x: 14, y: 6 };
    giveStandingOrder(s, 0, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(car, at)).toBeLessThanOrEqual(1);
  });

  it('sin escuadra, o con ordenes distintas, cada una va a su ritmo', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const at = { x: 18, y: 6 };
    giveStandingOrder(s, 0, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(car, at)).toBe(17 - 7);

    const other = world();
    const sol2 = newUnit(other, SOLDIER, 0, { x: 1, y: 5 });
    const car2 = newUnit(other, CAR, 0, { x: 1, y: 6 });
    formSquad(other, 0, [car2, sol2]);
    giveStandingOrder(other, 0, [sol2], 'attack', { x: 18, y: 5 });
    giveStandingOrder(other, 0, [car2], 'attack', at);
    expect(sameFormation(other, car2, sol2)).toBe(false);
    turns(other, 1);
    expect(left(car2, at)).toBe(17 - 7);
  });

  it('capturar con escolta tambien va en formacion', () => {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 18, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const squad = formSquad(s, 0, [car, sol]).squad;
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, 0, [car, sol], 'capture', at);
    expect(effectiveStandingOrder(s, car)?.kind).toBe('attack');
    expect(squadInFormation(s, squad.id)).toBe(true);
    turns(s, 2);
    expect(left(car, at)).toBeGreaterThanOrEqual(left(sol, at) - SPREAD);
  });
});

describe('orden de la escuadra y unidades destacadas', () => {
  /** Escuadra de dos soldados y un tanque cerca de la Base, con una ciudad neutral al lado. */
  function squadWorld() {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 3, y: 5 });
    const firstSoldier = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    const secondSoldier = newUnit(s, SOLDIER, 0, { x: 2, y: 6 });
    const tank = newUnit(s, TANK, 0, { x: 1, y: 6 });
    const squad = formSquad(s, 0, [firstSoldier, secondSoldier, tank]).squad;
    return { s, firstSoldier, secondSoldier, tank, squad };
  }

  it('a toda la escuadra: la orden es de la escuadra y la siguen todas (escolta incluida)', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'capture', { x: 12, y: 5 });
    expect(squad.standingOrder).toEqual({ kind: 'capture', at: { x: 12, y: 5 } });
    expect([firstSoldier, secondSoldier, tank].map((unit) => unit.standingOrder)).toEqual([undefined, undefined, undefined]);
    expect(effectiveStandingOrder(s, firstSoldier)?.kind).toBe('capture');
    expect(effectiveStandingOrder(s, tank)?.kind).toBe('attack');
    expect([firstSoldier, secondSoldier, tank].some((unit) => isDetached(s, unit))).toBe(false);
  });

  it('a una sola: va destacada con su orden, las demas siguen la de la escuadra', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, 0, [firstSoldier], 'capture', { x: 3, y: 5 });
    expect(squad.standingOrder?.kind).toBe('attack');
    expect(isDetached(s, firstSoldier)).toBe(true);
    expect(effectiveStandingOrder(s, secondSoldier)?.kind).toBe('attack');
    expect(squadsVM(s)[0]).toMatchObject({ detached: 1 });
    // Darle justo la orden de la escuadra la devuelve con ella.
    giveStandingOrder(s, 0, [firstSoldier], 'attack', { x: 15, y: 15 });
    expect(firstSoldier.standingOrder).toBeUndefined();
  });

  it('la destacada cumple su captura y despues vuelve a la orden de la escuadra', () => {
    const { s, firstSoldier, secondSoldier, tank } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, 0, [firstSoldier], 'capture', { x: 3, y: 5 });
    turns(s, 4);
    expect(placedBuildings(s)[3]!.owner).toBe(0);
    expect(firstSoldier.standingOrder).toBeUndefined();
    expect(effectiveStandingOrder(s, firstSoldier)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('capturar a mano a mitad de una orden: sigue capturando el turno siguiente (no se va)', () => {
    const { s, firstSoldier, secondSoldier, tank } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    firstSoldier.x = 3; // ya encima de la ciudad
    // La accion de capturar deja la orden en capturar este edificio (keepCapturing).
    act(s, 0, { kind: 'capture', uid: firstSoldier.uid });
    expect(firstSoldier.standingOrder).toEqual({ kind: 'capture', at: { x: 3, y: 5 } });
    expect(isDetached(s, firstSoldier)).toBe(true);
    for (const unit of s.units) Object.assign(unit, { turnState: 'ready' });
    turns(s, 2);
    expect(placedBuildings(s)[3]!.owner).toBe(0);
    expect(effectiveStandingOrder(s, firstSoldier)?.kind).toBe('attack');
  });

  it('quitar la orden: a la escuadra entera se la quita; a una destacada la devuelve; a otra la para donde esta', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, 0, [firstSoldier], 'capture', { x: 3, y: 5 });
    cancelStandingOrder(s, [firstSoldier]);
    expect(effectiveStandingOrder(s, firstSoldier)?.kind).toBe('attack');
    cancelStandingOrder(s, [secondSoldier]);
    expect(secondSoldier.standingOrder).toEqual({ kind: 'defend', at: posOf(secondSoldier) });
    cancelStandingOrder(s, [firstSoldier, secondSoldier, tank]);
    expect(squad.standingOrder).toBeUndefined();
    expect([firstSoldier, secondSoldier, tank].map((unit) => effectiveStandingOrder(s, unit))).toEqual([undefined, undefined, undefined]);
  });

  it('atacar: la orden de la escuadra se cumple cuando han llegado todas las que la siguen', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 2, y: 6 });
    firstSoldier.x = 9; // lejos
    finishStandingOrder(s, secondSoldier);
    expect(squad.standingOrder).toBeDefined();
    firstSoldier.x = 2;
    finishStandingOrder(s, secondSoldier);
    expect(squad.standingOrder).toBeUndefined();
  });

  it('salir de una escuadra (otra escuadra o disolverla): se lleva lo que estaba haciendo', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    formSquad(s, 0, [tank]);
    expect(tank.squad).not.toBe(squad.id);
    expect(effectiveStandingOrder(s, tank)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
    disbandSquad(s, squad);
    expect(firstSoldier.standingOrder).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('una partida de antes (orden copiada en cada unidad) carga con la orden en la escuadra', () => {
    const { s, firstSoldier, secondSoldier, tank, squad } = squadWorld();
    for (const unit of [firstSoldier, secondSoldier, tank])
      unit.standingOrder = { kind: unit === tank ? 'attack' : 'capture', at: { x: 12, y: 5 } };
    const back = deserialize(savedByVersion1(serialize(s)), saveContext(defaultContent()))!;
    expect(back.squads![0]!.standingOrder).toEqual({ kind: 'capture', at: { x: 12, y: 5 } });
    expect(back.units.every((unit) => unit.standingOrder === undefined)).toBe(true);
    expect(squad.id).toBe(back.squads![0]!.id);
  });

  it('llevada a mano a una casilla lejana (orden de varios turnos): eso manda mientras dura', () => {
    const { s, firstSoldier, secondSoldier, tank } = squadWorld();
    giveStandingOrder(s, 0, [firstSoldier, secondSoldier, tank], 'attack', { x: 15, y: 15 });
    firstSoldier.travelTo = { x: 0, y: 9 };
    expect(effectiveStandingOrder(s, firstSoldier)).toBeUndefined();
  });
});

describe('grupos con numero (Ctrl+n, Mayusculas+n, n)', () => {
  it('cada escuadra nueva toma la primera tecla libre; Ctrl+3 forma «Charlie» con la tecla 3', () => {
    const s = world();
    const [first, second, third] = [
      newUnit(s, SOLDIER, 0, { x: 1, y: 1 }),
      newUnit(s, SOLDIER, 0, { x: 1, y: 2 }),
      newUnit(s, TANK, 0, { x: 1, y: 3 }),
    ];
    expect(formSquad(s, 0, [first]).squad.key).toBe(1);
    const squad = setGroup(s, 0, [second, third], 3).squad;
    expect(squad).toMatchObject({ key: 3, name: 'Charlie' });
    expect(squadByKey(s, 0, 3)).toBe(squad);
  });

  it('Ctrl+n otra vez: el grupo se queda solo con las nuevas (las demas salen con lo que hacian)', () => {
    const s = world();
    const [first, second, third] = [
      newUnit(s, SOLDIER, 0, { x: 1, y: 1 }),
      newUnit(s, SOLDIER, 0, { x: 1, y: 2 }),
      newUnit(s, TANK, 0, { x: 1, y: 3 }),
    ];
    const squad = setGroup(s, 0, [first, second], 2).squad;
    giveStandingOrder(s, 0, [first, second], 'attack', { x: 15, y: 15 });
    setGroup(s, 0, [second, third], 2);
    expect(
      squadUnits(s, squad.id)
        .map((unit) => unit.uid)
        .sort(),
    ).toEqual([second.uid, third.uid].sort());
    expect(first.squad).toBeUndefined();
    expect(first.standingOrder).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
    // La nueva sigue la orden del grupo.
    expect(effectiveStandingOrder(s, third)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('Mayusculas+n añade al grupo (o lo forma si no existe); sale de su escuadra anterior', () => {
    const s = world();
    const [first, second, third] = [
      newUnit(s, SOLDIER, 0, { x: 1, y: 1 }),
      newUnit(s, SOLDIER, 0, { x: 1, y: 2 }),
      newUnit(s, TANK, 0, { x: 1, y: 3 }),
    ];
    const q1 = setGroup(s, 0, [first], 1).squad;
    const q2 = addToGroup(s, 0, [second], 2).squad;
    act(s, 0, { kind: 'addToGroup', uids: [third.uid, second.uid], key: 1 });
    expect(squadUnits(s, q1.id).length).toBe(3);
    // La escuadra 2 se ha quedado vacia: desaparece y su tecla queda libre.
    expect(s.squads!.some((squad) => squad.id === q2.id)).toBe(false);
    expect(squadByKey(s, 0, 2)).toBeUndefined();
  });

  it('las partidas de antes (formato 3) dan tecla a sus escuadras al cargar, sin repetir', () => {
    const s = world();
    const first = newUnit(s, SOLDIER, 0, { x: 1, y: 1 }),
      second = newUnit(s, SOLDIER, 0, { x: 1, y: 2 });
    formSquad(s, 0, [first]);
    formSquad(s, 0, [second]);
    for (const squad of s.squads!) delete squad.key;
    const asFormat3 = () => serialize(s).replace(`"version":${SAVE_VERSION}`, '"version":3');
    const keysAfterLoading = (json: string) => deserialize(json, saveContext(defaultContent()))!.squads!.map((squad) => squad.key);
    expect(keysAfterLoading(asFormat3())).toEqual([1, 2]);
    s.squads![0]!.key = 4;
    s.squads![1]!.key = 4;
    expect(keysAfterLoading(asFormat3())).toEqual([4, 1]);
    // Desde el formato 4 leer no cambia las escuadras: una tecla repetida se queda sin tecla.
    expect(keysAfterLoading(serialize(s))).toEqual([4, undefined]);
  });
});
