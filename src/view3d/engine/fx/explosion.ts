/**
 * La explosion de una unidad destruida, de juguete y a bloques: un destello, una bola de fuego de
 * cubos que crece y se apaga (amarillo, naranja, rojo y hollin), cascotes que saltan y caen al suelo y
 * una onda que se abre por el suelo. `size` es lo grande que es (1, un vehiculo; menos, un soldado).
 * Solo dibuja: recibe puntos del mundo y el reloj (FxHost).
 */
import * as THREE from 'three';
import type { FxHost } from './fx';

const EXPLOSION_SECONDS = 0.75;

/** El destello: una bola blanca que se abre de golpe y se apaga en el primer trozo de la explosion. */
const FLASH_COLOR = 0xfffbe0;
const FLASH_RADIUS = 0.7;
const FLASH_PART = 0.2;

/** La bola de fuego: cubos alrededor del centro que crecen, suben y pasan por estos colores. */
const FIRE_COLORS = [0xfff3a0, 0xffd447, 0xff8a3d, 0xe0502a, 0x3a3d45].map((color) => new THREE.Color(color));
const FIRE_CUBES = 16;
const FIRE_SPREAD = 0.35;
const FIRE_CUBE_SIZE = 0.42;
const FIRE_RISE = 0.35;
/** Lo mas que se adelanta un cubo en los colores: unos ya rojos junto a otros aun amarillos. */
const FIRE_COLOR_LEAD = 0.3;

/** Los cascotes: cubos oscuros que salen despedidos, girando, y caen hasta el suelo. */
const DEBRIS_COLORS = [0x3a3d45, 0x5c606a, 0x2b2240] as const;
const DEBRIS_PIECES = 9;
const DEBRIS_SIZE = 0.07;
const DEBRIS_SPEED = 1.6;
const DEBRIS_LIFT = 2.2;
const GRAVITY = 6;
const DEBRIS_SPIN = 9;

/** La onda del suelo: un anillo que se abre y se apaga en la primera mitad. */
const RING_COLOR = 0xffd447;
const RING_RADIUS = 1;
const RING_PART = 0.5;
const RING_LIFT = 0.03;

const cube = new THREE.BoxGeometry(1, 1, 1);
const flashBall = new THREE.IcosahedronGeometry(1, 0);
const ring = new THREE.RingGeometry(0.75, 1, 16);

const spreadOut = (amount: number): number => (Math.random() * 2 - 1) * amount;
/** Cuanto va de un trozo de la explosion (de `start` a `end`, en tanto por uno), de 0 a 1. */
const partOf = (progress: number, start: number, end: number): number => THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1);

/** Un material que brilla por si mismo y se puede desvanecer (cada pieza el suyo: cambian de color). */
const fading = (color: number | THREE.Color): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false });

/** Una parte de la explosion: su malla y como se ve a cada momento (`progress`, de 0 a 1). */
interface Part {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  draw(progress: number): void;
}

function flashPart(center: THREE.Vector3, size: number): Part {
  const mesh = new THREE.Mesh(flashBall, fading(FLASH_COLOR));
  mesh.position.copy(center);
  return {
    mesh,
    draw(progress) {
      const flash = partOf(progress, 0, FLASH_PART);
      mesh.scale.setScalar(FLASH_RADIUS * size * (0.4 + flash * 0.6));
      mesh.material.opacity = flash < 0.5 ? 1 : 2 - flash * 2;
    },
  };
}

/** El color del fuego a ese momento: del amarillo claro al hollin. */
function fireColor(progress: number, into: THREE.Color): THREE.Color {
  const along = progress * (FIRE_COLORS.length - 1);
  const index = Math.min(Math.floor(along), FIRE_COLORS.length - 2);
  return into.lerpColors(FIRE_COLORS[index]!, FIRE_COLORS[index + 1]!, along - index);
}

function fireCube(center: THREE.Vector3, size: number): Part {
  const mesh = new THREE.Mesh(cube, fading(FIRE_COLORS[0]!));
  const offset = new THREE.Vector3(spreadOut(FIRE_SPREAD), spreadOut(FIRE_SPREAD) * 0.6, spreadOut(FIRE_SPREAD)).multiplyScalar(size);
  const grows = FIRE_CUBE_SIZE * size * (0.6 + Math.random() * 0.6);
  // Unos empiezan un poco mas tarde: la bola no sale toda de golpe.
  const delay = Math.random() * 0.1;
  const colorLead = Math.random() * FIRE_COLOR_LEAD;
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  return {
    mesh,
    draw(progress) {
      const burn = partOf(progress, delay, 1);
      const swell = Math.sin(Math.min(burn * 3, 1) * Math.PI * 0.5);
      mesh.position.copy(center).addScaledVector(offset, 0.4 + swell);
      mesh.position.y += burn * FIRE_RISE * size;
      mesh.scale.setScalar(Math.max(grows * swell * (1 - burn * 0.5), 0.0001));
      fireColor(Math.min(burn + colorLead, 1), mesh.material.color);
      mesh.material.opacity = burn < 0.7 ? 1 : 1 - (burn - 0.7) / 0.3;
    },
  };
}

function debrisPiece(center: THREE.Vector3, groundY: number, size: number, index: number): Part {
  const mesh = new THREE.Mesh(cube, fading(DEBRIS_COLORS[index % DEBRIS_COLORS.length]!));
  const angle = (index / DEBRIS_PIECES) * Math.PI * 2 + Math.random() * 0.5;
  const speed = DEBRIS_SPEED * size * (0.6 + Math.random() * 0.6);
  const velocity = new THREE.Vector3(Math.cos(angle) * speed, DEBRIS_LIFT * (0.7 + Math.random() * 0.6), Math.sin(angle) * speed);
  mesh.scale.setScalar(DEBRIS_SIZE * (0.7 + Math.random() * 0.8) * Math.max(size, 0.7));
  return {
    mesh,
    draw(progress) {
      const time = progress * EXPLOSION_SECONDS;
      mesh.position.copy(center).addScaledVector(velocity, time);
      mesh.position.y = Math.max(groundY, mesh.position.y - (GRAVITY / 2) * time * time);
      mesh.rotation.set(time * DEBRIS_SPIN, time * DEBRIS_SPIN * 0.7, 0);
      mesh.material.opacity = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;
    },
  };
}

function groundRing(ground: THREE.Vector3, size: number): Part {
  const mesh = new THREE.Mesh(ring, fading(RING_COLOR));
  mesh.material.side = THREE.DoubleSide;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(ground).add(new THREE.Vector3(0, RING_LIFT, 0));
  return {
    mesh,
    draw(progress) {
      const wave = partOf(progress, 0, RING_PART);
      mesh.scale.setScalar(Math.max(RING_RADIUS * size * wave, 0.0001));
      mesh.material.opacity = 0.9 * (1 - wave);
    },
  };
}

/** Estalla en `center` (el cuerpo de la pieza) con los cascotes cayendo hasta `ground` (el suelo bajo ella). */
export async function explosion(host: FxHost, center: THREE.Vector3, ground: THREE.Vector3, size = 1): Promise<void> {
  const parts = [
    groundRing(ground, size),
    ...Array.from({ length: FIRE_CUBES }, () => fireCube(center, size)),
    ...Array.from({ length: DEBRIS_PIECES }, (_, index) => debrisPiece(center, ground.y, size, index)),
    flashPart(center, size),
  ];
  for (const part of parts) {
    part.draw(0);
    host.layer.add(part.mesh);
  }
  await host.animate(EXPLOSION_SECONDS, (progress) => parts.forEach((part) => part.draw(progress)));
  for (const { mesh } of parts) {
    host.layer.remove(mesh);
    mesh.material.dispose();
  }
}
