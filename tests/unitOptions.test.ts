import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { moveRange } from '@core/rules';
import type { GameState, Unit } from '@core/model';
import { chipChoices, groupRadialOptions, orderForTile, radialOptions } from '../src/view3d/systems/turn/unitOptions';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/**
 * Lo que enseña la interfaz limpia junto a lo elegido: el bocadillo (atacar con cuantos hay a tiro, lo
 * que no es tocar el tablero y capturar apagado con el porque) y la rueda (lo raro).
 */

const SOLDIER = unitTypeNamed('Soldier');
const SUPPLIER = unitTypeNamed('Supplier');
const TANK = unitTypeNamed('Tank');

/** El bocadillo de una unidad que aun no se ha movido (llega a donde le deja su movimiento). */
const chipsOf = (s: GameState, unit: Unit) => chipChoices(s, PLAYER, unit, moveRange(s, unit));

describe('bocadillo de una unidad', () => {
  it('en campo abierto, solo capturar apagado: esperar, ordenes y disolver van a la rueda', () => {
    const s = blankState();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    expect(chipsOf(s, soldier)).toEqual([{ option: 'capture', blocked: 'noBuilding' }]);
  });

  it('encima de un edificio ajeno, capturar', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    expect(chipsOf(s, soldier)).toEqual([{ option: 'capture' }]);
  });

  it('encima de un edificio propio, capturar apagado: ya es de los suyos', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: PLAYER, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    expect(chipsOf(s, soldier)).toEqual([{ option: 'capture', blocked: 'allied' }]);
  });

  it('una que no captura no lleva capturar apagado (seria ruido en cada bocadillo)', () => {
    const s = blankState();
    const tank = newUnit(s, TANK, PLAYER, { x: 5, y: 5 });
    expect(chipsOf(s, tank)).toEqual([]);
  });

  it('con enemigos a tiro, atacar primero con cuantos hay (tambien los que alcanza moviendose)', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 6, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    newUnit(s, SOLDIER, ENEMY, { x: 20, y: 20 });
    const [first, ...rest] = chipsOf(s, soldier);
    expect(first).toEqual({ option: 'attack', targets: 2 });
    expect(rest).toEqual([{ option: 'capture', blocked: 'noBuilding' }]);
  });

  it('ya sin moverse, solo cuentan los que tiene al lado', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 6, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    expect(chipChoices(s, PLAYER, soldier, null)[0]).toEqual({ option: 'attack', targets: 1 });
  });

  it('un enemigo escondido en el bosque no cuenta aunque llegue a el (no se delata)', () => {
    const s = blankState({ fog: true, forestHides: true });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    newUnit(s, SOLDIER, ENEMY, { x: 5, y: 8 });
    // Llega: dos pasos y le dispara desde al lado. Pero el bosque solo se ve desde al lado.
    expect(chipsOf(s, soldier)[0]).toEqual({ option: 'attack', targets: 1 });
    s.map[5]![8] = 'Woods';
    expect(chipsOf(s, soldier).map((choice) => choice.option)).not.toContain('attack');
  });

  it('suministros junto a un aliado herido: reparar', () => {
    const s = blankState();
    const supplier = newUnit(s, SUPPLIER, PLAYER, { x: 5, y: 5 });
    newUnit(s, TANK, PLAYER, { x: 6, y: 5 }).life = 40;
    expect(chipsOf(s, supplier)).toContainEqual({ option: 'supply' });
  });
});

describe('rueda', () => {
  it('de una unidad: esperar primero y disolver al final', () => {
    const s = blankState();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    const radial = radialOptions(s, PLAYER, soldier);
    expect(radial[0]).toBe('wait');
    expect(radial).toEqual(expect.arrayContaining(['orderToAttack', 'orderToCapture', 'orderToDefend']));
    expect(radial.at(-1)).toBe('delete');
  });

  it('de un grupo: ordenes y formar escuadra', () => {
    const s = blankState();
    const units = [newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 }), newUnit(s, SOLDIER, PLAYER, { x: 5, y: 6 })];
    expect(groupRadialOptions(s, PLAYER, units)).toEqual(expect.arrayContaining(['orderToDefend', 'squadForm']));
  });
});

describe('la orden del clic derecho', () => {
  it('un enemigo que se ve: atacar; un edificio ajeno: capturar; lo demas: defender', () => {
    const s = blankState({ fog: false });
    newUnit(s, SOLDIER, ENEMY, { x: 9, y: 9 });
    s.buildings.push({ type: 'City', owner: null, x: 12, y: 5, capture: null });
    expect(orderForTile(s, PLAYER, { x: 9, y: 9 })).toBe('attack');
    expect(orderForTile(s, PLAYER, { x: 12, y: 5 })).toBe('capture');
    expect(orderForTile(s, PLAYER, { x: 3, y: 3 })).toBe('defend');
  });

  it('un enemigo en la niebla no se delata: es defender', () => {
    const s = blankState({ fog: true });
    newUnit(s, SOLDIER, PLAYER, { x: 1, y: 1 });
    newUnit(s, SOLDIER, ENEMY, { x: 20, y: 20 });
    expect(orderForTile(s, PLAYER, { x: 20, y: 20 })).toBe('defend');
  });
});
