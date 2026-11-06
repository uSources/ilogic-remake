import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { defaultContent } from '@core/content/default';
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
  type MovePath,
} from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { blankState, savedByVersion1, unitTypeNamed, terrainNamed, hqId } from './helpers';

const HQ = hqId();

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  ARTILLERY = unitTypeNamed('Artillery'),
  TRANSPORT = unitTypeNamed('Transport');
const WOODS = 'Woods';

describe('ayudas de reglas', () => {
  it('proteccion de casilla: terreno por edificio, y estrellas de 0 a 4', () => {
    const s = blankState();
    s.map[3]![3] = WOODS;
    s.buildings.push({ type: HQ, owner: 0, x: 5, y: 5, capture: null });
    expect(tileProtection(s, { x: 0, y: 0 })).toBe(defaultContent().plainTerrain.protection);
    expect(tileProtection(s, { x: 3, y: 3 })).toBe(terrainNamed('Woods').protection);
    expect(tileProtection(s, { x: 5, y: 5 })).toBeCloseTo(defaultContent().plainTerrain.protection * defaultContent().hq.protection);
    for (const pos of [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 5, y: 5 },
    ]) {
      const stars = defenseStars(s, pos);
      expect(stars).toBeGreaterThanOrEqual(0);
      expect(stars).toBeLessThanOrEqual(4);
    }
    expect(defenseStars(s, { x: 5, y: 5 })).toBeGreaterThanOrEqual(defenseStars(s, { x: 0, y: 0 }));
  });

  it('casillas alcanzables = las de paso > 0, en orden de columnas', () => {
    const s = blankState();
    const unit = newUnit(s, SOLDIER, 0, { x: 10, y: 10 });
    const range = moveRange(s, unit);
    const tiles = reachableTiles(range);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((pos) => range.steps.at(pos) > 0)).toBe(true);
    expect(tiles.some((pos) => pos.x === 10 && pos.y === 10)).toBe(false);
    const sorted = [...tiles].sort((firstPos, secondPos) => firstPos.x - secondPos.x || firstPos.y - secondPos.y);
    expect(tiles).toEqual(sorted);
  });

  it('zona de ataque: la de la amenaza con el alcance dado; nada si no puede disparar', () => {
    const s = blankState();
    const tank = newUnit(s, TANK, 0, { x: 10, y: 10 });
    const range = moveRange(s, tank);
    expect(attackZone(s, tank, range)).toEqual(unitThreat(s, tank, undefined, range));
    tank.turnState = 'done';
    expect(attackZone(s, tank, range)).toBeNull();
    const truck = newUnit(s, TRANSPORT, 0, { x: 2, y: 2 });
    expect(attackZone(s, truck, moveRange(s, truck))).toBeNull();
    // La artilleria (no mueve y dispara) ataca solo desde donde esta, a distancia.
    const art = newUnit(s, ARTILLERY, 0, { x: 20, y: 20 });
    const zone = attackZone(s, art, moveRange(s, art))!;
    expect(zone.at({ x: 20, y: 20 })).toBe(false);
    expect(zone.at({ x: 20, y: 20 + ARTILLERY.attack!.maxRange })).toBe(true);
  });

  it('eventos: forma unica para mover (con o sin emboscada) y capturar', () => {
    const path: MovePath = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    expect(moveEvent(0, 4, path)).toEqual({ kind: 'move', actor: 0, uid: 4, path });
    path.ambush = { x: 3, y: 1 };
    expect(moveEvent(0, 4, path)).toEqual({ kind: 'move', actor: 0, uid: 4, path, ambush: { x: 3, y: 1 } });
    const s = blankState();
    const unit = newUnit(s, SOLDIER, 0, { x: 4, y: 4 });
    const building = { type: 'City', owner: 1 as const, x: 4, y: 4, capture: null };
    expect(captureEvent(0, unit, building, { left: 10, total: 20 })).toEqual({
      kind: 'capture',
      actor: 0,
      uid: unit.uid,
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
    newUnit(s, SOLDIER, 0, { x: 3, y: 3 });
    newUnit(s, TANK, 1, { x: 30, y: 30 });
    s.buildings.push({ type: HQ, owner: 0, x: 1, y: 1, capture: null });
    return s;
  };

  it('ida y vuelta sin perder nada', () => {
    const s = sample();
    expect(serialize(deserialize(serialize(s), saveContext(defaultContent()))!)).toBe(serialize(s));
  });

  it.each([
    ['JSON roto', () => '{'],
    ['version desconocida', () => serialize({ ...sample(), version: 8 as 7 })],
    [
      'caida apuntada de un equipo que sigue en pie',
      () => {
        const s = sample();
        s.teams[1]!.fell = { order: 1, reason: 'hq' };
        return serialize(s);
      },
    ],
    [
      'caida por rendirse de un equipo que no se ha rendido',
      () => {
        const s = sample();
        s.buildings = s.buildings.filter((building) => building.owner !== 1);
        s.teams[1]!.fell = { order: 1, reason: 'surrender' };
        return serialize(s);
      },
    ],
    ['mapa no cuadrado', () => serialize({ ...sample(), map: sample().map.slice(1) })],
    [
      'terreno fuera de rango',
      () => {
        const s = sample();
        s.map[0]![0] = 'Lava';
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
        s.buildings[0]!.type = 'Castle';
        return serialize(s);
      },
    ],
    [
      'objetivo de mision invalido',
      () => serialize({ ...sample(), mission: { id: 'x', objective: { kind: 'survive', days: 0 } } as never }),
    ],
  ])('rechaza: %s', (_name, make) => {
    expect(deserialize(make(), saveContext(defaultContent()))).toBeNull();
  });

  it('corrige lo que se puede corregir (uid siguiente, dia) e ignora el combustible de las antiguas', () => {
    const s = sample();
    Object.assign(s.units[0]!, { fuel: 1e9, ammo: 3 }); // partida guardada antes de quitarlos
    s.nextUid = 0;
    s.day = -3;
    const back = deserialize(savedByVersion1(serialize(s)), saveContext(defaultContent()))!;
    expect(back.units[0]).not.toHaveProperty('fuel');
    expect(back.units[0]).not.toHaveProperty('ammo');
    expect(back.nextUid).toBeGreaterThan(Math.max(...back.units.map((unit) => unit.uid)));
    expect(back.day).toBe(1);
  });
});
