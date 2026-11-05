import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../../atlas';
import type { StandingOrderKind } from '../../core/model';
import { TILE } from '../../layout';
import { PAL, PAL_MAP } from '../palette';

/**
 * Marcas pequeñas encima del dibujo de una unidad: estrellas de veterania (arriba a la derecha),
 * "sin cura" y carga (abajo a la izquierda) e icono de la orden en automatico (arriba a la
 * izquierda), con raya naranja si va destacada de su escuadra. Con las marcas dibujadas del atlas
 * (ui/mk_*, ui/cmd_*) se usan imagenes; si faltan, se dibujan con pixeles en `g`.
 */

/** Letra (3x5 pixeles) de cada orden con destino: Capturar, Defender, Atacar. */
const MISSION_GLYPH: Record<StandingOrderKind, [number, number][]> = {
  capture: [
    [1, 0],
    [2, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 4],
    [2, 4],
  ],
  defend: [
    [0, 0],
    [1, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
    [0, 3],
    [2, 3],
    [0, 4],
    [1, 4],
  ],
  attack: [
    [1, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
    [2, 3],
    [0, 4],
    [2, 4],
  ],
};
const MISSION_KEY: Record<StandingOrderKind, number> = { capture: 1, defend: 2, attack: 3 };

/** Marcas dibujadas: tamaño de la de carga y sin cura, de cada estrella, y paso entre estrellas. */
const BADGE = 10;
const STAR = 8;
const STAR_STEP = 7;
/** Icono dibujado de la orden (cuadrado). */
const CMD_ICON = 16;
/** Cuantas imagenes de marca lleva cada unidad (sin cura + carga + 3 estrellas). */
export const BADGE_SLOTS = 5;

/** Lo que enseñan las marcas de una unidad. */
export interface UnitMarkState {
  rank: number;
  noHeal: boolean;
  cargo: boolean;
  /** Orden que cumple (la suya o la de su escuadra). */
  order: StandingOrderKind | null;
  /** Va destacada de su escuadra. */
  detached: boolean;
}

/** Firma de las marcas: si no cambia, no se redibujan. Rango x 16 + 1 sin cura + 2 carga + 4 x orden + 100 destacada. */
export const markSignature = (unitMarkState: UnitMarkState): number =>
  unitMarkState.rank * 16 +
  (unitMarkState.noHeal ? 1 : 0) +
  (unitMarkState.cargo ? 2 : 0) +
  (unitMarkState.order ? MISSION_KEY[unitMarkState.order] * 4 : 0) +
  (unitMarkState.detached ? 100 : 0);

/** Objetos de una unidad donde van sus marcas. */
export interface UnitMarkObjects {
  /** Marcas de pixeles (cuando falta el dibujo). */
  stars: Phaser.GameObjects.Graphics;
  order: Phaser.GameObjects.Image;
  badges: Phaser.GameObjects.Image[];
}

/** Redibuja las marcas de una unidad. `markArt`: estan las marcas dibujadas (ui/mk_*). */
export function drawUnitMarks(
  textures: Phaser.Textures.TextureManager,
  objects: UnitMarkObjects,
  marks: UnitMarkState,
  markArt: boolean,
): void {
  const { noHeal, cargo, order, detached } = marks;
  const graphics = objects.stars;
  graphics.clear();
  const orderIcon = order ? `ui/cmd_${order}` : null;
  const hasOrderArt = !!orderIcon && hasImage(textures, orderIcon);
  objects.order.setVisible(hasOrderArt);
  // Icono de 16x16 arriba a la izquierda (a la derecha de la marca de carga si la lleva).
  if (hasOrderArt) objects.order.setTexture(ATLAS, orderIcon).setPosition(cargo && !markArt ? BADGE : 0, 0);
  if (markArt) placeDrawnBadges(objects.badges, marks);
  else objects.badges.forEach((badge) => badge.setVisible(false));
  if (order && detached) drawDetachedStripe(graphics, cargo && !markArt, hasOrderArt);
  if (order && !hasOrderArt) drawOrderPlaque(graphics, order, cargo);
  if (noHeal && !markArt) drawNoHealSign(graphics);
  if (!markArt) drawPixelStars(graphics, marks.rank);
}

/** Abajo a la izquierda: sin cura y carga (10x10); arriba a la derecha: una estrella (8x8) por rango. */
function placeDrawnBadges(badges: Phaser.GameObjects.Image[], { rank, noHeal, cargo }: UnitMarkState): void {
  const placed: { key: string; x: number; y: number }[] = [];
  if (noHeal) placed.push({ key: 'ui/mk_noheal', x: 0, y: TILE - BADGE });
  if (cargo) placed.push({ key: 'ui/mk_cargo', x: noHeal ? BADGE : 0, y: TILE - BADGE });
  for (let i = 0; i < rank; i++) placed.push({ key: 'ui/mk_star', x: TILE - STAR - i * STAR_STEP, y: 0 });
  badges.forEach((badge, i) => {
    const mark = placed[i];
    badge.setVisible(!!mark);
    if (mark) badge.setTexture(ATLAS, mark.key).setPosition(mark.x, mark.y);
  });
}

/**
 * Destacada: raya naranja bajo la placa de la orden (va por su cuenta y luego vuelve).
 * `besidePixelCargo`: hay marca de carga de pixeles a la izquierda; `hasOrderArt`: el icono es dibujado.
 */
function drawDetachedStripe(graphics: Phaser.GameObjects.Graphics, besidePixelCargo: boolean, hasOrderArt: boolean): void {
  const left = besidePixelCargo ? (hasOrderArt ? BADGE : 12) : hasOrderArt ? 0 : 1;
  graphics.fillStyle(PAL.ink, 1);
  graphics.fillRect(left, hasOrderArt ? CMD_ICON : 10, hasOrderArt ? CMD_ICON : 9, 3);
  graphics.fillStyle(PAL_MAP.amber, 1);
  graphics.fillRect(left + 1, hasOrderArt ? CMD_ICON + 1 : 11, hasOrderArt ? CMD_ICON - 2 : 7, 1);
}

/** Placa con la letra de la mision (C, D, A) en blanco sobre verde azulado. */
function drawOrderPlaque(graphics: Phaser.GameObjects.Graphics, order: StandingOrderKind, cargo: boolean): void {
  const left = cargo ? 12 : 1;
  const y = 1;
  graphics.fillStyle(PAL.ink, 1);
  graphics.fillRect(left, y, 9, 9);
  graphics.fillStyle(PAL_MAP.plaque, 1);
  graphics.fillRect(left + 1, y + 1, 7, 7);
  graphics.fillStyle(PAL.white, 1);
  for (const [dx, dy] of MISSION_GLYPH[order]) graphics.fillRect(left + 3 + dx, y + 2 + dy, 1, 1);
}

/** Señal de prohibido pequeña (sin cura): cuadrado rojo con una raya blanca, abajo a la izquierda. */
function drawNoHealSign(graphics: Phaser.GameObjects.Graphics): void {
  const left = 1;
  const y = TILE - 8;
  graphics.fillStyle(PAL.ink, 1);
  graphics.fillRect(left, y, 7, 7);
  graphics.fillStyle(PAL.red, 1);
  graphics.fillRect(left + 1, y + 1, 5, 5);
  graphics.fillStyle(PAL.white, 1);
  graphics.fillRect(left + 2, y + 3, 3, 1);
}

/** Una "estrella" pixel por rango: rombo dorado de 3x3 con borde oscuro, de derecha a izquierda. */
function drawPixelStars(graphics: Phaser.GameObjects.Graphics, rank: number): void {
  for (let i = 0; i < rank; i++) {
    const x = TILE - 5 - i * 5;
    const y = 1;
    graphics.fillStyle(PAL.ink, 1);
    graphics.fillRect(x - 1, y, 5, 5);
    graphics.fillStyle(PAL.gold, 1);
    graphics.fillRect(x, y + 1, 3, 3);
    graphics.fillStyle(PAL_MAP.paleGold, 1);
    graphics.fillRect(x + 1, y + 1, 1, 1);
  }
}
