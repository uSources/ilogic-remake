import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { assistTurn, startStandingOrder, standingOrderPlayOrder } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { manhattan, seededRng, posOf } from '@core/geom';
import { capture, newUnit, unitActions } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import {
  SQUAD_NAME_MAX,
  addToGroup,
  setGroup,
  squadByKey,
  cancelStandingOrder,
  standingOrderBlock,
  standingOrderChoices,
  disbandSquad,
  effectiveStandingOrder,
  finishStandingOrder,
  formSquad,
  giveStandingOrder,
  isDetached,
  keepCapturing,
  pruneSquads,
  renameSquad,
  sameFormation,
  squadInFormation,
  squadUnits,
} from '@core/squads';
import type { GameState } from '@core/model';
import { squadsVM } from '../src/ui/hudModels';
import { blankState } from './helpers';

const { HQ } = defaultContent().tables;

/** [CAMBIO] Ordenes con destino estilo RTS y escuadras con nombre. */
const SOLDIER = 0,
  TANK = 1,
  CAR = 3,
  CITY = 0,
  FACTORY = 2;

/** Partida con las dos Bases y una ciudad neutral lejos. */
function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 12, y: 5 });
  return s;
}

/** Juega `n` turnos de ordenes (reactivando las unidades entre medias). */
function turns(s: GameState, n: number): number[] {
  const done: number[] = [];
  for (let i = 0; i < n; i++) {
    const it = assistTurn(s, seededRng(i + 1));
    let r = it.next();
    while (!r.done) r = it.next();
    done.push(...r.value);
    for (const u of s.units) Object.assign(u, { active: true, canMove: true, canFire: true });
    s.day++;
  }
  return done;
}

describe('ordenes con destino', () => {
  it('capturar aqui: va al edificio, lo captura y se queda quieta esperando', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, [u], 'capture', { x: 12, y: 5 });
    const done = turns(s, 8);
    expect(s.buildings[2]!.owner).toBe(0);
    expect(done).toContain(u.uid);
    expect(u.standingOrder).toBeUndefined();
    expect(posOf(u)).toEqual({ x: 12, y: 5 });
  });

  it('capturar aqui no se desvia hacia otro edificio mas cercano', () => {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 5, y: 6 });
    const u = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, [u], 'capture', { x: 12, y: 5 });
    turns(s, 1);
    expect(u.x).toBeGreaterThan(5);
    expect(s.buildings[3]!.capture ?? null).toBeNull();
  });

  it('atacar aqui: dispara a lo que encuentra por el camino y no persigue a los que se alejan', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const onWay = newUnit(s, SOLDIER, 1, { x: 7, y: 5 });
    const far = newUnit(s, SOLDIER, 1, { x: 5, y: 12 }); // a la vista pero fuera de tiro y fuera del camino
    giveStandingOrder(s, [u], 'attack', { x: 15, y: 5 });
    turns(s, 1);
    expect(onWay.life).toBeLessThan(100);
    expect(far.life).toBe(100);
  });

  it('atacar aqui: al llegar sin enemigos cerca, la orden se cumple', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, [u], 'attack', { x: 9, y: 5 });
    const done = turns(s, 3);
    expect(done).toContain(u.uid);
    expect(u.standingOrder).toBeUndefined();
    expect(Math.abs(u.x - 9) + Math.abs(u.y - 5)).toBeLessThanOrEqual(1);
  });

  it('defender aqui: va a la casilla, ataca a quien se acerca y no se cumple nunca', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, [u], 'defend', { x: 8, y: 5 });
    turns(s, 2);
    expect(Math.abs(u.x - 8) + Math.abs(u.y - 5)).toBeLessThanOrEqual(1);
    const near = newUnit(s, SOLDIER, 1, { x: 8, y: 7 });
    const far = newUnit(s, SOLDIER, 1, { x: 8, y: 13 });
    turns(s, 1);
    expect(near.life).toBeLessThan(100);
    expect(far.life).toBe(100);
    expect(u.standingOrder?.kind).toBe('defend');
  });

  it('con capturar, las que no capturan escoltan atacando hacia alli', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const b = newUnit(s, TANK, 0, { x: 5, y: 6 });
    expect(giveStandingOrder(s, [a, b], 'capture', { x: 12, y: 5 })).toBe(2);
    expect(a.standingOrder?.kind).toBe('capture');
    expect(b.standingOrder).toEqual({ kind: 'attack', at: { x: 12, y: 5 } });
  });

  it('capturar solo se puede en edificios que no son tuyos y con alguien que capture', () => {
    const s = world();
    const t = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    expect(standingOrderBlock(s, 'capture', { x: 3, y: 3 }, [sol])).toBe('noBuilding');
    expect(standingOrderBlock(s, 'capture', { x: 0, y: 0 }, [sol])).toBe('noBuilding');
    expect(standingOrderBlock(s, 'capture', { x: 12, y: 5 }, [t])).toBe('noCapturer');
    expect(standingOrderBlock(s, 'capture', { x: 12, y: 5 }, [t, sol])).toBeNull();
    expect(standingOrderBlock(s, 'attack', { x: 3, y: 3 }, [t])).toBeNull();
  });

  it('ordenes que se ofrecen en una casilla (gesto en el mapa): atacar primero si hay enemigo, capturar si se puede', () => {
    const s = world();
    const t = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 6 });
    const foe = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    // Casilla vacia: atacar o defender.
    expect(standingOrderChoices(s, { x: 3, y: 3 }, [sol], false)).toEqual(['attack', 'defend']);
    // Ciudad neutral: capturar va primero, pero solo si alguna puede capturar.
    expect(standingOrderChoices(s, { x: 12, y: 5 }, [sol], false)).toEqual(['capture', 'attack', 'defend']);
    expect(standingOrderChoices(s, { x: 12, y: 5 }, [t], false)).toEqual(['attack', 'defend']);
    expect(standingOrderChoices(s, { x: 12, y: 5 }, [t, sol], false)).toEqual(['capture', 'attack', 'defend']);
    // Edificio propio: no se captura.
    expect(standingOrderChoices(s, { x: 0, y: 0 }, [sol], false)).toEqual(['attack', 'defend']);
    // Enemigo visible: atacar primero (tambien sobre un edificio que se puede capturar).
    expect(standingOrderChoices(s, foe, [sol], true)).toEqual(['attack', 'defend']);
    expect(standingOrderChoices(s, { x: 19, y: 19 }, [sol], true)).toEqual(['attack', 'capture', 'defend']);
    // Sin unidades propias no hay nada que ofrecer.
    expect(standingOrderChoices(s, { x: 3, y: 3 }, [foe], false)).toEqual([]);
    expect(standingOrderChoices(s, { x: 3, y: 3 }, [], false)).toEqual([]);
  });

  it('solo juegan las que tienen orden y siguen sin usar; nunca compra', () => {
    const s = world();
    s.buildings.push({ type: FACTORY, owner: 0, x: 4, y: 4 });
    s.funds = [50000, 5000];
    const free = newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    const used = newUnit(s, SOLDIER, 0, { x: 8, y: 8 });
    giveStandingOrder(s, [used], 'attack', { x: 15, y: 15 });
    Object.assign(used, { active: false, canMove: false });
    const evs = Array.from(assistTurn(s, seededRng(1)));
    expect(evs).toEqual([]);
    expect(free).toMatchObject({ x: 3, y: 3, active: true });
    expect(used).toMatchObject({ x: 8, y: 8 });
    expect(s.funds[0]).toBe(50000);
  });

  it('startStandingOrder la pone en marcha ya; cancelar la deja esperando', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    giveStandingOrder(s, [u], 'capture', { x: 12, y: 5 });
    Array.from(startStandingOrder(s, u.uid, seededRng(1)));
    expect(u.x).toBeGreaterThan(5);
    cancelStandingOrder(s, [u]);
    expect(u.standingOrder).toBeUndefined();
  });

  it('el menu ofrece las ordenes que puede cumplir y cancelar si tiene una', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 6, y: 6 });
    expect(unitActions(s, sol)).toMatchObject({ orderToAttack: true, orderToCapture: true, orderToDefend: true, cancelOrder: false });
    expect(unitActions(s, tank).orderToCapture).toBe(false);
    giveStandingOrder(s, [tank], 'defend', { x: 6, y: 6 });
    expect(unitActions(s, tank).cancelOrder).toBe(true);
  });
});

describe('escuadras', () => {
  it('se forman con nombre libre, se renombran y se deshacen', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const b = newUnit(s, TANK, 0, { x: 5, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 9, y: 9 });
    const q1 = formSquad(s, [a, b, enemy])!;
    expect(q1.name).toBe('Alfa');
    expect(squadUnits(s, q1.id).map((u) => u.uid)).toEqual([a.uid, b.uid]);
    expect(enemy.squad).toBeUndefined();
    const c = newUnit(s, SOLDIER, 0, { x: 6, y: 6 });
    expect(formSquad(s, [c])!.name).toBe('Bravo');
    expect(renameSquad(s, q1.id, '  Los   de   la   colina larga  ')).toBe(true);
    expect(s.squads![0]!.name).toBe('Los de la coli');
    expect(s.squads![0]!.name.length).toBeLessThanOrEqual(SQUAD_NAME_MAX);
    expect(renameSquad(s, q1.id, '   ')).toBe(false);
    disbandSquad(s, q1.id);
    expect(a.squad).toBeUndefined();
    expect(s.squads!.map((q) => q.name)).toEqual(['Bravo']);
  });

  it('pasar una unidad a otra escuadra vacia la vieja, que desaparece', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    formSquad(s, [a]);
    formSquad(s, [a], 'Nueva');
    expect(s.squads!.map((q) => q.name)).toEqual(['Nueva']);
  });

  it('una escuadra cuyas unidades caen desaparece', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    formSquad(s, [a]);
    s.units = [];
    pruneSquads(s);
    expect(s.squads).toBeUndefined();
  });

  it('las ordenes y las escuadras se guardan con la partida', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const q = formSquad(s, [a], 'Lobos')!;
    giveStandingOrder(s, [a], 'capture', { x: 12, y: 5 });
    const back = deserialize(serialize(s), saveContext())!;
    // Toda la escuadra: la orden es de la escuadra, no de la unidad.
    expect(back.squads).toEqual([{ id: q.id, name: 'Lobos', key: 1, standingOrder: { kind: 'capture', at: { x: 12, y: 5 } } }]);
    expect(back.units[0]).toMatchObject({ squad: q.id });
    expect(back.units[0]!.standingOrder).toBeUndefined();
  });

  it('las partidas guardadas con la orden en `command` (antes de llamarla orden permanente) la conservan', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const b = newUnit(s, SOLDIER, 0, { x: 6, y: 5 });
    const q = formSquad(s, [a])!;
    giveStandingOrder(s, [a], 'attack', { x: 12, y: 5 });
    giveStandingOrder(s, [b], 'defend', { x: 6, y: 5 });
    const old = serialize(s).replaceAll('"standingOrder":', '"command":');
    const back = deserialize(old, saveContext())!;
    expect(back.squads![0]!.standingOrder).toEqual({ kind: 'attack', at: { x: 12, y: 5 } });
    expect(back.units.find((unit) => unit.uid === b.uid)!.standingOrder).toEqual({ kind: 'defend', at: { x: 6, y: 5 } });
    expect(serialize(back)).not.toContain('"command"');
    expect(q.id).toBe(back.squads![0]!.id);
  });

  it('una orden o escuadra rota se ignora al cargar', () => {
    const s = world();
    newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    const raw = JSON.parse(serialize(s)) as { units: Record<string, unknown>[]; squads?: unknown };
    raw.units[0]!.standingOrder = { kind: 'bailar', at: { x: 1, y: 1 } };
    raw.units[0]!.squad = 7;
    const back = deserialize(JSON.stringify(raw), saveContext())!;
    expect(back.units[0]!.standingOrder).toBeUndefined();
    expect(back.units[0]!.squad).toBeUndefined();
  });
});

describe('escuadras en formacion', () => {
  /** Casillas que le quedan hasta el destino (todo hierba: en linea recta). */
  const left = (u: { x: number; y: number }, at: { x: number; y: number }) => Math.abs(u.x - at.x) + Math.abs(u.y - at.y);
  const SPREAD = 2; // AI.SQUADSPREAD en ai.json

  it('el jeep no deja atras al soldado: van juntos hacia un destino lejano', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    formSquad(s, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, [car, sol], 'attack', at);
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
    formSquad(s, [car, sol]);
    giveStandingOrder(s, [car, sol, lone], 'attack', { x: 18, y: 5 });
    expect(standingOrderPlayOrder(s, [car, lone, sol]).map((u) => u.uid)).toEqual([sol.uid, car.uid, lone.uid]);
  });

  it('la mas lenta no espera a la rapida: avanza todo lo que puede', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 3, y: 6 }); // les queda lo mismo
    formSquad(s, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(sol, at)).toBe(16 - 3);
    expect(left(car, at)).toBe(16 - 3 - SPREAD);
  });

  it('el jeep no se lanza solo a por un enemigo lejano: lo espera con la escuadra', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 9, y: 6 }); // al alcance del jeep, lejos del soldado
    formSquad(s, [car, sol]);
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, [car, sol], 'attack', at);
    turns(s, 1);
    expect(enemy.life).toBe(100);
    expect(left(car, at)).toBeGreaterThanOrEqual(left(sol, at) - SPREAD);
  });

  it('con un enemigo a tiro sin dejar atras a la escuadra, el jeep ataca', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 7, y: 6 });
    formSquad(s, [car, sol]);
    giveStandingOrder(s, [car, sol], 'attack', { x: 18, y: 5 });
    turns(s, 1);
    expect(enemy.life).toBeLessThan(100);
  });

  it('cerca del destino la formacion se suelta y cada una va a lo suyo', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 10, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 10, y: 6 });
    formSquad(s, [car, sol]);
    const at = { x: 14, y: 6 };
    giveStandingOrder(s, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(car, at)).toBeLessThanOrEqual(1);
  });

  it('sin escuadra, o con ordenes distintas, cada una va a su ritmo', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const at = { x: 18, y: 6 };
    giveStandingOrder(s, [car, sol], 'attack', at);
    turns(s, 1);
    expect(left(car, at)).toBe(17 - 7);

    const s2 = world();
    const sol2 = newUnit(s2, SOLDIER, 0, { x: 1, y: 5 });
    const car2 = newUnit(s2, CAR, 0, { x: 1, y: 6 });
    formSquad(s2, [car2, sol2]);
    giveStandingOrder(s2, [sol2], 'attack', { x: 18, y: 5 });
    giveStandingOrder(s2, [car2], 'attack', at);
    expect(sameFormation(s2, car2, sol2)).toBe(false);
    turns(s2, 1);
    expect(left(car2, at)).toBe(17 - 7);
  });

  it('capturar con escolta tambien va en formacion', () => {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 18, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 1, y: 5 });
    const car = newUnit(s, CAR, 0, { x: 1, y: 6 });
    const q = formSquad(s, [car, sol])!;
    const at = { x: 18, y: 5 };
    giveStandingOrder(s, [car, sol], 'capture', at);
    expect(effectiveStandingOrder(s, car)?.kind).toBe('attack');
    expect(squadInFormation(s, q.id)).toBe(true);
    turns(s, 2);
    expect(left(car, at)).toBeGreaterThanOrEqual(left(sol, at) - SPREAD);
  });
});

describe('orden de la escuadra y unidades destacadas', () => {
  /** Escuadra de dos soldados y un tanque cerca de la Base, con una ciudad neutral al lado. */
  function squadWorld() {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 3, y: 5 });
    const a = newUnit(s, SOLDIER, 0, { x: 2, y: 5 });
    const b = newUnit(s, SOLDIER, 0, { x: 2, y: 6 });
    const t = newUnit(s, TANK, 0, { x: 1, y: 6 });
    const q = formSquad(s, [a, b, t])!;
    return { s, a, b, t, q };
  }

  it('a toda la escuadra: la orden es de la escuadra y la siguen todas (escolta incluida)', () => {
    const { s, a, b, t, q } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'capture', { x: 12, y: 5 });
    expect(q.standingOrder).toEqual({ kind: 'capture', at: { x: 12, y: 5 } });
    expect([a, b, t].map((u) => u.standingOrder)).toEqual([undefined, undefined, undefined]);
    expect(effectiveStandingOrder(s, a)?.kind).toBe('capture');
    expect(effectiveStandingOrder(s, t)?.kind).toBe('attack');
    expect([a, b, t].some((u) => isDetached(s, u))).toBe(false);
  });

  it('a una sola: va destacada con su orden, las demas siguen la de la escuadra', () => {
    const { s, a, b, t, q } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, [a], 'capture', { x: 3, y: 5 });
    expect(q.standingOrder?.kind).toBe('attack');
    expect(isDetached(s, a)).toBe(true);
    expect(effectiveStandingOrder(s, b)?.kind).toBe('attack');
    expect(squadsVM(s)[0]).toMatchObject({ detached: 1 });
    // Darle justo la orden de la escuadra la devuelve con ella.
    giveStandingOrder(s, [a], 'attack', { x: 15, y: 15 });
    expect(a.standingOrder).toBeUndefined();
  });

  it('la destacada cumple su captura y despues vuelve a la orden de la escuadra', () => {
    const { s, a, b, t } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, [a], 'capture', { x: 3, y: 5 });
    turns(s, 4);
    expect(s.buildings[3]!.owner).toBe(0);
    expect(a.standingOrder).toBeUndefined();
    expect(effectiveStandingOrder(s, a)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('capturar a mano a mitad de una orden: sigue capturando el turno siguiente (no se va)', () => {
    const { s, a, b, t } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    a.x = 3; // ya encima de la ciudad
    capture(s, a);
    keepCapturing(s, a);
    expect(a.standingOrder).toEqual({ kind: 'capture', at: { x: 3, y: 5 } });
    expect(isDetached(s, a)).toBe(true);
    for (const u of s.units) Object.assign(u, { active: true, canMove: true, canFire: true });
    turns(s, 2);
    expect(s.buildings[3]!.owner).toBe(0);
    expect(effectiveStandingOrder(s, a)?.kind).toBe('attack');
  });

  it('quitar la orden: a la escuadra entera se la quita; a una destacada la devuelve; a otra la para donde esta', () => {
    const { s, a, b, t, q } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    giveStandingOrder(s, [a], 'capture', { x: 3, y: 5 });
    cancelStandingOrder(s, [a]);
    expect(effectiveStandingOrder(s, a)?.kind).toBe('attack');
    cancelStandingOrder(s, [b]);
    expect(b.standingOrder).toEqual({ kind: 'defend', at: posOf(b) });
    cancelStandingOrder(s, [a, b, t]);
    expect(q.standingOrder).toBeUndefined();
    expect([a, b, t].map((u) => effectiveStandingOrder(s, u))).toEqual([undefined, undefined, undefined]);
  });

  it('atacar: la orden de la escuadra se cumple cuando han llegado todas las que la siguen', () => {
    const { s, a, b, t, q } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 2, y: 6 });
    a.x = 9; // lejos
    finishStandingOrder(s, b);
    expect(q.standingOrder).toBeDefined();
    a.x = 2;
    finishStandingOrder(s, b);
    expect(q.standingOrder).toBeUndefined();
  });

  it('salir de una escuadra (otra escuadra o disolverla): se lleva lo que estaba haciendo', () => {
    const { s, a, b, t, q } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    formSquad(s, [t]);
    expect(t.squad).not.toBe(q.id);
    expect(effectiveStandingOrder(s, t)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
    disbandSquad(s, q.id);
    expect(a.standingOrder).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('una partida de antes (orden copiada en cada unidad) carga con la orden en la escuadra', () => {
    const { s, a, b, t, q } = squadWorld();
    for (const u of [a, b, t]) u.standingOrder = { kind: u === t ? 'attack' : 'capture', at: { x: 12, y: 5 } };
    const back = deserialize(serialize(s), saveContext())!;
    expect(back.squads![0]!.standingOrder).toEqual({ kind: 'capture', at: { x: 12, y: 5 } });
    expect(back.units.every((u) => u.standingOrder === undefined)).toBe(true);
    expect(q.id).toBe(back.squads![0]!.id);
  });

  it('llevada a mano a una casilla lejana (orden de varios turnos): eso manda mientras dura', () => {
    const { s, a, b, t } = squadWorld();
    giveStandingOrder(s, [a, b, t], 'attack', { x: 15, y: 15 });
    a.travelTo = { x: 0, y: 9 };
    expect(effectiveStandingOrder(s, a)).toBeUndefined();
  });
});

describe('grupos con numero (Ctrl+n, Mayusculas+n, n)', () => {
  it('cada escuadra nueva toma la primera tecla libre; Ctrl+3 forma «Charlie» con la tecla 3', () => {
    const s = world();
    const [a, b, c] = [newUnit(s, SOLDIER, 0, { x: 1, y: 1 }), newUnit(s, SOLDIER, 0, { x: 1, y: 2 }), newUnit(s, TANK, 0, { x: 1, y: 3 })];
    expect(formSquad(s, [a])!.key).toBe(1);
    const q = setGroup(s, [b, c], 3)!;
    expect(q).toMatchObject({ key: 3, name: 'Charlie' });
    expect(squadByKey(s, 3)).toBe(q);
  });

  it('Ctrl+n otra vez: el grupo se queda solo con las nuevas (las demas salen con lo que hacian)', () => {
    const s = world();
    const [a, b, c] = [newUnit(s, SOLDIER, 0, { x: 1, y: 1 }), newUnit(s, SOLDIER, 0, { x: 1, y: 2 }), newUnit(s, TANK, 0, { x: 1, y: 3 })];
    const q = setGroup(s, [a, b], 2)!;
    giveStandingOrder(s, [a, b], 'attack', { x: 15, y: 15 });
    setGroup(s, [b, c], 2);
    expect(
      squadUnits(s, q.id)
        .map((u) => u.uid)
        .sort(),
    ).toEqual([b.uid, c.uid].sort());
    expect(a.squad).toBeUndefined();
    expect(a.standingOrder).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
    // La nueva sigue la orden del grupo.
    expect(effectiveStandingOrder(s, c)).toEqual({ kind: 'attack', at: { x: 15, y: 15 } });
  });

  it('Mayusculas+n añade al grupo (o lo forma si no existe); sale de su escuadra anterior', () => {
    const s = world();
    const [a, b, c] = [newUnit(s, SOLDIER, 0, { x: 1, y: 1 }), newUnit(s, SOLDIER, 0, { x: 1, y: 2 }), newUnit(s, TANK, 0, { x: 1, y: 3 })];
    const q1 = setGroup(s, [a], 1)!;
    const q2 = addToGroup(s, [b], 2)!;
    addToGroup(s, [c, b], 1);
    expect(squadUnits(s, q1.id).length).toBe(3);
    // La escuadra 2 se ha quedado vacia: desaparece y su tecla queda libre.
    expect(s.squads!.some((q) => q.id === q2.id)).toBe(false);
    expect(squadByKey(s, 2)).toBeUndefined();
  });

  it('las partidas de antes dan tecla a sus escuadras al cargar, sin repetir', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, { x: 1, y: 1 }),
      b = newUnit(s, SOLDIER, 0, { x: 1, y: 2 });
    formSquad(s, [a]);
    formSquad(s, [b]);
    for (const q of s.squads!) delete q.key;
    const back = deserialize(serialize(s), saveContext())!;
    expect(back.squads!.map((q) => q.key)).toEqual([1, 2]);
    s.squads![0]!.key = 4;
    s.squads![1]!.key = 4;
    expect(deserialize(serialize(s), saveContext())!.squads!.map((q) => q.key)).toEqual([4, 1]);
  });
});
