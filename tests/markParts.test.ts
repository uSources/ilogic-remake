import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { flatMaterial, instanced, makeRoomFor, unitBox } from '../src/view3d/engine/fx/markParts';

/** Las piezas de las marcas del tablero: las mallas crecen si hacen falta mas trozos (sobre el relieve). */

describe('las mallas de las marcas', () => {
  it('si no caben todos los trozos, crece su bufer (no se cortan) y la malla sigue siendo la misma', () => {
    const mesh = instanced(unitBox(), flatMaterial(0xffffff, 1), 4);
    let released = 0;
    mesh.addEventListener('dispose', () => released++);
    makeRoomFor(mesh, 4);
    expect(mesh.instanceMatrix.count).toBe(4);
    makeRoomFor(mesh, 5);
    expect(mesh.instanceMatrix.count).toBe(8);
    makeRoomFor(mesh, 30);
    expect(mesh.instanceMatrix.count).toBe(30);
    // Cada vez suelta el bufer de antes en la tarjeta grafica.
    expect(released).toBe(2);
  });

  it('al crecer, las piezas que ya estaban puestas se quedan donde estaban', () => {
    const mesh = instanced(unitBox(), flatMaterial(0xffffff, 1), 2);
    const placed = new THREE.Matrix4().makeTranslation(3, 0.5, 7);
    mesh.setMatrixAt(1, placed);
    makeRoomFor(mesh, 3);
    const kept = new THREE.Matrix4();
    mesh.getMatrixAt(1, kept);
    expect(kept.equals(placed)).toBe(true);
  });
});
