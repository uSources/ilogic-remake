import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDING, DEFAULT_RULES, HQ, TERRAIN, UNIT, useRules } from '@core/data';
import {
  attackZone,
  captureEvent,
  defenseStars,
  moveEvent,
  moveRange,
  newUnit,
  reachableTiles,
  tileProtection,
  unitThreat,
} from '@core/rules';
import type { MovePath } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  ARTILLERY = 2,
  TRANSPORT = 7;
const WOODS = 2;

beforeEach(() => useRules(DEFAULT_RULES));

describe('ayudas de reglas', () => {
  it('proteccion de casilla: terreno por edificio, y estrellas de 0 a 4', () => {
    const s = blankState();
    s.map[3]![3] = WOODS;
    s.buildings.push({ type: HQ, owner: 0, x: 5, y: 5, capture: null });
    expect(tileProtection(s, { x: 0, y: 0 })).toBe(TERRAIN.protection[0]);
    expect(tileProtection(s, { x: 3, y: 3 })).toBe(TERRAIN.protection[WOODS]);
    expect(tileProtection(s, { x: 5, y: 5 })).toBeCloseTo(TERRAIN.protection[0]! * BUILDING.protection[HQ]!);
    for (const p of [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ]) {
      const st = defenseStars(s, p);
      expect(st).toBeGreaterThanOrEqual(0);
      expect(st).toBeLessThanOrEqual(4);
    }
    expect(defenseStars(s, { x: 5, y: 5 })).toBeGreaterThanOrEqual(defenseStars(s, { x: 0, y: 0 }));
  });

  it('casillas alcanzables = las de paso > 0, en orden de columnas', () => {
    const s = blankState();
    const u = newUnit(s, SOLDIER, 0, 10, 10);
    const r = moveRange(s, u);
    const tiles = reachableTiles(r);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((p) => r.steps[p.x]![p.y]! > 0)).toBe(true);
    expect(tiles.some((p) => p.x === 10 && p.y === 10)).toBe(false);
    const sorted = [...tiles].sort((a, b) => a.x - b.x || a.y - b.y);
    expect(tiles).toEqual(sorted);
  });

  it('zona de ataque: la de la amenaza con el alcance dado; nada si no puede disparar', () => {
    const s = blankState();
    const tank = newUnit(s, TANK, 0, 10, 10);
    const r = moveRange(s, tank);
    expect(attackZone(s, tank, r)).toEqual(unitThreat(s, tank, undefined, r));
    tank.canFire = false;
    expect(attackZone(s, tank, r)).toBeNull();
    const truck = newUnit(s, TRANSPORT, 0, 2, 2);
    expect(attackZone(s, truck, moveRange(s, truck))).toBeNull();
    // La artilleria (no mueve y dispara) ataca solo desde donde esta, a distancia.
    const art = newUnit(s, ARTILLERY, 0, 20, 20);
    const z = attackZone(s, art, moveRange(s, art))!;
    expect(z[20]![20]).toBe(false);
    expect(z[20]![20 + UNIT.alcance[ARTILLERY]!]).toBe(true);
  });

  it('eventos: forma unica para mover (con o sin emboscada) y capturar', () => {
    const path: MovePath = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    expect(moveEvent(4, path)).toEqual({ kind: 'move', uid: 4, path });
    path.ambush = { x: 3, y: 1 };
    expect(moveEvent(4, path)).toEqual({ kind: 'move', uid: 4, path, ambush: { x: 3, y: 1 } });
    const s = blankState();
    const u = newUnit(s, SOLDIER, 0, 4, 4);
    const b = { type: 0, owner: 1 as const, x: 4, y: 4, capture: null };
    expect(captureEvent(u, b, { left: 10, total: 20 })).toEqual({
      kind: 'capture',
      uid: u.uid,
      at: { x: 4, y: 4 },
      owner: 1,
      left: 10,
      total: 20,
    });
  });
});

describe('partidas guardadas', () => {
  const sample = () => {
    const s = blankState();
    newUnit(s, SOLDIER, 0, 3, 3);
    newUnit(s, TANK, 1, 30, 30);
    s.buildings.push({ type: HQ, owner: 0, x: 1, y: 1, capture: null });
    return s;
  };

  it('ida y vuelta sin perder nada', () => {
    const s = sample();
    expect(deserialize(serialize(s))).toEqual(JSON.parse(serialize(s)));
  });

  it.each([
    ['JSON roto', () => '{'],
    ['version desconocida', () => serialize({ ...sample(), version: 2 as 1 })],
    ['mapa no cuadrado', () => serialize({ ...sample(), map: sample().map.slice(1) })],
    [
      'terreno fuera de rango',
      () => {
        const s = sample();
        s.map[0]![0] = 999;
        return serialize(s);
      },
    ],
    [
      'uid repetido',
      () => {
        const s = sample();
        s.units[1]!.uid = s.units[0]!.uid;
        return serialize(s);
      },
    ],
    [
      'unidad fuera del mapa',
      () => {
        const s = sample();
        s.units[0]!.x = -1;
        return serialize(s);
      },
    ],
    [
      'bando invalido',
      () => {
        const s = sample();
        (s.units[0] as { team: number }).team = 5;
        return serialize(s);
      },
    ],
    [
      'carga incoherente',
      () => {
        const s = sample();
        s.units[0]!.carrier = s.units[1]!.uid;
        return serialize(s);
      },
    ],
    [
      'edificio de tipo desconocido',
      () => {
        const s = sample();
        s.buildings[0]!.type = 99;
        return serialize(s);
      },
    ],
    [
      'objetivo de mision invalido',
      () => serialize({ ...sample(), mission: { id: 'x', objective: { kind: 'survive', days: 0 } } as never }),
    ],
  ])('rechaza: %s', (_name, make) => {
    expect(deserialize(make())).toBeNull();
  });

  it('corrige lo que se puede corregir (uid siguiente, dia) e ignora el combustible de las antiguas', () => {
    const s = sample();
    Object.assign(s.units[0]!, { fuel: 1e9, ammo: 3 }); // partida guardada antes de quitarlos
    s.nextUid = 0;
    s.day = -3;
    const back = deserialize(serialize(s))!;
    expect(back.units[0]).not.toHaveProperty('fuel');
    expect(back.units[0]).not.toHaveProperty('ammo');
    expect(back.nextUid).toBeGreaterThan(Math.max(...back.units.map((u) => u.uid)));
    expect(back.day).toBe(1);
  });
});
