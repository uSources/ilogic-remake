/**
 * El clima de la partida en 3D, con sus estilos (STYLES de weatherStyles.ts: lluvia,
 * nieve, tormenta y tormenta de arena; cuantas particulas, caida, viento, color, velo y relampagos):
 * las particulas caen en el mundo, en una caja alrededor de lo que mira la camara, y el velo tiñe la
 * pantalla. Con «reducir el movimiento» solo queda el velo (como en 2D).
 */
import * as THREE from 'three';
import { reducedMotion } from '../../../ui/motion';
import { STYLES, type Style } from '../../systems/weather/weatherStyles';
import { PixelPoints } from './pixelPoints';
import { WIND_DIRECTION as WIND } from '../core/space';

/** Cuantas casillas mide «una vista» de los estilos 2D (sus velocidades van en vistas por segundo). */
const VIEW_TILES = 14;
/** En 3D se llena un volumen, no una pantalla: hacen falta mas particulas que en 2D. */
const COUNT_SCALE = 3;
/** Largo de las rayas: casillas por cada pixel de largo del estilo 2D. */
const STREAK_TILES_PER_PIXEL = 0.03;
/** Altura desde la que caen (casillas). */
const SKY_HEIGHT = 7;
const FLAKE_SIZE = 0.11;
/** Tamaño de las nubes de polvo de la tormenta de arena: casillas por cada pixel del estilo 2D. */
const DUST_TILES_PER_PIXEL = 0.012;
const FLASH_FADE = 4;

interface Drop {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Largo de su raya (casillas). */
  length: number;
}

export class WeatherView {
  readonly object = new THREE.Group();
  private style: Style | null = null;
  private kind: string | null = null;
  private drops: Drop[] = [];
  private dust: Drop[] = [];
  private readonly streaks: THREE.LineSegments;
  private readonly flakes: PixelPoints;
  private readonly clouds: PixelPoints;
  private readonly veil: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private flashLevel = 0;

  constructor(overlayParent: HTMLElement, maxDrops = 1200) {
    this.streaks = streakLines(maxDrops);
    this.flakes = new PixelPoints(maxDrops);
    this.clouds = new PixelPoints(64);
    this.object.add(this.streaks, this.flakes.object, this.clouds.object);
    this.veil = overlay(overlayParent);
    this.flash = overlay(overlayParent);
    this.flash.style.background = '#e8f2ff';
  }

  /** El clima de hoy (id de weather.json; null o uno sin estilo: despejado). */
  set(kind: string | null): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.style = (kind && STYLES[kind]) || null;
    this.veil.style.background = this.style ? `#${this.style.veil.toString(16).padStart(6, '0')}` : 'transparent';
    this.veil.style.opacity = String(this.style?.veilAlpha ?? 0);
    this.drops = [];
    this.dust = [];
  }

  /** Avanza el clima alrededor de `center` (lo que mira la camara), en una caja de radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    const style = this.style;
    this.updateFlash(seconds, style);
    const moving = style && !reducedMotion();
    this.object.visible = !!moving;
    if (!moving) return;
    this.flakes.setScale(viewportHeight, camera);
    this.clouds.setScale(viewportHeight, camera);
    this.fill(style, center, radius);
    for (const drop of [...this.drops, ...this.dust]) stepDrop(drop, seconds, center, radius, style);
    this.draw(style);
  }

  private fill(style: Style, center: THREE.Vector3, radius: number): void {
    const wanted = Math.min(style.count * COUNT_SCALE, this.flakes.count);
    while (this.drops.length < wanted) this.drops.push(newDrop(style, center, radius, Math.random() * SKY_HEIGHT));
    const clouds = Math.min((style.dust?.count ?? 0) * 2, this.clouds.count);
    while (this.dust.length < clouds) this.dust.push(newDrop(style, center, radius, 0.3 + Math.random() * 1.5));
  }

  private draw(style: Style): void {
    const isStreak = style.shape === 'streak';
    this.streaks.visible = isStreak;
    this.flakes.object.visible = !isStreak;
    if (isStreak) drawStreaks(this.streaks, this.drops, style);
    else drawFlakes(this.flakes, this.drops, style);
    drawClouds(this.clouds, this.dust, style);
  }

  /** Los relampagos de la tormenta: un destello blanco que se apaga. */
  private updateFlash(seconds: number, style: Style | null): void {
    if (style?.lightning && !reducedMotion() && Math.random() < style.lightning * seconds) this.flashLevel = 0.55;
    this.flashLevel = Math.max(0, this.flashLevel - seconds * FLASH_FADE);
    this.flash.style.opacity = String(this.flashLevel);
  }
}

/** Una capa que tiñe la pantalla entera (sin tapar los clics). */
function overlay(parent: HTMLElement): HTMLDivElement {
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0' });
  parent.append(layer);
  return layer;
}

function streakLines(maxDrops: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxDrops * 6), 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  lines.frustumCulled = false;
  return lines;
}

/** Una gota (o copo, o grano) nueva en un sitio al azar de la caja, a esa altura. */
function newDrop(style: Style, center: THREE.Vector3, radius: number, height: number): Drop {
  const variation = 0.7 + Math.random() * 0.6;
  const position = new THREE.Vector3(center.x + (Math.random() * 2 - 1) * radius, height, center.z + (Math.random() * 2 - 1) * radius);
  const velocity = WIND.clone()
    .multiplyScalar(style.wind * VIEW_TILES * variation)
    .add(new THREE.Vector3(0, -style.fall * VIEW_TILES * variation, 0));
  return { position, velocity, length: style.len * STREAK_TILES_PER_PIXEL * variation };
}

/** Un sitio al azar en el lado de la caja del que sopla el viento, a esa altura. */
function upwindSpot(center: THREE.Vector3, radius: number, height: number): THREE.Vector3 {
  const across = new THREE.Vector3(-WIND.z, 0, WIND.x).multiplyScalar((Math.random() * 2 - 1) * radius);
  return center.clone().addScaledVector(WIND, -radius).add(across).setY(height);
}

/**
 * Avanza una gota y la recicla: si llega al suelo vuelve arriba en otro sitio; si el viento la saca de
 * la caja, vuelve por el lado del que sopla (si no, con viento fuerte todo acabaria a un lado).
 */
function stepDrop(drop: Drop, seconds: number, center: THREE.Vector3, radius: number, style: Style): void {
  drop.position.addScaledVector(drop.velocity, seconds);
  if (drop.position.y < 0) return void Object.assign(drop, newDrop(style, center, radius, SKY_HEIGHT));
  const isOutside = Math.abs(drop.position.x - center.x) > radius || Math.abs(drop.position.z - center.z) > radius;
  if (isOutside) drop.position.copy(upwindSpot(center, radius, drop.position.y));
}

function drawStreaks(lines: THREE.LineSegments, drops: readonly Drop[], style: Style): void {
  const positions = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  drops.forEach((drop, index) => {
    const tail = drop.position.clone().addScaledVector(drop.velocity.clone().normalize(), -drop.length);
    positions.setXYZ(index * 2, drop.position.x, drop.position.y, drop.position.z);
    positions.setXYZ(index * 2 + 1, tail.x, tail.y, tail.z);
  });
  positions.needsUpdate = true;
  lines.geometry.setDrawRange(0, drops.length * 2);
  const material = lines.material as THREE.LineBasicMaterial;
  material.color.set(style.color);
  material.opacity = style.alpha;
}

function drawFlakes(flakes: PixelPoints, drops: readonly Drop[], style: Style): void {
  flakes.setLook(style.color, style.alpha);
  for (let index = 0; index < flakes.count; index++) {
    const drop = drops[index];
    flakes.alphas[index] = drop ? 1 : 0;
    flakes.sizes[index] = FLAKE_SIZE;
    if (drop) flakes.positions.set([drop.position.x, drop.position.y, drop.position.z], index * 3);
  }
  flakes.commit();
}

/** Las nubes de polvo de la tormenta de arena: manchas grandes y flojas que cruzan bajas. */
function drawClouds(clouds: PixelPoints, dust: readonly Drop[], style: Style): void {
  const look = style.dust;
  if (!look) return void (clouds.object.visible = false);
  clouds.object.visible = true;
  clouds.setLook(look.color, look.alpha);
  for (let index = 0; index < clouds.count; index++) {
    const cloud = dust[index];
    clouds.alphas[index] = cloud ? 1 : 0;
    clouds.sizes[index] = look.size * DUST_TILES_PER_PIXEL;
    if (cloud) clouds.positions.set([cloud.position.x, Math.max(cloud.position.y, 0.4), cloud.position.z], index * 3);
  }
  clouds.commit();
}
