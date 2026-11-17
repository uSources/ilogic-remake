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

/** La vida en tramos: una chapa con el porcentaje y, debajo, diez tramos (como en Advance Wars). */
const LIFE_WIDTH = 64;
const LIFE_HEIGHT = 36;
const LIFE_LABEL_HEIGHT = 22;
const LIFE_FONT = "bold 18px 'Silkscreen', monospace";
/** Tamaño de la marca de vida en el mundo (casillas). */
const LIFE_SCALE = new THREE.Vector2(0.36, 0.2025);
const PIP_COUNT = 10;
const PIP_WIDTH = 5;
const PIP_GAP = 1;
const PIP_LEFT = 2;
const PIP_BOX_TOP = LIFE_LABEL_HEIGHT + 2;
const PIP_BOX_HEIGHT = 12;
const PIP_TOP = PIP_BOX_TOP + 2;
const PIP_HEIGHT = 8;
const PIP_EMPTY = '#1e2638';
const PIP_STRIPE = 2;
/** Lo que se acaba de perder, en blanco: brilla y se encoge hasta la vida nueva (como en Advance Wars). */
const PIP_FLASH = '#ffffff';

/** Como se dibuja lo perdido: a rayas (lo que perderia, al apuntar) o en blanco (lo que acaba de perder). */
type LossLook = 'stripes' | 'flash';
const LIFE_BACK = '#0b1220';

/** Cuánto del tramo `index` cubre la vida `level` (de 0 a 1): 0 vacío, 1 lleno, entre medias parcial. */
function pipFill(level: number, index: number): number {
  return Math.min(1, Math.max(0, level * PIP_COUNT - index));
}

/** Un tramo: lo que queda en su color y, de `after` a `share`, lo que perderia a rayas. */
function drawPip(draw: CanvasRenderingContext2D, index: number, life: PipLife): void {
  const left = PIP_LEFT + index * (PIP_WIDTH + PIP_GAP);
  const shareWidth = Math.round(PIP_WIDTH * pipFill(life.share, index));
  const afterWidth = Math.round(PIP_WIDTH * pipFill(life.after ?? life.share, index));
  draw.fillStyle = PIP_EMPTY;
  draw.fillRect(left, PIP_TOP, PIP_WIDTH, PIP_HEIGHT);
  if (life.loss === 'flash') drawFlash(draw, left + afterWidth, shareWidth - afterWidth);
  else drawStripes(draw, left + afterWidth, shareWidth - afterWidth);
  draw.fillStyle = life.color;
  draw.fillRect(left, PIP_TOP, afterWidth, PIP_HEIGHT);
}

/** Lo que pintan los tramos: la vida (`share`), lo que quedaria o queda (`after`), su color y como se ve lo perdido. */
interface PipLife {
  share: number;
  after: number | null;
  color: string;
  loss: LossLook;
}

function drawStripes(draw: CanvasRenderingContext2D, left: number, width: number): void {
  for (let x = 0; x < width; x++) {
    draw.fillStyle = Math.floor(x / PIP_STRIPE) % 2 === 0 ? LOSS_LIGHT : LOSS_DARK;
    draw.fillRect(left + x, PIP_TOP, 1, PIP_HEIGHT);
  }
}

function drawFlash(draw: CanvasRenderingContext2D, left: number, width: number): void {
  draw.fillStyle = PIP_FLASH;
  draw.fillRect(left, PIP_TOP, width, PIP_HEIGHT);
}

/** La chapa con el porcentaje (en blanco con tinta, sobre su color). */
function drawLifeLabel(draw: CanvasRenderingContext2D, label: string, color: string): void {
  draw.fillStyle = CHIP_INK;
  draw.fillRect(0, 0, LIFE_WIDTH, LIFE_LABEL_HEIGHT);
  draw.fillStyle = color;
  draw.fillRect(BORDER, BORDER, LIFE_WIDTH - BORDER * 2, LIFE_LABEL_HEIGHT - BORDER * 2);
  draw.font = LIFE_FONT;
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.lineWidth = 4;
  draw.strokeStyle = CHIP_INK;
  draw.strokeText(label, LIFE_WIDTH / 2, LIFE_LABEL_HEIGHT / 2 + 1);
  draw.fillStyle = CHIP_TEXT;
  draw.fillText(label, LIFE_WIDTH / 2, LIFE_LABEL_HEIGHT / 2 + 1);
}

function lifeTexture(label: string, life: PipLife): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LIFE_WIDTH;
  canvas.height = LIFE_HEIGHT;
  const draw = canvas.getContext('2d')!;
  drawLifeLabel(draw, label, life.color);
  draw.fillStyle = LIFE_BACK;
  draw.fillRect(0, PIP_BOX_TOP, LIFE_WIDTH, PIP_BOX_HEIGHT);
  for (let index = 0; index < PIP_COUNT; index++) drawPip(draw, index, life);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cachedLife(label: string, life: PipLife): THREE.CanvasTexture {
  const afterKey = life.after === null ? '' : `-${Math.round(life.after * 100)}`;
  const key = `life:${label}:${Math.round(life.share * 100)}${afterKey}:${life.color}:${life.loss}`;
  let texture = textures.get(key);
  if (!texture) {
    texture = lifeTexture(label, life);
    textures.set(key, texture);
  }
  return texture;
}

/** La vida de una unidad a la que se apunta: lo que le quedaria, con sus tramos a rayas de lo que perderia. */
export function showLoss(badge: THREE.Sprite, share: number, after: number): void {
  const life: PipLife = { share, after, color: lifeColor(after), loss: 'stripes' };
  paint(badge, cachedLife(`${Math.ceil(after * 100)}%`, life), LIFE_SCALE);
}

/**
 * La vida que acaba de perder: lo que le queda (`after`) en su color y, hasta `shown`, lo perdido en
 * blanco; el porcentaje dice `shown`, que va bajando hasta `after` (de 0 a 1).
 */
export function showLifeDrop(badge: THREE.Sprite, shown: number, after: number): void {
  const life: PipLife = { share: shown, after, color: lifeColor(after), loss: 'flash' };
  paint(badge, cachedLife(`${Math.ceil(shown * 100)}%`, life), LIFE_SCALE);
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

/** La vida de una unidad herida en tramos y porcentaje (verde, amarilla o roja segun lo que le queda; null: entera). */
export function showLife(badge: THREE.Sprite, life: number | null, share: number): void {
  badge.visible = life !== null;
  if (life !== null) paint(badge, cachedLife(`${life}%`, { share, after: null, color: lifeColor(share), loss: 'stripes' }), LIFE_SCALE);
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
