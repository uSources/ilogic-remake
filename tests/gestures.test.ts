import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD } from '../src/controls/gestures/basics';
import { EDGE_CARRY_MOUSE, EDGE_CARRY_TOUCH, EDGE_HOVER, edgeZoneFor } from '../src/controls/gestures/edgeScroll';
import { boxFromPress, classifyPressMove, newPress } from '../src/controls/gestures/press';
import { DOUBLE_MS, nextTap } from '../src/controls/gestures/tap';

const noMods = { shift: false, ctrl: false, alt: false };
const far = DRAG_THRESHOLD + 1;

describe('piezas de los gestos', () => {
  it('pulsacion: quieta, recuadro solo al primer movimiento con el izquierdo, despues desplazar', () => {
    const press = newPress({ x: 10, y: 10 }, 'left', noMods);
    expect(classifyPressMove(press, { x: 12, y: 10 }, 1, () => true)).toBe('still');
    expect(classifyPressMove(press, { x: 10 + far, y: 10 }, 1, () => true)).toBe('box');
    expect(classifyPressMove(press, { x: 10 + far, y: 10 }, 1, () => false)).toBe('pan');
    expect(classifyPressMove({ ...press, moved: true }, { x: 11, y: 10 }, 1, () => true)).toBe('pan');
    expect(classifyPressMove(newPress({ x: 0, y: 0 }, 'right', noMods), { x: far, y: 0 }, 1, () => true)).toBe('pan');
  });

  it('el recuadro va desde donde empezo y añade con Mayusculas o Ctrl', () => {
    const press = newPress({ x: 1, y: 2 }, 'left', { ...noMods, ctrl: true });
    press.last = { x: 50, y: 50 };
    expect(boxFromPress(press, { x: 30, y: 40 })).toEqual({ x0: 1, y0: 2, x1: 30, y1: 40, add: true });
  });

  it('doble toque: en el mismo sitio y a tiempo', () => {
    const first = nextTap(null, { x: 0, y: 0 }, 1000, 1);
    expect(first.count).toBe(1);
    expect(nextTap(first, { x: 2, y: 0 }, 1000 + DOUBLE_MS, 1).count).toBe(2);
    expect(nextTap(first, { x: 2, y: 0 }, 1001 + DOUBLE_MS, 1).count).toBe(1);
    expect(nextTap(first, { x: far, y: 0 }, 1001, 1).count).toBe(1);
  });

  it('franja del borde segun lo que se hace', () => {
    expect(edgeZoneFor({ isCarrying: true, carryIsTouch: true, isHoveringMap: false })).toBe(EDGE_CARRY_TOUCH);
    expect(edgeZoneFor({ isCarrying: true, carryIsTouch: false, isHoveringMap: true })).toBe(EDGE_CARRY_MOUSE);
    expect(edgeZoneFor({ isCarrying: false, carryIsTouch: false, isHoveringMap: true })).toBe(EDGE_HOVER);
    expect(edgeZoneFor({ isCarrying: false, carryIsTouch: false, isHoveringMap: false })).toBeNull();
  });
});
