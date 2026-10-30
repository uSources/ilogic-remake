import { describe, expect, it } from 'vitest';
import { mapTap, moveTap, type MapTap } from '../src/ui/touch';

const map = (o: Partial<MapTap>): MapTap => ({ ownActive: false, buyHere: false, visibleUnit: false, inspectingThis: false, ...o });

describe('toque con el dedo en el mapa', () => {
  it('una unidad propia se elige al primer toque', () => {
    expect(mapTap(map({ ownActive: true, visibleUnit: true }))).toBe('select');
    // Aunque se este viendo su alcance.
    expect(mapTap(map({ ownActive: true, visibleUnit: true, inspectingThis: true }))).toBe('select');
  });

  it('una fabrica libre abre la compra al primer toque', () => {
    expect(mapTap(map({ buyHere: true }))).toBe('buy');
  });

  it('otra unidad que se ve enseña su alcance, y otro toque lo cierra', () => {
    expect(mapTap(map({ visibleUnit: true }))).toBe('inspect');
    expect(mapTap(map({ visibleUnit: true, inspectingThis: true }))).toBe('closeInspect');
  });

  it('una casilla vacia solo se señala (nunca abre el menu de partida)', () => {
    expect(mapTap(map({}))).toBe('point');
  });
});

describe('toque con una unidad elegida', () => {
  it('mover, unir, subir o quedarse: al primer toque', () => {
    for (const intent of ['move', 'merge', 'load', 'stay'] as const) {
      expect(moveTap({ intent, atCursor: false, otherOwnActive: false })).toBe('commit');
    }
  });

  it('atacar pide dos toques: prevision y ataque', () => {
    expect(moveTap({ intent: 'attack', atCursor: false, otherOwnActive: false })).toBe('preview');
    expect(moveTap({ intent: 'attack', atCursor: true, otherOwnActive: false })).toBe('commit');
  });

  it('fuera del alcance: otra unidad propia pasa a ser la elegida; si no, se deja de elegir', () => {
    expect(moveTap({ intent: 'none', atCursor: false, otherOwnActive: true })).toBe('reselect');
    expect(moveTap({ intent: 'none', atCursor: true, otherOwnActive: false })).toBe('deselect');
  });

  it('mover una unidad con el dedo: dos toques (antes cuatro)', () => {
    const taps = [mapTap(map({ ownActive: true })), moveTap({ intent: 'move', atCursor: false, otherOwnActive: false })];
    expect(taps).toEqual(['select', 'commit']);
  });
});
