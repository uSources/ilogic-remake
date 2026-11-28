import { describe, expect, it } from 'vitest';
import { placeCallout } from '../src/hud/common/placement';

const screen = { width: 1000, height: 600 };
const box = { width: 200, height: 100 };
const tile = (x: number, y: number) => ({ x, y, w: 40, h: 40 });

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

  it('si no cabe ni encima ni debajo, va donde hay mas sitio y el tallo llega igual hasta su borde', () => {
    // Cerca de arriba: debajo hay mas sitio; no cabe entero y se sube, y el tallo se acorta.
    const placed = placeCallout(tile(400, 120), { width: 200, height: 420 }, screen);
    expect(placed.vertical).toBe('below');
    expect(placed.top).toBe(164);
    expect(placed.stem).toEqual({ x: 420, top: 160, height: 4 });
  });

  it('cerca del borde de abajo y sin sitio de ninguna forma, encima (donde hay mas sitio)', () => {
    const placed = placeCallout(tile(400, 500), { width: 200, height: 450 }, screen);
    expect(placed.vertical).toBe('above');
    expect(placed.top).toBe(80);
  });
});

describe('placeCallout sin tapar a los enemigos a tiro', () => {
  it('si donde iba tapa uno, va al primer otro sitio donde quepa sin taparlo', () => {
    // Encima a la derecha (de 420 a 620, de 156 a 256) taparia la casilla de 500, 200.
    const placed = placeCallout(tile(400, 300), box, screen, [tile(500, 200)]);
    expect(placed).toMatchObject({ left: 220, top: 156, side: 'left', vertical: 'above' });
  });

  it('encima no queda sitio libre: debajo', () => {
    const placed = placeCallout(tile(400, 300), box, screen, [tile(500, 200), tile(300, 200)]);
    expect(placed).toMatchObject({ top: 384, side: 'right', vertical: 'below' });
  });

  it('en una pantalla estrecha (no cabe entero a ningun lado) tambien se aparta', () => {
    // Tallo en x = 150: encima, a un lado o al otro, se mueve hasta tapar la casilla de 60, 200.
    const narrow = { width: 300, height: 600 };
    const placed = placeCallout(tile(130, 300), box, narrow, [tile(60, 200)]);
    expect(placed).toMatchObject({ left: 84, top: 384, vertical: 'below' });
  });

  it('si encima tapa y debajo no cabe del todo, debajo movido lo justo para caber', () => {
    // Debajo iria de 504 a 604 y se sale por 20 px: sube a 484, aun lejos de su casilla (420 a 460).
    const placed = placeCallout(tile(400, 420), box, screen, [tile(500, 300), tile(300, 300)]);
    expect(placed).toMatchObject({ left: 420, top: 484, vertical: 'below' });
  });

  it('si tapa algo en todos los sitios, donde iba', () => {
    const everywhere = [tile(500, 200), tile(300, 200), tile(500, 400), tile(300, 400)];
    expect(placeCallout(tile(400, 300), box, screen, everywhere)).toMatchObject({ left: 420, top: 156, vertical: 'above' });
  });
});
