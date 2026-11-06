import { describe, expect, it } from 'vitest';
import { aiTurn, assistTurn, previewStandingOrders } from '@core/ai';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { posOf } from '@core/geom';
import { seededRng } from '@core/util/random';
import { newUnit, visibility } from '@core/rules';
import { serialize } from '@core/save';
import { giveStandingOrder } from '@core/squads/standingOrders';
import type { GameState, Pos } from '@core/model';
import { blankState, unitTypeNamed, hqId } from './helpers';

const HQ = hqId();

/** [CAMBIO] Flechas de intencion: previewStandingOrders dice lo que hara cada orden al terminar el turno. */
const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank'),
  CITY = 'City';

function world(): GameState {
  const s = blankState();
  s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 19, y: 19 }, { type: CITY, owner: null, x: 12, y: 5 });
  return s;
}

/** Juega el turno de ordenes de verdad (con los dados de la partida, otra suerte que la de la prevision). */
function playOrders(s: GameState, diceSeed = 99): void {
  s.dice = diceSeed;
  Array.from(assistTurn(s, 0));
}

const last = (path: Pos[]): Pos | undefined => path[path.length - 1];

describe('previewStandingOrders', () => {
  it('capturar: prevé el camino hasta el edificio y la captura, y el turno real hace eso', () => {
    const s = world();
    const unit = newUnit(s, SOLDIER, 0, { x: 9, y: 5 });
    giveStandingOrder(s, 0, [unit], 'capture', { x: 12, y: 5 });
    const it = previewStandingOrders(s, 0).get(unit.uid)!;
    expect(it.path[0]).toEqual({ x: 9, y: 5 });
    expect(last(it.path)).toEqual({ x: 12, y: 5 });
    expect(it.capture).toEqual({ x: 12, y: 5 });
    expect(it.attack).toBeUndefined();
    playOrders(s);
    expect(posOf(unit)).toEqual({ x: 12, y: 5 });
    expect(s.buildings[2]!.capture?.team ?? s.buildings[2]!.owner).toBe(0);
  });

  it('atacar: prevé a quien dispara y desde donde, y el turno real hace eso', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    const foe = newUnit(s, SOLDIER, 1, { x: 9, y: 5 });
    giveStandingOrder(s, 0, [unit], 'attack', { x: 15, y: 5 });
    const it = previewStandingOrders(s, 0).get(unit.uid)!;
    expect(it.attack).toEqual({ x: 9, y: 5 });
    const end = last(it.path) ?? { x: 5, y: 5 };
    playOrders(s);
    expect(foe.life).toBeLessThan(100);
    expect(posOf(unit)).toEqual(end);
  });

  it('una unidad sin nada que hacer este turno no tiene camino ni objetivo', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'defend', { x: 5, y: 6 });
    expect(previewStandingOrders(s, 0).get(unit.uid)).toEqual({ path: [] });
  });

  it('no cambia la partida y siempre da lo mismo', () => {
    const s = world();
    const soldier = newUnit(s, SOLDIER, 0, { x: 9, y: 5 });
    const tank = newUnit(s, TANK, 0, { x: 5, y: 5 });
    newUnit(s, SOLDIER, 1, { x: 9, y: 7 });
    giveStandingOrder(s, 0, [soldier], 'capture', { x: 12, y: 5 });
    giveStandingOrder(s, 0, [tank], 'attack', { x: 15, y: 5 });
    const before = serialize(s);
    const p1 = previewStandingOrders(s, 0);
    expect(serialize(s)).toBe(before);
    expect(previewStandingOrders(s, 0)).toEqual(p1);
    expect([...p1.keys()].sort()).toEqual([soldier.uid, tank.uid].sort());
  });

  it('las unidades ya usadas o sin orden no salen', () => {
    const s = world();
    const used = newUnit(s, TANK, 0, { x: 5, y: 5 });
    newUnit(s, TANK, 0, { x: 6, y: 6 });
    giveStandingOrder(s, 0, [used], 'attack', { x: 15, y: 5 });
    Object.assign(used, { turnState: 'done' });
    expect(previewStandingOrders(s, 0).size).toBe(0);
  });

  it('no delata enemigos escondidos: la prevision es la misma que si no estuvieran', () => {
    const s = world();
    const unit = newUnit(s, TANK, 0, { x: 5, y: 5 });
    giveStandingOrder(s, 0, [unit], 'attack', { x: 15, y: 5 });
    const clean = previewStandingOrders(s, 0);
    // A 7 casillas: el tanque (vision 6) no lo ve, pero llegaria a dispararle (mueve 5, alcance 2).
    const hidden = newUnit(s, SOLDIER, 1, { x: 12, y: 5 });
    expect(visibility(s, 0).at({ x: 12, y: 5 })).toBe(false);
    const withHidden = previewStandingOrders(s, 0);
    expect(withHidden).toEqual(clean);
    expect(withHidden.get(unit.uid)!.attack).toBeUndefined();
    // Sin niebla si lo ve, y la prevision si lo marca (la prueba de arriba no es casualidad).
    s.rules = rulesWith(defaultContent(), { fog: false });
    expect(previewStandingOrders(s, 0).get(unit.uid)!.attack).toEqual(posOf(hidden));
  });

  it('calcularla a mitad del turno de la IA no cambia lo que hace la IA', () => {
    const make = () => {
      const s = world();
      const mine = newUnit(s, TANK, 0, { x: 2, y: 2 });
      giveStandingOrder(s, 0, [mine], 'attack', { x: 15, y: 15 });
      newUnit(s, SOLDIER, 1, { x: 14, y: 6 });
      newUnit(s, TANK, 1, { x: 16, y: 16 });
      return s;
    };
    const first = make();
    Array.from(aiTurn(first, seededRng(5), 1));
    const second = make();
    const it = aiTurn(second, seededRng(5), 1);
    for (let step = it.next(); !step.done; step = it.next()) previewStandingOrders(second, 0);
    expect(serialize(second)).toBe(serialize(first));
  });
});
