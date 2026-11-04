import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../../atlas';
import type { CommandKind } from '../../core/types';
import { TILE } from '../../layout';
import { PAL, PAL_MAP } from '../palette';

/**
 * Marcas pequeñas encima del dibujo de una unidad: estrellas de veterania (arriba a la derecha),
 * "sin cura" y carga (abajo a la izquierda) e icono de la orden en automatico (arriba a la
 * izquierda), con raya naranja si va destacada de su escuadra. Con las marcas dibujadas del atlas
 * (ui/mk_*, ui/cmd_*) se usan imagenes; si faltan, se dibujan con pixeles en `g`.
 */

/** Letra (3x5 pixeles) de cada orden con destino: Capturar, Defender, Atacar. */
const MISSION_GLYPH: Record<CommandKind, [number, number][]> = {
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
const MISSION_KEY: Record<CommandKind, number> = { capture: 1, defend: 2, attack: 3 };

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
  cmd: CommandKind | null;
  /** Va destacada de su escuadra. */
  detached: boolean;
}

/** Firma de las marcas: si no cambia, no se redibujan. Rango x 16 + 1 sin cura + 2 carga + 4 x orden + 100 destacada. */
export const markSignature = (m: UnitMarkState): number =>
  m.rank * 16 + (m.noHeal ? 1 : 0) + (m.cargo ? 2 : 0) + (m.cmd ? MISSION_KEY[m.cmd] * 4 : 0) + (m.detached ? 100 : 0);

/** Objetos de una unidad donde van sus marcas. */
export interface UnitMarkObjects {
  /** Marcas de pixeles (cuando falta el dibujo). */
  stars: Phaser.GameObjects.Graphics;
  cmd: Phaser.GameObjects.Image;
  badges: Phaser.GameObjects.Image[];
}

/** Redibuja las marcas de una unidad. `markArt`: estan las marcas dibujadas (ui/mk_*). */
export function drawUnitMarks(
  textures: Phaser.Textures.TextureManager,
  objects: UnitMarkObjects,
  marks: UnitMarkState,
  markArt: boolean,
): void {
  const { noHeal, cargo, cmd, detached } = marks;
  const g = objects.stars;
  g.clear();
  const cmdKey = cmd ? `ui/cmd_${cmd}` : null;
  const hasCmdArt = !!cmdKey && hasImage(textures, cmdKey);
  objects.cmd.setVisible(hasCmdArt);
  // Icono de 16x16 arriba a la izquierda (a la derecha de la marca de carga si la lleva).
  if (hasCmdArt) objects.cmd.setTexture(ATLAS, cmdKey).setPosition(cargo && !markArt ? BADGE : 0, 0);
  if (markArt) placeDrawnBadges(objects.badges, marks);
  else objects.badges.forEach((badge) => badge.setVisible(false));
  if (cmd && detached) drawDetachedStripe(g, cargo && !markArt, hasCmdArt);
  if (cmd && !hasCmdArt) drawCommandPlaque(g, cmd, cargo);
  if (noHeal && !markArt) drawNoHealSign(g);
  if (!markArt) drawPixelStars(g, marks.rank);
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
 * `besidePixelCargo`: hay marca de carga de pixeles a la izquierda; `hasCmdArt`: el icono es dibujado.
 */
function drawDetachedStripe(g: Phaser.GameObjects.Graphics, besidePixelCargo: boolean, hasCmdArt: boolean): void {
  const x = besidePixelCargo ? (hasCmdArt ? BADGE : 12) : hasCmdArt ? 0 : 1;
  g.fillStyle(PAL.ink, 1);
  g.fillRect(x, hasCmdArt ? CMD_ICON : 10, hasCmdArt ? CMD_ICON : 9, 3);
  g.fillStyle(PAL_MAP.amber, 1);
  g.fillRect(x + 1, hasCmdArt ? CMD_ICON + 1 : 11, hasCmdArt ? CMD_ICON - 2 : 7, 1);
}

/** Placa con la letra de la mision (C, D, A) en blanco sobre verde azulado. */
function drawCommandPlaque(g: Phaser.GameObjects.Graphics, cmd: CommandKind, cargo: boolean): void {
  const x = cargo ? 12 : 1;
  const y = 1;
  g.fillStyle(PAL.ink, 1);
  g.fillRect(x, y, 9, 9);
  g.fillStyle(PAL_MAP.plaque, 1);
  g.fillRect(x + 1, y + 1, 7, 7);
  g.fillStyle(PAL.white, 1);
  for (const [dx, dy] of MISSION_GLYPH[cmd]) g.fillRect(x + 3 + dx, y + 2 + dy, 1, 1);
}

/** Señal de prohibido pequeña (sin cura): cuadrado rojo con una raya blanca, abajo a la izquierda. */
function drawNoHealSign(g: Phaser.GameObjects.Graphics): void {
  const x = 1;
  const y = TILE - 8;
  g.fillStyle(PAL.ink, 1);
  g.fillRect(x, y, 7, 7);
  g.fillStyle(PAL.red, 1);
  g.fillRect(x + 1, y + 1, 5, 5);
  g.fillStyle(PAL.white, 1);
  g.fillRect(x + 2, y + 3, 3, 1);
}

/** Una "estrella" pixel por rango: rombo dorado de 3x3 con borde oscuro, de derecha a izquierda. */
function drawPixelStars(g: Phaser.GameObjects.Graphics, rank: number): void {
  for (let i = 0; i < rank; i++) {
    const x = TILE - 5 - i * 5;
    const y = 1;
    g.fillStyle(PAL.ink, 1);
    g.fillRect(x - 1, y, 5, 5);
    g.fillStyle(PAL.gold, 1);
    g.fillRect(x, y + 1, 3, 3);
    g.fillStyle(PAL_MAP.paleGold, 1);
    g.fillRect(x + 1, y + 1, 1, 1);
  }
}
