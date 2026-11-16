import { describe, expect, it } from 'vitest';
import { StrategyCamera } from '../src/view3d/systems/camera/strategyCamera';

/** La camara de estrategia como logica, sin navegador: a donde va, sus limites y lo suave que llega. */

const BOUNDS = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
const FOV = 45;
/** Tiempo de sobra para que la camara llegue a donde se le pide. */
const SETTLE_SECONDS = 5;

function cameraAt(x: number, z: number, yaw = 0): StrategyCamera {
  return new StrategyCamera({ target: { x, y: 0, z }, distance: 16, yaw }, BOUNDS, FOV);
}

function settled(camera: StrategyCamera): StrategyCamera {
  camera.update(SETTLE_SECONDS);
  return camera;
}

describe('la camara de estrategia', () => {
  it('desplazar va hacia el fondo de la pantalla segun hacia donde mira', () => {
    const lookingNorth = settled(withPan(cameraAt(10, 10, 0), 0, 2));
    expect(lookingNorth.pose.target.z).toBeCloseTo(8);
    const turned = settled(withPan(cameraAt(10, 10, Math.PI / 2), 0, 2));
    expect(turned.pose.target.x).toBeCloseTo(8);
    expect(turned.pose.target.z).toBeCloseTo(10);
  });

  it('a la derecha de la pantalla, girada un cuarto respecto al fondo', () => {
    const camera = settled(withPan(cameraAt(10, 10, 0), 3, 0));
    expect(camera.pose.target.x).toBeCloseTo(13);
    expect(camera.pose.target.z).toBeCloseTo(10);
  });

  it('el punto mirado no sale del mapa', () => {
    const camera = settled(withPan(cameraAt(1, 1), -50, -50));
    expect(camera.pose.target).toMatchObject({ x: 0, z: 20 });
  });

  it('acercar y girar tienen sus limites', () => {
    const camera = cameraAt(10, 10);
    for (let turn = 0; turn < 50; turn++) {
      camera.zoom(-1000);
      camera.orbit(0, 1);
    }
    settled(camera);
    expect(camera.pose.distance).toBe(6);
    expect(camera.pose.pitch).toBeCloseTo((82 * Math.PI) / 180);
  });

  it('llega poco a poco: a mitad de camino tras unos fotogramas, y al final se queda', () => {
    const camera = cameraAt(0, 0);
    camera.lookAt({ x: 10, y: 0, z: 0 });
    camera.update(1 / 60);
    expect(camera.pose.target.x).toBeGreaterThan(0);
    expect(camera.pose.target.x).toBeLessThan(10);
    settled(camera);
    expect(camera.pose.target.x).toBeCloseTo(10);
  });

  it('el teclado desplaza mas rapido de lejos', () => {
    const near = cameraAt(10, 10);
    near.zoom(-1000);
    const far = cameraAt(10, 10);
    far.zoom(1000);
    near.panByKeys(1, 0, 0.1);
    far.panByKeys(1, 0, 0.1);
    expect(settled(far).pose.target.x - 10).toBeGreaterThan(settled(near).pose.target.x - 10);
  });

  it('casillas por pixel: el suelo que se ve repartido entre la altura de la pantalla', () => {
    const camera = cameraAt(10, 10);
    const visible = 2 * 16 * Math.tan((FOV / 2) * (Math.PI / 180));
    expect(camera.tilesPerPixel(800)).toBeCloseTo(visible / 800);
  });
});

function withPan(camera: StrategyCamera, right: number, forward: number): StrategyCamera {
  camera.pan(right, forward);
  return camera;
}
