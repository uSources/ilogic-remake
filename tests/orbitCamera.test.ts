import { describe, expect, it } from 'vitest';
import { orbitPose, type OrbitPath } from '../src/view3d/systems/camera/orbitCamera';

/** La camara que da vueltas detras del menu, como logica: ciclica y con el tablero a la derecha. */

const PATH: OrbitPath = {
  center: { x: 10, y: 0, z: 10 },
  distance: 20,
  pitch: 0.6,
  lapSeconds: 120,
  startYaw: 0.5,
  spot: { right: 0, down: 0 },
};
const SCREEN = { verticalFov: 32, aspect: 16 / 9 };

describe('la camara del fondo del menu', () => {
  it('da una vuelta entera cada lapSeconds y vuelve a estar igual', () => {
    const start = orbitPose(PATH, 0, SCREEN);
    const halfLap = orbitPose(PATH, PATH.lapSeconds / 2, SCREEN);
    expect(halfLap.yaw - start.yaw).toBeCloseTo(Math.PI);
    expect(orbitPose(PATH, PATH.lapSeconds * 3 + 7, SCREEN)).toEqual(orbitPose(PATH, 7, SCREEN));
  });

  it('sin correrse, mira al centro del tablero desde su distancia e inclinacion', () => {
    const pose = orbitPose(PATH, 30, SCREEN);
    expect(pose.target).toEqual(PATH.center);
    expect(pose).toMatchObject({ distance: PATH.distance, pitch: PATH.pitch });
  });

  it('corrida a la derecha, mira a la izquierda del punto, a la misma distancia en toda la vuelta', () => {
    const path = { ...PATH, spot: { right: 0.3, down: 0 }, startYaw: 0 };
    // Con giro 0 la camara mira hacia -z y la derecha de la pantalla es +x.
    const facingNorth = orbitPose(path, 0, SCREEN);
    expect(facingNorth.target.x).toBeLessThan(path.center.x);
    expect(facingNorth.target.z).toBeCloseTo(path.center.z);
    const shiftOf = (seconds: number) => {
      const { target } = orbitPose(path, seconds, SCREEN);
      return Math.hypot(target.x - path.center.x, target.z - path.center.z);
    };
    expect(shiftOf(40)).toBeCloseTo(shiftOf(0));
    expect(shiftOf(0)).toBeGreaterThan(0);
  });

  it('corrida hacia abajo, mira mas al fondo que el punto', () => {
    const path = { ...PATH, spot: { right: 0, down: 0.4 }, startYaw: 0 };
    const facingNorth = orbitPose(path, 0, SCREEN);
    expect(facingNorth.target.z).toBeLessThan(path.center.z);
    expect(facingNorth.target.x).toBeCloseTo(path.center.x);
  });
});
