import { describe, expect, it } from 'vitest';
import { terrainPose } from '../src/ui/map/terrainPose';

const grass = { id: 'Grass', isWater: false };
const shallowWater = { id: 'SWater', isWater: true };
const cliff = { id: 'GrassCliff', isWater: false };

describe('como se planta una unidad segun el terreno', () => {
  it('en el llano, tal cual', () => {
    expect(terrainPose(grass, 'march')).toEqual({ lift: 0, wade: 0, showsFront: true });
  });

  it('en el agua se hunde un poco', () => {
    expect(terrainPose(shallowWater, 'march').wade).toBeGreaterThan(0);
    expect(terrainPose(shallowWater, 'drive').lift).toBe(0);
  });

  it('en lo alto de un acantilado sube', () => {
    expect(terrainPose(cliff, 'march').lift).toBeGreaterThan(0);
    expect(terrainPose(cliff, 'march').wade).toBe(0);
  });

  it('lo que vuela no se hunde, no sube y el terreno no le tapa los pies', () => {
    for (const terrain of [grass, shallowWater, cliff])
      expect(terrainPose(terrain, 'fly')).toEqual({ lift: 0, wade: 0, showsFront: false });
  });
});
