import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { moveRange } from '@core/rules';
import { clickIntent } from '../src/view3d/systems/turn/clickIntent';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** Que hace un clic con una unidad elegida, segun lo que hay en la casilla (sin turno ni navegador). */

const SOLDIER = unitTypeNamed('Soldier');

function chosenSoldier() {
  const s = blankState({ fog: false });
  const unit = newUnit(s, SOLDIER, PLAYER, { x: 5, y: 5 });
  return { s, unit, chosen: { unit, range: moveRange(s, unit) } };
}

describe('el clic que acierta', () => {
  it('en la propia unidad, soltarla', () => {
    const { s, unit, chosen } = chosenSoldier();
    expect(clickIntent(s, PLAYER, chosen, unit, null)).toEqual({ kind: 'deselect' });
  });

  it('si hay un ataque posible, atacar va antes que nada', () => {
    const { s, unit, chosen } = chosenSoldier();
    const plan = { attacker: unit, from: { x: 5, y: 5 }, target: unit };
    expect(clickIntent(s, PLAYER, chosen, { x: 6, y: 5 }, plan)).toEqual({ kind: 'attack', plan });
  });

  it('una casilla a su alcance: ir; si es un edificio ajeno, capturar al llegar', () => {
    const { s, chosen } = chosenSoldier();
    s.buildings.push({ type: 'City', owner: null, x: 7, y: 5, capture: null });
    expect(clickIntent(s, PLAYER, chosen, { x: 6, y: 5 }, null)).toEqual({ kind: 'move', to: { x: 6, y: 5 }, thenCapture: false });
    expect(clickIntent(s, PLAYER, chosen, { x: 7, y: 5 }, null)).toEqual({ kind: 'move', to: { x: 7, y: 5 }, thenCapture: true });
  });

  it('un edificio propio no se captura: solo ir', () => {
    const { s, chosen } = chosenSoldier();
    s.buildings.push({ type: 'City', owner: PLAYER, x: 7, y: 5, capture: null });
    expect(clickIntent(s, PLAYER, chosen, { x: 7, y: 5 }, null)).toMatchObject({ kind: 'move', thenCapture: false });
  });

  it('un transporte suyo al que llega: subir', () => {
    const { s, chosen } = chosenSoldier();
    const transport = newUnit(s, unitTypeNamed('Transport'), PLAYER, { x: 7, y: 5 });
    expect(clickIntent(s, PLAYER, chosen, transport, null)).toEqual({ kind: 'load', into: transport });
  });

  it('una casilla libre fuera de su alcance: ir alli, el viaje de varios turnos', () => {
    const { s, chosen } = chosenSoldier();
    expect(clickIntent(s, PLAYER, chosen, { x: 25, y: 25 }, null)).toEqual({ kind: 'travel', to: { x: 25, y: 25 } });
  });

  it('lejos, una unidad que se ve o una fabrica propia no son un viaje: se tocan como sin nada elegido', () => {
    const { s, chosen } = chosenSoldier();
    newUnit(s, SOLDIER, PLAYER, { x: 20, y: 20 });
    newUnit(s, SOLDIER, ENEMY, { x: 22, y: 20 });
    s.buildings.push({ type: 'Factory', owner: PLAYER, x: 25, y: 25, capture: null });
    expect(clickIntent(s, PLAYER, chosen, { x: 20, y: 20 }, null)).toEqual({ kind: 'elsewhere' });
    expect(clickIntent(s, PLAYER, chosen, { x: 22, y: 20 }, null)).toEqual({ kind: 'elsewhere' });
    expect(clickIntent(s, PLAYER, chosen, { x: 25, y: 25 }, null)).toEqual({ kind: 'elsewhere' });
  });

  it('si ya no se mueve, nada que hacer fuera de la unidad', () => {
    const { s, unit } = chosenSoldier();
    expect(clickIntent(s, PLAYER, { unit, range: null }, { x: 6, y: 5 }, null)).toEqual({ kind: 'elsewhere' });
    expect(clickIntent(s, PLAYER, { unit, range: null }, { x: 25, y: 25 }, null)).toEqual({ kind: 'elsewhere' });
  });
});
