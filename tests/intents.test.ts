import { beforeEach, describe, expect, it } from 'vitest';
import { aiTurn, assistTurn, previewCommands } from '@core/ai';
import { DEFAULT_RULES, HQ, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { newUnit, visibility } from '@core/rules';
import { serialize } from '@core/save';
import { giveCommand } from '@core/squads';
import type { GameState, Pos } from '@core/types';
import { blankState } from './helpers';

/** [CAMBIO] Flechas de intencion: previewCommands dice lo que hara cada orden al terminar el turno. */
const SOLDIER = 0,
  TANK = 1,
  CITY = 0;

beforeEach(() => useRules(DEFAULT_RULES));

function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 12, y: 5 });
  return s;
}

/** Juega el turno de ordenes de verdad (otra suerte que la de la prevision). */
function playOrders(s: GameState, seed = 99): void {
  Array.from(assistTurn(s, seededRng(seed)));
}

const last = (p: Pos[]): Pos | undefined => p[p.length - 1];

describe('previewCommands', () => {
  it('capturar: prevé el camino hasta el edificio y la captura, y el turno real hace eso', () => {
    const s = world();
    const u = newUnit(s, SOLDIER, 0, 9, 5);
    giveCommand([u], 'capture', { x: 12, y: 5 });
    const it = previewCommands(s).get(u.uid)!;
    expect(it.path[0]).toEqual({ x: 9, y: 5 });
    expect(last(it.path)).toEqual({ x: 12, y: 5 });
    expect(it.capture).toEqual({ x: 12, y: 5 });
    expect(it.attack).toBeUndefined();
    playOrders(s);
    expect({ x: u.x, y: u.y }).toEqual({ x: 12, y: 5 });
    expect(s.buildings[2]!.capture?.team ?? s.buildings[2]!.owner).toBe(0);
  });

  it('atacar: prevé a quien dispara y desde donde, y el turno real hace eso', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    const foe = newUnit(s, SOLDIER, 1, 9, 5);
    giveCommand([u], 'attack', { x: 15, y: 5 });
    const it = previewCommands(s).get(u.uid)!;
    expect(it.attack).toEqual({ x: 9, y: 5 });
    const end = last(it.path) ?? { x: 5, y: 5 };
    playOrders(s);
    expect(foe.life).toBeLessThan(100);
    expect({ x: u.x, y: u.y }).toEqual(end);
  });

  it('una unidad sin nada que hacer este turno no tiene camino ni objetivo', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    giveCommand([u], 'defend', { x: 5, y: 6 });
    expect(previewCommands(s).get(u.uid)).toEqual({ path: [] });
  });

  it('no cambia la partida y siempre da lo mismo', () => {
    const s = world();
    const a = newUnit(s, SOLDIER, 0, 9, 5);
    const b = newUnit(s, TANK, 0, 5, 5);
    newUnit(s, SOLDIER, 1, 9, 7);
    giveCommand([a], 'capture', { x: 12, y: 5 });
    giveCommand([b], 'attack', { x: 15, y: 5 });
    const before = serialize(s);
    const p1 = previewCommands(s);
    expect(serialize(s)).toBe(before);
    expect(previewCommands(s)).toEqual(p1);
    expect([...p1.keys()].sort()).toEqual([a.uid, b.uid].sort());
  });

  it('las unidades ya usadas o sin orden no salen', () => {
    const s = world();
    const used = newUnit(s, TANK, 0, 5, 5);
    newUnit(s, TANK, 0, 6, 6);
    giveCommand([used], 'attack', { x: 15, y: 5 });
    Object.assign(used, { active: false, canMove: false });
    expect(previewCommands(s).size).toBe(0);
  });

  it('no delata enemigos escondidos: la prevision es la misma que si no estuvieran', () => {
    const s = world();
    const u = newUnit(s, TANK, 0, 5, 5);
    giveCommand([u], 'attack', { x: 15, y: 5 });
    const clean = previewCommands(s);
    // A 7 casillas: el tanque (vision 6) no lo ve, pero llegaria a dispararle (mueve 5, alcance 2).
    const hidden = newUnit(s, SOLDIER, 1, 12, 5);
    expect(visibility(s, 0)[12]![5]).toBe(false);
    const withHidden = previewCommands(s);
    expect(withHidden).toEqual(clean);
    expect(withHidden.get(u.uid)!.attack).toBeUndefined();
    // Sin niebla si lo ve, y la prevision si lo marca (la prueba de arriba no es casualidad).
    useRules({ ...DEFAULT_RULES, fog: false });
    expect(previewCommands(s).get(u.uid)!.attack).toEqual({ x: hidden.x, y: hidden.y });
  });

  it('calcularla a mitad del turno de la IA no cambia lo que hace la IA', () => {
    const make = () => {
      const s = world();
      const mine = newUnit(s, TANK, 0, 2, 2);
      giveCommand([mine], 'attack', { x: 15, y: 15 });
      newUnit(s, SOLDIER, 1, 14, 6);
      newUnit(s, TANK, 1, 16, 16);
      return s;
    };
    const a = make();
    Array.from(aiTurn(a, seededRng(5), 1));
    const b = make();
    const it = aiTurn(b, seededRng(5), 1);
    for (let r = it.next(); !r.done; r = it.next()) previewCommands(b);
    expect(serialize(b)).toBe(serialize(a));
  });
});
