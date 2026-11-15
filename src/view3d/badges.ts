/**
 * Las marcas que flotan sobre las piezas y miran siempre a la camara: la vida de una unidad herida y
 * lo que le queda a un edificio que se esta capturando. Son dibujos planos (como en 2D), para que se
 * lean igual desde cualquier angulo. Las texturas se guardan por valor: hay pocas distintas.
 */
import * as THREE from 'three';

const BAR_WIDTH = 64;
const BAR_HEIGHT = 12;
const BORDER = 2;
/** Tamaño de la marca en el mundo (casillas). */
const BADGE_SCALE = new THREE.Vector2(0.5, 0.1);

/** El color de la vida: verde, amarillo o rojo segun lo que queda. */
function lifeColor(share: number): string {
  if (share > 0.6) return '#4fd36a';
  return share > 0.3 ? '#ffd447' : '#ff4d45';
}

function barTexture(share: number, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = BAR_WIDTH;
  canvas.height = BAR_HEIGHT;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = '#0b1220';
  draw.fillRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
  draw.fillStyle = color;
  draw.fillRect(BORDER, BORDER, Math.round((BAR_WIDTH - BORDER * 2) * share), BAR_HEIGHT - BORDER * 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const textures = new Map<string, THREE.CanvasTexture>();

function cachedBar(share: number, color: string): THREE.CanvasTexture {
  const key = `${Math.round(share * 100)}${color}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = barTexture(share, color);
    textures.set(key, texture);
  }
  return texture;
}

/** Una marca vacia (sin dibujo hasta que se le pone uno con `showBar`). */
export function newBadge(height: number): THREE.Sprite {
  const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  badge.scale.set(BADGE_SCALE.x, BADGE_SCALE.y, 1);
  badge.position.y = height;
  badge.renderOrder = 10;
  badge.visible = false;
  return badge;
}

/** Enseña una barra (`share` de 0 a 1) o, con null, la esconde. */
export function showBar(badge: THREE.Sprite, share: number | null, color?: string): void {
  badge.visible = share !== null;
  if (share === null) return;
  const texture = cachedBar(share, color ?? lifeColor(share));
  if (badge.material.map !== texture) {
    badge.material.map = texture;
    badge.material.needsUpdate = true;
  }
}
