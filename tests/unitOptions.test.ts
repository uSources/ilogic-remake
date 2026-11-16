import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { chipOptions, groupRadialOptions, orderForTile, radialOptions } from '../src/view3d/systems/turn/unitOptions';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** Lo que enseña la interfaz limpia junto a lo elegido: fichas (lo que no es tocar el tablero) y rueda (lo raro). */

const SOLDIER = unitTypeNamed('Soldier');
const SUPPLIER = unitTypeNamed('Supplier');
const TANK = unitTypeNamed('Tank');

describe('fichas de una unidad', () => {
  it('en campo abierto, ninguna: esperar, ordenes y disolver van a la rueda', () => {
    const s = blankState();
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    expect(chipOptions(s, PLAYER, soldier)).toEqual([]);
  });

  it('encima de un edificio ajeno, capturar', () => {
    const s = blankState();
    s.buildings.push({ type: 'City', owner: null, x: 5, y: 5, capture: null });
    const soldier = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
    expect(chipOptions(s, PLAYER, soldier)).toEqual(['capture']);
  });

  it('suministros junto a un aliado herido: reparar', () => {
    const s = blankState();
    const supplier = newUnit(s, SUPPLIER, PLAYER, { x: 5, y: 5 });
    newUnit(s, TANK, PLAYER, { x: 6, y: 5 }).life = 40;
    expect(chipOptions(s, PLAYER, supplier)).toContain('supply');
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
