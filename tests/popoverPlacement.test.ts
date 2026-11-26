import { describe, expect, it } from 'vitest';
import { placeBeside, placeCallout } from '../src/hud/common/placement';

const screen = { width: 1000, height: 600 };
const box = { width: 200, height: 100 };
const tile = (x: number, y: number) => ({ x, y, w: 40, h: 40 });

describe('placeBeside', () => {
  it('va al lado que se prefiere si cabe, centrado en altura', () => {
    expect(placeBeside(tile(400, 300), box, screen, 'right')).toEqual({ left: 450, top: 270 });
    expect(placeBeside(tile(400, 300), box, screen, 'left')).toEqual({ left: 190, top: 270 });
  });

  it('si no cabe en el que prefiere, al otro', () => {
    expect(placeBeside(tile(900, 300), box, screen, 'right')).toEqual({ left: 690, top: 270 });
    expect(placeBeside(tile(20, 300), box, screen, 'left')).toEqual({ left: 70, top: 270 });
  });

  it('si no cabe a ningun lado, debajo (o encima si abajo no hay sitio)', () => {
    const narrow = { width: 300, height: 600 };
    expect(placeBeside(tile(130, 200), box, narrow, 'right')).toEqual({ left: 50, top: 250 });
    expect(placeBeside(tile(130, 500), box, narrow, 'right')).toEqual({ left: 50, top: 390 });
  });

  it('no tapa la barra de arriba', () => {
    expect(placeBeside(tile(400, 0), box, screen, 'right').top).toBe(80);
  });
});

describe('placeCallout (el bocadillo con tallo)', () => {
  it('encima de la casilla y a la derecha del tallo, que sube de lo alto de la casilla hasta el bocadillo', () => {
    // Casilla de 400 a 440: el tallo en x = 420; sube 44 px desde y = 300 y el bocadillo acaba ahi.
    const placed = placeCallout(tile(400, 300), box, screen);
    expect(placed).toMatchObject({ left: 420, top: 156, side: 'right', vertical: 'above' });
    expect(placed.stem).toEqual({ x: 420, top: 256, height: 44 });
  });

  it('sin sitio a la derecha, a la izquierda del tallo', () => {
    const placed = placeCallout(tile(900, 300), box, screen);
    expect(placed).toMatchObject({ left: 720, side: 'left', vertical: 'above' });
  });

  it('sin sitio arriba (no tapa la barra de arriba), debajo de la casilla y el tallo baja', () => {
    const placed = placeCallout(tile(400, 150), box, screen);
    expect(placed).toMatchObject({ top: 234, vertical: 'below' });
    expect(placed.stem).toEqual({ x: 420, top: 190, height: 44 });
  });

  it('si el bocadillo se mueve para caber, el tallo llega igual hasta su borde', () => {
    // Pegado al borde de abajo: debajo no cabe entero y se sube; el tallo se acorta.
    const placed = placeCallout(tile(400, 120), { width: 200, height: 420 }, screen);
    expect(placed.vertical).toBe('below');
    expect(placed.top).toBe(164);
    expect(placed.stem).toEqual({ x: 420, top: 160, height: 4 });
  });
});
