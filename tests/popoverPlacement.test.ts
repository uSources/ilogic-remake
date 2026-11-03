import { describe, expect, it } from 'vitest';
import { placeBeside } from '../src/hud/common/placement';

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
