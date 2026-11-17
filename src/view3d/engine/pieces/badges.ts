/**
 * Las marcas que flotan sobre las piezas y miran siempre a la camara: chapas con un numero (la vida de
 * una unidad herida, lo que le falta a un edificio que se esta capturando), la barra a rayas de lo
 * que perderia una unidad a la que se apunta y la letra de la orden de una unidad. Son dibujos planos (como en 2D), para que se
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

/** Lo que perderia en un ataque: rayas de rojo claro y oscuro, como en la tarjeta de la prevision. */
const LOSS_LIGHT = '#ff8a82';
const LOSS_DARK = '#6b1f1c';
const LOSS_STRIPE = 4;

/** De `after` a `share` (de 0 a 1 de la barra), las rayas de lo que perderia. */
function drawLoss(draw: CanvasRenderingContext2D, after: number, share: number): void {
  const inner = BAR_WIDTH - BORDER * 2;
  const start = BORDER + Math.round(inner * after);
  const end = BORDER + Math.round(inner * share);
  for (let x = start; x < end; x++) {
    draw.fillStyle = Math.floor((x - start) / LOSS_STRIPE) % 2 === 0 ? LOSS_LIGHT : LOSS_DARK;
    draw.fillRect(x, BORDER, 1, BAR_HEIGHT - BORDER * 2);
  }
}

function barTexture(share: number, color: string, after: number | null): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = BAR_WIDTH;
  canvas.height = BAR_HEIGHT;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = '#0b1220';
  draw.fillRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
  draw.fillStyle = color;
  draw.fillRect(BORDER, BORDER, Math.round((BAR_WIDTH - BORDER * 2) * (after ?? share)), BAR_HEIGHT - BORDER * 2);
  if (after !== null) drawLoss(draw, after, share);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const textures = new Map<string, THREE.CanvasTexture>();

function cachedBar(share: number, color: string, after: number | null = null): THREE.CanvasTexture {
  const key = `${Math.round(share * 100)}${color}${after === null ? '' : `-${Math.round(after * 100)}`}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = barTexture(share, color, after);
    textures.set(key, texture);
  }
  return texture;
}

/** Pone esa textura en la marca (si no la tiene ya) y la enseña. */
function paint(badge: THREE.Sprite, texture: THREE.CanvasTexture, scale: THREE.Vector2): void {
  badge.visible = true;
  badge.scale.set(scale.x, scale.y, 1);
  if (badge.material.map !== texture) {
    badge.material.map = texture;
    badge.material.needsUpdate = true;
  }
}

/** La barra de vida con lo que perderia en un ataque: lo que le quedaria en su color y lo demas, a rayas. */
export function showLoss(badge: THREE.Sprite, share: number, after: number): void {
  paint(badge, cachedBar(share, lifeColor(after), Math.min(after, share)), BADGE_SCALE);
}

/** Una marca vacia (sin dibujo hasta que se le pone uno con `showBar`, `showNumber`...). */
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
  if (share !== null) paint(badge, cachedBar(share, color ?? lifeColor(share)), BADGE_SCALE);
}

/** La chapa de un numero: un poco mas ancha que alta, del color que se le diga y el numero en blanco con tinta. */
const CHIP_WIDTH = 40;
const CHIP_HEIGHT = 26;
const CHIP_FONT = "bold 20px 'Silkscreen', monospace";
/** Tamaño de la chapa en el mundo (casillas): se lee de lejos sin tapar la pieza. */
const CHIP_SCALE = new THREE.Vector2(0.3, 0.195);
const CHIP_INK = '#2b2240';
const CHIP_TEXT = '#ffffff';

function chipTexture(text: string, fill: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CHIP_WIDTH;
  canvas.height = CHIP_HEIGHT;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = CHIP_INK;
  draw.fillRect(0, 0, CHIP_WIDTH, CHIP_HEIGHT);
  draw.fillStyle = fill;
  draw.fillRect(BORDER, BORDER, CHIP_WIDTH - BORDER * 2, CHIP_HEIGHT - BORDER * 2);
  draw.font = CHIP_FONT;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.lineWidth = 4;
  draw.strokeStyle = CHIP_INK;
  draw.strokeText(text, CHIP_WIDTH / 2, CHIP_HEIGHT / 2 + 1);
  draw.fillStyle = CHIP_TEXT;
  draw.fillText(text, CHIP_WIDTH / 2, CHIP_HEIGHT / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cachedChip(text: string, fill: string): THREE.CanvasTexture {
  const key = `chip:${text}${fill}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = chipTexture(text, fill);
    textures.set(key, texture);
  }
  return texture;
}

/** Enseña una chapa con ese numero (null: la esconde), del color `fill`. */
export function showNumber(badge: THREE.Sprite, value: number | null, fill: string): void {
  badge.visible = value !== null;
  if (value !== null) paint(badge, cachedChip(String(value), fill), CHIP_SCALE);
}

/**
 * La chapa de la captura de un edificio, a la izquierda: encima esta la unidad que lo captura, con su
 * chapa de vida en el centro (y la letra de su orden a la derecha).
 */
export function newCaptureBadge(height: number): THREE.Sprite {
  const badge = newBadge(height);
  badge.position.x = -CAPTURE_SIDE;
  return badge;
}

/** Lo que se aparta la chapa de la captura a la izquierda (lo mismo que la letra a la derecha). */
const CAPTURE_SIDE = 0.34;

/** La vida de una unidad herida en su chapa (verde, amarilla o roja segun lo que le queda; null: entera). */
export function showLife(badge: THREE.Sprite, life: number | null, share: number): void {
  showNumber(badge, life, lifeColor(share));
}

const LETTER_PIXELS = 32;
const LETTER_FONT = "bold 22px 'Silkscreen', monospace";
/** Tamaño de la letra en el mundo (casillas) y lo que se aparta a la derecha de la barra de vida. */
const LETTER_SCALE = 0.24;
const LETTER_SIDE = 0.34;
const LETTER_COLOR = '#ffd447';
const LETTER_INK = '#0b1220';

function letterTexture(letter: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LETTER_PIXELS;
  canvas.height = LETTER_PIXELS;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = LETTER_INK;
  draw.fillRect(0, 0, LETTER_PIXELS, LETTER_PIXELS);
  draw.fillStyle = LETTER_COLOR;
  draw.fillRect(BORDER, BORDER, LETTER_PIXELS - BORDER * 2, LETTER_PIXELS - BORDER * 2);
  draw.font = LETTER_FONT;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.fillStyle = LETTER_INK;
  draw.fillText(letter, LETTER_PIXELS / 2, LETTER_PIXELS / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cachedLetter(letter: string): THREE.CanvasTexture {
  const key = `letter:${letter}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = letterTexture(letter);
    textures.set(key, texture);
  }
  return texture;
}

/** La marca de la letra de la orden, a la altura de la barra de vida y a su derecha. */
export function newLetterBadge(height: number): THREE.Sprite {
  const badge = newBadge(height);
  badge.scale.set(LETTER_SCALE, LETTER_SCALE, 1);
  badge.position.x = LETTER_SIDE;
  return badge;
}

/** Enseña esa letra o, con null, la esconde. */
export function showLetter(badge: THREE.Sprite, letter: string | null): void {
  badge.visible = letter !== null;
  if (letter !== null) paint(badge, cachedLetter(letter), new THREE.Vector2(LETTER_SCALE, LETTER_SCALE));
}
