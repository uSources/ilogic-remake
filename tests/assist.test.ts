import { beforeEach, describe, expect, it } from 'vitest';
import { assistTurn, assistUnit } from '@core/ai';
import { DEFAULT_RULES, HQ, UNIT, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { newUnit, unitActions } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

/** [CAMBIO] Ayudante del jugador: unidades en automatico y fabrica automatica (assistTurn). */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0,
  FACTORY = 2;

beforeEach(() => useRules(DEFAULT_RULES));

/** Partida con las dos Bases y un edificio neutral para capturar. */
function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 6, y: 5 });
  return s;
}

describe('unidades en automatico', () => {
  it('al terminar el turno solo juegan las que estan en automatico y sin usar', () => {
    const s = world();
    const auto = newUnit(s, SOLDIER, 0, 5, 5);
    auto.auto = 'attack';
    const manual = newUnit(s, SOLDIER, 0, 3, 3);
    const used = newUnit(s, SOLDIER, 0, 8, 8);
    used.auto = 'attack';
    used.active = false;
    used.canMove = false;
    const evs = [...assistTurn(s, seededRng(1))];
    expect(evs.length).toBeGreaterThan(0);
    expect(auto.active).toBe(false);
    // La de a mano sigue intacta, y la ya usada no se mueve.
    expect(manual).toMatchObject({ x: 3, y: 3, active: true });
    expect(used).toMatchObject({ x: 8, y: 8 });
    expect(evs.every((e) => !('uid' in e) || e.uid !== manual.uid)).toBe(true);
  });

  it('una unidad en automatico va a por el edificio de al lado', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    u.auto = 'attack';
    Array.from(assistUnit(s, u.uid, seededRng(1)));
    expect({ x: u.x, y: u.y }).toEqual({ x: 6, y: 5 });
  });

  it('el menu ofrece las misiones que no tiene y Llevar a mano si esta en automatico', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    expect(unitActions(s, u)).toMatchObject({ autoCapture: true, autoDefend: true, autoAttack: true, manual: false });
    u.auto = 'defend';
    expect(unitActions(s, u)).toMatchObject({ autoCapture: true, autoDefend: false, autoAttack: true, manual: true });
    // Un tanque no captura.
    expect(unitActions(s, newUnit(s, TANK, 0, 9, 9)).autoCapture).toBe(false);
  });
});

describe('misiones', () => {
  it('capturar: va al edificio aunque tenga un enemigo a tiro', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    newUnit(s, SOLDIER, 1, 4, 6);
    u.auto = 'capture';
    Array.from(assistUnit(s, u.uid, seededRng(1)));
    expect({ x: u.x, y: u.y }).toEqual({ x: 6, y: 5 });
  });

  it('defender: no persigue a los enemigos lejanos de su casilla y vuelve a ella', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 10, 10);
    u.auto = 'defend';
    u.guard = { x: 12, y: 10 };
    // Enemigo a tiro de la unidad pero lejos de la casilla que guarda (12,10): distancia 7.
    const far = newUnit(s, SOLDIER, 1, 5, 10);
    Array.from(assistUnit(s, u.uid, seededRng(1)));
    expect(far.life).toBe(100);
    expect(Math.abs(u.x - 12) + Math.abs(u.y - 10)).toBeLessThanOrEqual(1);
  });

  it('defender: ataca a quien se acerca a su casilla', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 10, 10);
    u.auto = 'defend';
    u.guard = { x: 10, y: 10 };
    const near = newUnit(s, SOLDIER, 1, 10, 12);
    Array.from(assistUnit(s, u.uid, seededRng(1)));
    expect(near.life).toBeLessThan(100);
  });
});

describe('fabrica automatica', () => {
  const factoryWorld = (funds: number) => {
    const s = world();
    s.buildings.push({ type: FACTORY, owner: 0, x: 4, y: 4 });
    s.funds = [funds, 5000];
    return s;
  };

  it('apagada no compra nada', () => {
    const s = factoryWorld(20000);
    expect([...assistTurn(s, seededRng(1))]).toEqual([]);
    expect(s.units).toHaveLength(0);
  });

  it('encendida compra en los edificios libres y no se pasa del dinero', () => {
    const s = factoryWorld(20000);
    s.assist = { produce: 'balanced' };
    const evs = [...assistTurn(s, seededRng(1))];
    expect(evs.some((e) => e.kind === 'spawn')).toBe(true);
    expect(s.funds[0]).toBeGreaterThanOrEqual(0);
    expect(s.units.every((u) => u.team === 0)).toBe(true);
  });

  it('ofensiva compra mas de lo que combate de cerca; defensiva, de lo que dispara a distancia', () => {
    const tally = (posture: 'attack' | 'defense') => {
      let fighters = 0,
        ranged = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const s = factoryWorld(30000);
        // Con capturadores de sobra, para que no fuerce infanteria.
        for (let i = 0; i < 6; i++) newUnit(s, SOLDIER, 0, 10 + i, 10);
        s.assist = { produce: posture };
        Array.from(assistTurn(s, seededRng(seed)));
        const bought = s.units.filter((u) => u.x === 4 && u.y === 4);
        for (const u of bought) {
          if (UNIT.canfight[u.type] && !UNIT.cancapt[u.type]) fighters++;
          if (UNIT.minalc[u.type]! > 0) ranged++;
        }
      }
      return { fighters, ranged };
    };
    const atk = tally('attack');
    const def = tally('defense');
    expect(atk.fighters - atk.ranged).toBeGreaterThan(def.fighters - def.ranged);
    expect(def.ranged).toBeGreaterThan(atk.ranged);
  });

  it('no ahorra: si no llega para nada, no compra y guarda el dinero', () => {
    const s = factoryWorld(100);
    s.assist = { produce: 'attack' };
    expect([...assistTurn(s, seededRng(1))]).toEqual([]);
    expect(s.funds[0]).toBe(100);
  });
});

describe('partidas guardadas', () => {
  it('guardan el automatico de cada unidad y la postura de la fabrica', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 5, 5);
    u.auto = 'defend';
    u.guard = { x: 5, y: 5 };
    s.assist = { produce: 'defense' };
    const back = deserialize(serialize(s))!;
    expect(back.units[0]).toMatchObject({ auto: 'defend', guard: { x: 5, y: 5 } });
    expect(back.assist).toEqual({ produce: 'defense' });
  });

  it('una postura que no existe se ignora', () => {
    const s = world();
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    raw.assist = { produce: 'loco' };
    expect(deserialize(JSON.stringify(raw))!.assist).toBeUndefined();
  });
});
