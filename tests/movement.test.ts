import { unitTypeOf } from '@core/gameContent';
import { saveContext } from '@core/defaultGames';
import { describe, expect, it } from 'vitest';

import { PLAIN_RULES } from './plainRules';
import { moveRange, pathTo, validPath, visibility, newUnit } from '@core/rules';
import { dispatch } from '@core/actions';
import type { GameEvent, GameState, Pos } from '@core/model';
import { act, blankState, savedByVersion1, unitTypeNamed } from './helpers';

/** El camino del suceso de mover (o de unirse) que ha dejado una accion. */
function pathOf(events: GameEvent[]): Pos[] & { ambush?: Pos } {
  const event = events[0];
  if (event?.kind !== 'move' && event?.kind !== 'merge') throw new Error('no se ha movido');
  return Object.assign(event.path, event.kind === 'move' && event.ambush ? { ambush: event.ambush } : {});
}

/** El equipo 0 mueve la unidad `uid` (por dispatch) y da el camino recorrido. */
const move = (s: GameState, uid: number, to: Pos, path?: Pos[]) => pathOf(act(s, 0, { kind: 'move', uid, to, path }));
import { defaultContent } from '@core/content/default';

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  TRANSPORT = unitTypeNamed('Transport');

describe('movimiento: pasar entre aliados', () => {
  it('se atraviesa a un aliado pero no se puede terminar encima', () => {
    const s = blankState();
    // Pasillo de agua: solo se puede ir en linea recta.
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, TANK, 0, { x: 3, y: 5 });
    const range = moveRange(s, tank);
    expect(range.steps.at({ x: 3, y: 5 })).toBe(0); // ocupada por el aliado
    expect(range.steps.at({ x: 4, y: 5 })).toBe(2); // pero se llega a la siguiente
  });

  it('con los interruptores apagados el aliado bloquea', () => {
    const s = blankState(PLAIN_RULES);
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, TANK, 0, { x: 3, y: 5 });
    expect(moveRange(s, tank).steps.at({ x: 4, y: 5 })).toBe(0);
  });
});

describe('movimiento: emboscadas en la niebla', () => {
  // Aqui solo interesa la niebla: sin coste de terreno (el bosque frenaria a los tanques).
  /** Pasillo horizontal en y=5 con un bosque en x=6 donde se esconde un soldado enemigo. */
  function corridor() {
    const s = blankState({ terrainCost: false });
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    s.map[6]![5] = 'Woods';
    return s;
  }

  it('el bosque esconde a quien esta dentro salvo desde al lado', () => {
    const s = corridor();
    newUnit(s, TANK, 0, { x: 2, y: 5 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    expect(visibility(s, 0).at(enemy)).toBe(false);
    newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    expect(visibility(s, 0).at(enemy)).toBe(true);
  });

  it('el alcance no delata a un enemigo escondido', () => {
    const s = corridor();
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    const range = moveRange(s, tank);
    expect(range.steps.at({ x: 6, y: 5 })).toBe(4);
    expect(range.steps.at({ x: 7, y: 5 })).toBe(5);
  });

  it('al chocar con el enemigo escondido, se para antes y pierde el turno', () => {
    const s = corridor();
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    const path = move(s, tank.uid, { x: 7, y: 5 });
    expect(path.ambush).toEqual({ x: 6, y: 5 });
    expect(tank.x).toBe(5);
    expect(tank.turnState).toBe('done');
  });

  it('si la casilla anterior a la emboscada es de un aliado, se para en la de antes', () => {
    const s = corridor();
    const tank = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, SOLDIER, 0, { x: 4, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    // Con el soldado propio en (4,5) el bosque de (6,5) sigue sin verse desde (4,5): distancia 2.
    const path = move(s, tank.uid, { x: 7, y: 5 });
    expect(path.ambush).toEqual({ x: 6, y: 5 });
    expect(tank.x).toBe(5);
    s.units.find((unit) => unit.team === 0 && unitTypeOf(s, unit) === SOLDIER)!.x = 5;
    tank.x = 2;
    tank.turnState = 'ready';
    const p2 = dispatch(s, 0, { kind: 'move', uid: tank.uid, to: { x: 7, y: 5 } }).ok ? 'moved' : null;
    // Ahora el soldado propio esta al lado del bosque: el enemigo se ve y bloquea, no hay camino.
    expect(p2).toBeNull();
  });

  it('unirse tambien puede acabar en emboscada', () => {
    const s = corridor();
    s.map[6]![5] = 'Grass';
    s.map[4]![5] = 'Woods';
    const tank = newUnit(s, TANK, 0, { x: 1, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 4, y: 5 });
    const target = newUnit(s, TANK, 0, { x: 6, y: 5 });
    tank.life = 40;
    target.life = 50;
    const path = pathOf(act(s, 0, { kind: 'merge', uid: tank.uid, into: target.uid }));
    expect(path.ambush).toEqual({ x: 4, y: 5 });
    expect(s.units.includes(tank)).toBe(true);
    expect(tank.x).toBe(3);
    expect(target.life).toBe(50);
    void TRANSPORT;
  });

  it('con los interruptores apagados no hay bosque que esconda ni emboscadas', () => {
    const s = corridor();
    s.rules = { ...PLAIN_RULES };
    newUnit(s, TANK, 0, { x: 2, y: 5 });
    const enemy = newUnit(s, SOLDIER, 1, { x: 6, y: 5 });
    expect(visibility(s, 0).at(enemy)).toBe(true);
  });
});

describe('movimiento: camino trazado a mano', () => {
  it('se acepta un camino valido distinto del mas corto y se gasta su longitud', () => {
    const s = blankState();
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const range = moveRange(s, tank);
    const via = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 7, y: 6 },
      { x: 7, y: 5 },
    ];
    expect(validPath(s, tank, via, range)).toBe(true);
    expect(move(s, tank.uid, { x: 7, y: 5 }, via)).toEqual(via);
  });

  it('caminos no validos: saltos, repetir casilla o pasarse de movimiento', () => {
    const s = blankState();
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const range = moveRange(s, tank);
    expect(
      validPath(
        s,
        tank,
        [
          { x: 5, y: 5 },
          { x: 7, y: 5 },
        ],
        range,
      ),
    ).toBe(false);
    expect(
      validPath(
        s,
        tank,
        [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ],
        range,
      ),
    ).toBe(false);
    const long = Array.from({ length: 7 }, (_, i) => ({ x: 5 + i, y: 5 }));
    expect(validPath(s, tank, long, range)).toBe(false);
  });
});

describe('movimiento: coste del terreno', () => {
  it('el bosque cuesta 2 a los vehiculos y 1 a pie; el combustible se gasta segun el coste', () => {
    const s = blankState();
    for (let x = 6; x <= 7; x++) s.map[x]![5] = 'Woods'; // dos casillas de bosque
    for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const range = moveRange(s, tank);
    expect(range.steps.at({ x: 6, y: 5 })).toBe(2);
    expect(range.steps.at({ x: 7, y: 5 })).toBe(4);
    expect(range.steps.at({ x: 8, y: 5 })).toBe(5);
    expect(range.steps.at({ x: 9, y: 5 })).toBe(0); // 6 > movimiento 5
    move(s, tank.uid, { x: 8, y: 5 });
    const sol = newUnit(s, SOLDIER, 0, { x: 5, y: 5 });
    expect(moveRange(s, sol).steps.at({ x: 7, y: 5 })).toBe(2);
  });

  it('prefiere rodear por llanura si sale mas barato', () => {
    const s = blankState();
    s.map[6]![5] = 'Woods';
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const range = moveRange(s, tank);
    expect(range.steps.at({ x: 7, y: 5 })).toBe(3); // por el bosque costaria 3 tambien (2+1)
    s.map[6]![5] = 'SnowWood'; // bosque nevado: 3 para vehiculos
    const r2 = moveRange(s, tank);
    expect(r2.steps.at({ x: 7, y: 5 })).toBe(4); // rodeando: abajo, derecha, derecha, arriba
  });

  it('con los interruptores apagados todo cuesta 1', () => {
    const s = blankState(PLAIN_RULES);
    s.map[6]![5] = 'Woods';
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    expect(moveRange(s, tank).steps.at({ x: 6, y: 5 })).toBe(1);
  });
});

describe('movimiento: ordenes de varios turnos', () => {
  it('stepToward acerca la unidad al destino y el viaje se guarda con la partida', async () => {
    const { stepToward } = await import('@core/rules');
    const { deserialize, serialize } = await import('@core/save');
    const s = blankState();
    const tank = newUnit(s, TANK, 0, { x: 2, y: 2 });
    const goal = { x: 20, y: 2 };
    const step = stepToward(s, tank, goal)!;
    expect(step).toEqual({ x: 7, y: 2 });
    tank.travelTo = goal;
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.units[0]!.travelTo).toEqual(goal);
    // Las guardadas antes de llamarlo travelTo lo traen como `order` (MIGRATIONS).
    const old = savedByVersion1(serialize(s).replace('"travelTo"', '"order"'));
    expect(old).toContain('"order"');
    expect(deserialize(old, saveContext(defaultContent()))!.units[0]!.travelTo).toEqual(goal);
    // Un destino al que no se puede llegar (agua para un tanque): null.
    s.map[25]![25] = 'Water';
    expect(stepToward(s, tank, { x: 25, y: 25 })).toBeNull();
  });
});

describe('movimiento: el camino es de casillas, no de lo que hay en ellas', () => {
  it('pathTo da casillas nuevas, aunque el destino sea un edificio', () => {
    const s = blankState(PLAIN_RULES);
    const tank = newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    const building = { type: 'City', owner: null, x: 4, y: 2, capture: null };
    s.buildings.push(building);
    const path = pathTo(moveRange(s, tank), tank, building);
    expect(path.at(-1)).toEqual({ x: 4, y: 2 });
    expect(path.at(-1)).not.toBe(building);
  });
});
