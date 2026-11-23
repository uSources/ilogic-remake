import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Pos } from '@core/model';
import type { MarkGround } from '../src/view3d/engine/fx/groundFit';
import { ControlZonesView } from '../src/view3d/engine/pieces/controlZones';
import type { ControlZoneLook } from '../src/view3d/systems/board/boardScene';

/** [CAMBIO] Las zonas de los puntos de control en el tablero: solo se rehace la que cambia. */

const FLAT: MarkGround = { groundOf: (pos: Pos) => new THREE.Vector3(pos.x, 0, pos.y), surfaceAt: () => 0 };

/** La zona de radio `radius` alrededor de (5, 5). */
function zone(radius: number, change: Partial<ControlZoneLook> = {}): ControlZoneLook {
  const span = Array.from({ length: radius * 2 + 1 }, (_, index) => 5 - radius + index);
  const tiles = span.flatMap((x) => span.map((y) => ({ x, y })));
  return { key: '5,5', center: { x: 5, y: 5 }, tiles, side: 'own', isContested: false, ...change };
}

describe('las zonas de los puntos de control', () => {
  it('la misma zona se queda como esta; si cambia de dueño o de casillas, se rehace', () => {
    const view = new ControlZonesView(FLAT);
    view.sync([zone(1)]);
    const first = view.object.children[0];
    view.sync([zone(1, { isContested: true })]);
    expect(view.object.children).toEqual([first]);
    view.sync([zone(1, { side: 'enemy' })]);
    const second = view.object.children[0];
    expect(second).not.toBe(first);
    view.sync([zone(2, { side: 'enemy' })]);
    expect(view.object.children).toHaveLength(1);
    expect(view.object.children[0]).not.toBe(second);
    view.sync([]);
    expect(view.object.children).toEqual([]);
  });
});
