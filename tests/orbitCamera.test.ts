import { describe, expect, it } from 'vitest';
import { OrbitCamera, type OrbitPath, type ScreenSpot } from '../src/view3d/systems/camera/orbitCamera';

/** La camara que da vueltas detras del menu, como logica: ciclica y con el tablero a la derecha. */

const PATH: OrbitPath = {
  center: { x: 10, y: 0, z: 10 },
  distance: 20,
  pitch: 0.6,
  lapSeconds: 120,
  startYaw: 0.5,
};
const SCREEN = { verticalFov: 32, aspect: 16 / 9 };
const CENTERED: ScreenSpot = { right: 0, down: 0 };

/** Una copia de la pose tras `seconds` (la de la camara es siempre el mismo objeto, que se mueve). */
function poseAt(camera: OrbitCamera, seconds: number, spot: ScreenSpot = CENTERED) {
  camera.moveTo(seconds, SCREEN, spot);
  return { ...camera.pose, target: { ...camera.pose.target } };
}

describe('la camara del fondo del menu', () => {
  it('da una vuelta entera cada lapSeconds y vuelve a estar igual', () => {
    const camera = new OrbitCamera(PATH);
    const start = poseAt(camera, 0);
    expect(poseAt(camera, PATH.lapSeconds / 2).yaw - start.yaw).toBeCloseTo(Math.PI);
    expect(poseAt(camera, PATH.lapSeconds * 3 + 7)).toEqual(poseAt(camera, 7));
  });

  it('sin correrse, mira al centro del tablero desde su distancia e inclinacion', () => {
    const pose = poseAt(new OrbitCamera(PATH), 30);
    expect(pose.target).toEqual(PATH.center);
    expect(pose).toMatchObject({ distance: PATH.distance, pitch: PATH.pitch });
  });

  it('se mueve sin crear nada: da siempre la misma pose', () => {
    const camera = new OrbitCamera(PATH);
    const pose = camera.pose;
    camera.moveTo(10, SCREEN, CENTERED);
    expect(camera.pose).toBe(pose);
    expect(camera.pose.target).toBe(pose.target);
  });

  it('corrida a la derecha, mira a la izquierda del punto, a la misma distancia en toda la vuelta', () => {
    const camera = new OrbitCamera({ ...PATH, startYaw: 0 });
    const right: ScreenSpot = { right: 0.3, down: 0 };
    // Con giro 0 la camara mira hacia -z y la derecha de la pantalla es +x.
    const facingNorth = poseAt(camera, 0, right);
    expect(facingNorth.target.x).toBeLessThan(PATH.center.x);
    expect(facingNorth.target.z).toBeCloseTo(PATH.center.z);
    const shiftOf = (seconds: number) => {
      const { target } = poseAt(camera, seconds, right);
      return Math.hypot(target.x - PATH.center.x, target.z - PATH.center.z);
    };
    expect(shiftOf(40)).toBeCloseTo(shiftOf(0));
    expect(shiftOf(0)).toBeGreaterThan(0);
  });

  it('corrida hacia abajo, mira mas al fondo que el punto', () => {
    const facingNorth = poseAt(new OrbitCamera({ ...PATH, startYaw: 0 }), 0, { right: 0, down: 0.4 });
    expect(facingNorth.target.z).toBeLessThan(PATH.center.z);
    expect(facingNorth.target.x).toBeCloseTo(PATH.center.x);
  });
});
