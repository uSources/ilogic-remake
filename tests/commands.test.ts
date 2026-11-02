import { beforeEach, describe, expect, it } from 'vitest';
import { assistTurn, commandNow } from '@core/ai';
import { DEFAULT_RULES, HQ, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { newUnit, unitActions } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import {
  SQUAD_NAME_MAX,
  cancelCommand,
  commandBlock,
  commandChoices,
  disbandSquad,
  formSquad,
  giveCommand,
  pruneSquads,
  renameSquad,
  squadUnits,
} from '@core/squads';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

/** [CAMBIO] Ordenes con destino estilo RTS y escuadras con nombre. */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0,
  FACTORY = 2;

beforeEach(() => useRules(DEFAULT_RULES));

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
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    giveCommand([u], 'capture', { x: 12, y: 5 });
    const done = turns(s, 8);
    expect(s.buildings[2]!.owner).toBe(0);
    expect(done).toContain(u.uid);
    expect(u.command).toBeUndefined();
    expect({ x: u.x, y: u.y }).toEqual({ x: 12, y: 5 });
  });

  it('capturar aqui no se desvia hacia otro edificio mas cercano', () => {
    const s = world();
    s.buildings.push({ type: CITY, owner: null, x: 5, y: 6 });
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    giveCommand([u], 'capture', { x: 12, y: 5 });
    turns(s, 1);
    expect(u.x).toBeGreaterThan(5);
    expect(s.buildings[3]!.capture ?? null).toBeNull();
  });

  it('atacar aqui: dispara a lo que encuentra por el camino y no persigue a los que se alejan', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    const onWay = newUnit(s, SOLDIER, 1, 7, 5);
    const far = newUnit(s, SOLDIER, 1, 5, 12); // a la vista pero fuera de tiro y fuera del camino
    giveCommand([u], 'attack', { x: 15, y: 5 });
    turns(s, 1);
    expect(onWay.life).toBeLessThan(100);
    expect(far.life).toBe(100);
  });

  it('atacar aqui: al llegar sin enemigos cerca, la orden se cumple', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    giveCommand([u], 'attack', { x: 9, y: 5 });
    const done = turns(s, 3);
    expect(done).toContain(u.uid);
    expect(u.command).toBeUndefined();
    expect(Math.abs(u.x - 9) + Math.abs(u.y - 5)).toBeLessThanOrEqual(1);
  });

  it('defender aqui: va a la casilla, ataca a quien se acerca y no se cumple nunca', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    giveCommand([u], 'defend', { x: 8, y: 5 });
    turns(s, 2);
    expect(Math.abs(u.x - 8) + Math.abs(u.y - 5)).toBeLessThanOrEqual(1);
    const near = newUnit(s, SOLDIER, 1, 8, 7);
    const far = newUnit(s, SOLDIER, 1, 8, 13);
    turns(s, 1);
    expect(near.life).toBeLessThan(100);
    expect(far.life).toBe(100);
    expect(u.command?.kind).toBe('defend');
  });

  it('con capturar, las que no capturan escoltan atacando hacia alli', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, 5, 5);
    const b = newUnit(s, TANK, 0, 5, 6);
    expect(giveCommand([a, b], 'capture', { x: 12, y: 5 })).toBe(2);
    expect(a.command?.kind).toBe('capture');
    expect(b.command).toEqual({ kind: 'attack', at: { x: 12, y: 5 } });
  });

  it('capturar solo se puede en edificios que no son tuyos y con alguien que capture', () => {
    const s = world();
    const t = newUnit(s, TANK, 0, 5, 5);
    const sol = newUnit(s, SOLDIER, 0, 5, 6);
    expect(commandBlock(s, 'capture', { x: 3, y: 3 }, [sol])).toBe('noBuilding');
    expect(commandBlock(s, 'capture', { x: 0, y: 0 }, [sol])).toBe('noBuilding');
    expect(commandBlock(s, 'capture', { x: 12, y: 5 }, [t])).toBe('noCapturer');
    expect(commandBlock(s, 'capture', { x: 12, y: 5 }, [t, sol])).toBeNull();
    expect(commandBlock(s, 'attack', { x: 3, y: 3 }, [t])).toBeNull();
  });

  it('ordenes que se ofrecen en una casilla (gesto en el mapa): atacar primero si hay enemigo, capturar si se puede', () => {
    const s = world();
    const t = newUnit(s, TANK, 0, 5, 5);
    const sol = newUnit(s, SOLDIER, 0, 5, 6);
    const foe = newUnit(s, SOLDIER, 1, 9, 9);
    // Casilla vacia: atacar o defender.
    expect(commandChoices(s, { x: 3, y: 3 }, [sol], false)).toEqual(['attack', 'defend']);
    // Ciudad neutral: capturar va primero, pero solo si alguna puede capturar.
    expect(commandChoices(s, { x: 12, y: 5 }, [sol], false)).toEqual(['capture', 'attack', 'defend']);
    expect(commandChoices(s, { x: 12, y: 5 }, [t], false)).toEqual(['attack', 'defend']);
    expect(commandChoices(s, { x: 12, y: 5 }, [t, sol], false)).toEqual(['capture', 'attack', 'defend']);
    // Edificio propio: no se captura.
    expect(commandChoices(s, { x: 0, y: 0 }, [sol], false)).toEqual(['attack', 'defend']);
    // Enemigo visible: atacar primero (tambien sobre un edificio que se puede capturar).
    expect(commandChoices(s, foe, [sol], true)).toEqual(['attack', 'defend']);
    expect(commandChoices(s, { x: 19, y: 19 }, [sol], true)).toEqual(['attack', 'capture', 'defend']);
    // Sin unidades propias no hay nada que ofrecer.
    expect(commandChoices(s, { x: 3, y: 3 }, [foe], false)).toEqual([]);
    expect(commandChoices(s, { x: 3, y: 3 }, [], false)).toEqual([]);
  });

  it('solo juegan las que tienen orden y siguen sin usar; nunca compra', () => {
    const s = world();
    s.buildings.push({ type: FACTORY, owner: 0, x: 4, y: 4 });
    s.funds = [50000, 5000];
    const free = newUnit(s, SOLDIER, 0, 3, 3);
    const used = newUnit(s, SOLDIER, 0, 8, 8);
    giveCommand([used], 'attack', { x: 15, y: 15 });
    Object.assign(used, { active: false, canMove: false });
    const evs = Array.from(assistTurn(s, seededRng(1)));
    expect(evs).toEqual([]);
    expect(free).toMatchObject({ x: 3, y: 3, active: true });
    expect(used).toMatchObject({ x: 8, y: 8 });
    expect(s.funds[0]).toBe(50000);
  });

  it('commandNow la pone en marcha ya; cancelar la deja esperando', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    giveCommand([u], 'capture', { x: 12, y: 5 });
    Array.from(commandNow(s, u.uid, seededRng(1)));
    expect(u.x).toBeGreaterThan(5);
    cancelCommand([u]);
    expect(u.command).toBeUndefined();
  });

  it('el menu ofrece las ordenes que puede cumplir y cancelar si tiene una', () => {
    const s = world();
    const sol = newUnit(s, SOLDIER, 0, 5, 5);
    const tank = newUnit(s, TANK, 0, 6, 6);
    expect(unitActions(s, sol)).toMatchObject({ cmdAttack: true, cmdCapture: true, cmdDefend: true, cmdCancel: false });
    expect(unitActions(s, tank).cmdCapture).toBe(false);
    giveCommand([tank], 'defend', { x: 6, y: 6 });
    expect(unitActions(s, tank).cmdCancel).toBe(true);
  });
});

describe('escuadras', () => {
  it('se forman con nombre libre, se renombran y se deshacen', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, 5, 5);
    const b = newUnit(s, TANK, 0, 5, 6);
    const enemy = newUnit(s, SOLDIER, 1, 9, 9);
    const q1 = formSquad(s, [a, b, enemy])!;
    expect(q1.name).toBe('Alfa');
    expect(squadUnits(s, q1.id).map((u) => u.uid)).toEqual([a.uid, b.uid]);
    expect(enemy.squad).toBeUndefined();
    const c = newUnit(s, SOLDIER, 0, 6, 6);
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
    const a = newUnit(s, SOLDIER, 0, 5, 5);
    formSquad(s, [a]);
    formSquad(s, [a], 'Nueva');
    expect(s.squads!.map((q) => q.name)).toEqual(['Nueva']);
  });

  it('una escuadra cuyas unidades caen desaparece', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, 5, 5);
    formSquad(s, [a]);
    s.units = [];
    pruneSquads(s);
    expect(s.squads).toBeUndefined();
  });

  it('las ordenes y las escuadras se guardan con la partida', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, 5, 5);
    const q = formSquad(s, [a], 'Lobos')!;
    giveCommand([a], 'capture', { x: 12, y: 5 });
    const back = deserialize(serialize(s))!;
    expect(back.squads).toEqual([{ id: q.id, name: 'Lobos' }]);
    expect(back.units[0]).toMatchObject({ squad: q.id, command: { kind: 'capture', at: { x: 12, y: 5 } } });
  });

  it('una orden o escuadra rota se ignora al cargar', () => {
    const s = world();
    newUnit(s, SOLDIER, 0, 5, 5);
    const raw = JSON.parse(serialize(s)) as { units: Record<string, unknown>[]; squads?: unknown };
    raw.units[0]!.command = { kind: 'bailar', at: { x: 1, y: 1 } };
    raw.units[0]!.squad = 7;
    const back = deserialize(JSON.stringify(raw))!;
    expect(back.units[0]!.command).toBeUndefined();
    expect(back.units[0]!.squad).toBeUndefined();
  });
});
